import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseVersion } from './version.mjs';

const version = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
parseVersion(version);
if (process.env.GITHUB_REF !== `refs/tags/v${version}`) {
  throw new Error('Release tag must be vX.Y.Z and match manifest.json.');
}
execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
console.log(`Validated v${version} on main.`);
