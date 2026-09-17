import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseVersion, compareVersions } from './version.mjs';

export async function publish({ publisherId, extensionId, token, version, archive,
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxPolls = 60 }) {
  parseVersion(version);
  for (const [key, value] of Object.entries({ publisherId, extensionId, token })) {
    if (!value) throw new Error(`Missing ${key}; complete the release setup.`);
  }
  const name = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  const base = `https://chromewebstore.googleapis.com/v2/${name}`;
  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(`Chrome Web Store request failed (${response.status}): ${JSON.stringify(body).replaceAll(token, '[redacted]')}`);
    }
    return body;
  }
  const status = await request(`${base}:fetchStatus`);
  if (status.takenDown) throw new Error('Item is taken down; resolve this in the developer dashboard.');
  const published = status.publishedItemRevisionStatus;
  const submitted = status.submittedItemRevisionStatus;
  const versions = revision => (revision?.distributionChannels || []).map(channel => channel.crxVersion);
  if (versions(published).some(v => compareVersions(v, version) > 0)) {
    throw new Error('A newer version is already published.');
  }
  if (versions(published).includes(version) && published.state === 'PUBLISHED') {
    return `v${version} is already published.`;
  }
  if (submitted) {
    if (versions(submitted).includes(version) && ['PENDING_REVIEW', 'PUBLISHED'].includes(submitted.state)) {
      return `v${version} is already submitted (${submitted.state}).`;
    }
    throw new Error(`Existing submission (${submitted.state}) requires attention in the developer dashboard; no upload performed.`);
  }
  if (['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(status.lastAsyncUploadState)) {
    throw new Error('Another upload is processing. Wait and rerun this workflow.');
  }
  // fetchStatus does not expose an unsubmitted draft's version. Upload our exact
  // tagged package again on retry instead of publishing an unverified draft.
  const uploaded = await request(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: archive,
  });
  if (uploaded.crxVersion && uploaded.crxVersion !== version) throw new Error('Uploaded version does not match the release.');
  let state = uploaded.uploadState;
  for (let poll = 0; ['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(state) && poll < maxPolls; poll++) {
    await sleep(10000);
    state = (await request(`${base}:fetchStatus`)).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Upload did not succeed (${state}); inspect the dashboard before retrying.`);
  const result = await request(`${base}:publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false }),
  });
  if (!['PENDING_REVIEW', 'PUBLISHED'].includes(result.state)) {
    throw new Error(`Unexpected submission state: ${result.state}. Check the developer dashboard.`);
  }
  return `v${version}: ${result.state}. Chrome publishes automatically after approval.${result.warningInfo ? ` Warnings: ${JSON.stringify(result.warningInfo)}` : ''}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const version = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
    const message = await publish({
      publisherId: process.env.CWS_PUBLISHER_ID, extensionId: process.env.CWS_EXTENSION_ID,
      token: process.env.CWS_ACCESS_TOKEN, version,
      archive: readFileSync(`dist/xchange-${version}.zip`),
    });
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  } catch (error) {
    console.error(error.message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Publishing failed. Check the failed step and Chrome Web Store dashboard before retrying.\n');
    process.exitCode = 1;
  }
}
