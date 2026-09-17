import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../scripts/publish.mjs';

const revision = (version, state) => ({ state, distributionChannels: [{ crxVersion: version }] });
const baseline = { publishedItemRevisionStatus: revision('1.0.0', 'PUBLISHED') };
function harness(responses, overrides = {}) {
  const calls = [];
  return {
    calls,
    run: () => publish({
      publisherId: 'publisher', extensionId: 'extension', token: 'secret-token',
      version: '1.0.1', archive: Buffer.from('zip'), maxPolls: 2, sleep: async () => {},
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options });
        assert.ok(responses.length, 'Unexpected API request');
        const response = responses.shift();
        return { ok: !response.error, status: response.error ? 400 : 200, json: async () => response };
      }, ...overrides,
    }),
  };
}

test('uploads ZIP and submits for automatic publication after approval', async () => {
  const h = harness([baseline, { uploadState: 'SUCCEEDED', crxVersion: '1.0.1' }, { state: 'PENDING_REVIEW' }]);
  assert.match(await h.run(), /PENDING_REVIEW/);
  assert.equal(h.calls.length, 3);
  assert.match(h.calls[1].url, /\/upload\/v2\/publishers\/publisher\/items\/extension:upload$/);
  assert.equal(h.calls[1].headers['Content-Type'], 'application/zip');
  assert.equal(h.calls[1].headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(h.calls[2].body), { publishType: 'DEFAULT_PUBLISH', skipReview: false });
});

for (const state of ['IN_PROGRESS', 'UPLOAD_IN_PROGRESS']) {
  test(`polls asynchronous ${state} before submitting`, async () => {
    const h = harness([baseline, { uploadState: state }, { lastAsyncUploadState: 'SUCCEEDED' }, { state: 'PENDING_REVIEW' }]);
    await h.run();
    assert.match(h.calls[2].url, /:fetchStatus$/);
    assert.match(h.calls[3].url, /:publish$/);
  });
}

for (const state of ['FAILED', 'NOT_FOUND', 'IN_PROGRESS']) {
  test(`does not publish after processing ${state}`, async () => {
    const h = harness([baseline, { uploadState: 'IN_PROGRESS' }, { lastAsyncUploadState: state }, { lastAsyncUploadState: state }]);
    await assert.rejects(h.run(), /Upload did not succeed/);
    assert.ok(h.calls.every(call => !call.url.endsWith(':publish')));
  });
}

for (const [field, state] of [['publishedItemRevisionStatus', 'PUBLISHED'], ['submittedItemRevisionStatus', 'PENDING_REVIEW']]) {
  test(`rerun skips matching ${state} version`, async () => {
    const h = harness([{ ...baseline, [field]: revision('1.0.1', state) }]);
    assert.match(await h.run(), /already/);
    assert.equal(h.calls.length, 1);
  });
}

test('retry after upload reuploads tagged package rather than trusting an unknown draft', async () => {
  const h = harness([{ ...baseline, lastAsyncUploadState: 'SUCCEEDED' }, { uploadState: 'SUCCEEDED', crxVersion: '1.0.1' }, { state: 'PENDING_REVIEW' }]);
  await h.run();
  assert.match(h.calls[1].url, /:upload$/);
});

for (const status of [
  { submittedItemRevisionStatus: revision('1.0.2', 'PENDING_REVIEW') },
  { submittedItemRevisionStatus: revision('1.0.1', 'REJECTED') },
  { submittedItemRevisionStatus: revision('1.0.1', 'CANCELLED') },
  { submittedItemRevisionStatus: revision('1.0.1', 'STAGED') },
  { publishedItemRevisionStatus: revision('1.0.2', 'PUBLISHED') },
  { lastAsyncUploadState: 'IN_PROGRESS' },
  { takenDown: true },
]) {
  test(`stops before upload on conflict ${JSON.stringify(status)}`, async () => {
    const h = harness([{ ...baseline, ...status }]);
    await assert.rejects(h.run());
    assert.equal(h.calls.length, 1);
  });
}

test('API failures are surfaced and credentials redacted', async () => {
  const h = harness([baseline, { error: { message: 'bad secret-token' } }]);
  await assert.rejects(h.run(), error => /400/.test(error.message) && !error.message.includes('secret-token'));
  assert.equal(h.calls.length, 2);
});

test('wrong uploaded version is never submitted', async () => {
  const h = harness([baseline, { uploadState: 'SUCCEEDED', crxVersion: '1.0.2' }]);
  await assert.rejects(h.run(), /does not match/);
  assert.equal(h.calls.length, 2);
});

test('publish failure and unexpected states fail the workflow', async () => {
  for (const response of [{ error: { message: 'Review conflict' } }, { state: 'REJECTED' }]) {
    await assert.rejects(harness([baseline, { uploadState: 'SUCCEEDED' }, response]).run());
  }
});

test('missing credentials fail before network access', async () => {
  const h = harness([], { token: '' });
  await assert.rejects(h.run(), /Missing token/);
  assert.equal(h.calls.length, 0);
});
