import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { nextVersion, compareVersions } from './version.mjs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

try {
  if (process.argv.length !== 3) throw new Error('Usage: ./scripts/release.sh patch|minor|major');
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const version = nextVersion(manifest.version, process.argv[2]);
  const tag = `v${version}`;
  if (git('branch', '--show-current') !== 'main') throw new Error('Release from main.');
  if (git('status', '--porcelain')) throw new Error('Commit or stash changes before releasing.');
  git('fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main', '--tags');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
    throw new Error('main must match origin/main. Pull or push your changes first.');
  }
  for (const existing of git('tag', '--list', 'v*').split('\n').filter(Boolean)) {
    if (/^v\d+\.\d+\.\d+$/.test(existing) && compareVersions(existing.slice(1), version) >= 0) {
      throw new Error(`Tag ${existing} already reserves this or a newer version.`);
    }
  }
  execFileSync(process.execPath, ['--test'], { stdio: 'inherit' });
  manifest.version = version;
  writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  git('add', '--', 'manifest.json');
  git('commit', '-m', `Release ${tag}`, '--', 'manifest.json');
  git('tag', '-a', tag, '-m', `Release ${tag}`);
  try {
    git('push', '--atomic', 'origin', 'HEAD:refs/heads/main', `refs/tags/${tag}`);
  } catch {
    throw new Error(`Push failed; local release commit and ${tag} are preserved. After resolving the remote error, retry: git push --atomic origin HEAD:refs/heads/main refs/tags/${tag}`);
  }
  console.log(`Pushed ${tag}. Follow the Publish workflow in GitHub Actions.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
