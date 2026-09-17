export function parseVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a major.minor.patch version: ${version}`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535) || parts.every(part => part === 0)) {
    throw new Error(`Version is outside Chrome's numeric limits: ${version}`);
  }
  return parts;
}

export function nextVersion(version, level) {
  const index = ['major', 'minor', 'patch'].indexOf(level);
  if (index < 0) throw new Error('Usage: ./scripts/release.sh patch|minor|major');
  const parts = parseVersion(version);
  parts[index]++;
  parts.fill(0, index + 1);
  const next = parts.join('.');
  parseVersion(next);
  return next;
}

export function compareVersions(a, b) {
  // Store versions may have one to four numeric components.
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
