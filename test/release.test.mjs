import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextVersion, parseVersion } from '../scripts/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'xchange-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  const remote = join(dir, 'remote.git');
  mkdirSync(repo);
  // Isolate tests from global hooks, signing and credential settings.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  delete env.NODE_TEST_CONTEXT;
  const git = (...args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(repo, 'scripts'));
  for (const file of ['release.sh', 'release.mjs', 'version.mjs', 'validate-release.mjs']) {
    cpSync(join(root, 'scripts', file), join(repo, 'scripts', file));
  }
  writeFileSync(join(repo, 'manifest.json'), '{"version":"1.2.3"}\n');
  mkdirSync(join(repo, 'test'));
  writeFileSync(join(repo, 'test', 'smoke.test.js'), "require('node:test')('passes', () => {});\n");
  git('add', '.');
  git('commit', '-m', 'Initial');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  const release = (...args) => spawnSync('bash', ['scripts/release.sh', ...args], { cwd: repo, env, encoding: 'utf8' });
  return { repo, remote, env, git, release };
}

test('version bumps reset lower components and enforce Chrome limits', () => {
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
  for (const version of ['01.2.3', '1.2', '0.0.0', '1.2.65536', '1.2.3-beta']) {
    assert.throws(() => parseVersion(version));
  }
  assert.throws(() => nextVersion('1.2.65535', 'patch'));
  assert.throws(() => nextVersion('1.2.3', 'invalid'));
});

for (const [level, version] of [['patch', '1.2.4'], ['minor', '1.3.0'], ['major', '2.0.0']]) {
  test(`release ${level} commits and atomically pushes an annotated tag`, t => {
    const { repo, git, release } = fixture(t);
    const result = release(level);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(repo, 'manifest.json'))).version, version);
    assert.equal(git('cat-file', '-t', `v${version}`), 'tag');
    assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', `v${version}^{commit}`));
    assert.equal(git('ls-remote', 'origin', 'refs/heads/main').split('\t')[0], git('rev-parse', 'HEAD'));
    assert.ok(git('ls-remote', 'origin', `refs/tags/v${version}`));
    assert.equal(git('status', '--porcelain'), '');
  });
}

for (const scenario of ['dirty', 'branch', 'ahead', 'duplicate', 'tests', 'argument']) {
  test(`release rejects ${scenario} without bumping or pushing`, t => {
    const { repo, git, release } = fixture(t);
    if (scenario === 'dirty') writeFileSync(join(repo, 'extra.txt'), 'dirty');
    if (scenario === 'branch') git('switch', '-c', 'feature');
    if (scenario === 'ahead') git('commit', '--allow-empty', '-m', 'Unpushed');
    if (scenario === 'duplicate') git('tag', 'v1.2.4');
    if (scenario === 'tests') {
      writeFileSync(join(repo, 'test', 'smoke.test.js'), "require('node:test')('fails', () => { throw Error('failure'); });\n");
      git('add', '.');
      git('commit', '-m', 'Failing test');
      git('push');
    }
    const before = git('rev-parse', 'HEAD');
    const result = release(scenario === 'argument' ? 'invalid' : 'patch');
    assert.notEqual(result.status, 0);
    assert.equal(git('rev-parse', 'HEAD'), before);
    assert.equal(JSON.parse(readFileSync(join(repo, 'manifest.json'))).version, '1.2.3');
  });
}

test('atomic push rejection preserves local release and leaves both remote refs unchanged', t => {
  const { repo, remote, git, release } = fixture(t);
  const before = git('rev-parse', 'HEAD');
  writeFileSync(join(remote, 'hooks', 'update'), '#!/bin/sh\ncase "$1" in refs/tags/*) exit 1;; esac\n', { mode: 0o755 });
  const result = release('patch');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local release commit and v1.2.4 are preserved/);
  assert.equal(git('rev-parse', 'v1.2.4^{commit}'), git('rev-parse', 'HEAD'));
  assert.notEqual(git('rev-parse', 'HEAD'), before);
  assert.equal(git('ls-remote', 'origin', 'refs/heads/main').split('\t')[0], before);
  assert.equal(git('ls-remote', 'origin', 'refs/tags/v1.2.4'), '');
  assert.equal(JSON.parse(readFileSync(join(repo, 'manifest.json'))).version, '1.2.4');
});

test('CI rejects mismatched tags and commits outside main', t => {
  const { repo, git, env } = fixture(t);
  const validate = ref => spawnSync(process.execPath, ['scripts/validate-release.mjs'], {
    cwd: repo, env: { ...env, GITHUB_REF: ref }, encoding: 'utf8',
  });
  assert.equal(validate('refs/tags/v1.2.3').status, 0);
  assert.notEqual(validate('refs/tags/v1.2.4').status, 0);
  assert.notEqual(validate('refs/tags/v1.2.3-extra').status, 0);
  git('switch', '-c', 'feature');
  git('commit', '--allow-empty', '-m', 'Outside main');
  assert.notEqual(validate('refs/tags/v1.2.3').status, 0);
});
