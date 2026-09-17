#!/usr/bin/env bash
set -euo pipefail

# Resolve the project directory so the script also works from another directory.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

for command in node zip unzip; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

version=$(node -e '
  const { version } = require("./manifest.json");
  if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
    throw new Error("Invalid manifest version");
  }
  process.stdout.write(version);
')

# Keep an explicit list to exclude tests, docs, and original artwork.
files=(
  manifest.json
  background.js
  content.js
  parser.js
  currencies.js
  popup.html
  popup.js
  popup.css
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  icons/icon-128.png
)
for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    printf 'Missing extension file: %s\n' "$file" >&2
    exit 1
  fi
done

mkdir -p dist
archive="dist/xchange-${version}.zip"
temporary=$(mktemp dist/.xchange.XXXXXX)
trap 'rm -f -- "$temporary"' EXIT

# Build a fresh archive rather than updating an old ZIP with stale entries.
zip -q -X - "${files[@]}" > "$temporary"
unzip -tq "$temporary"
mv -f -- "$temporary" "$archive"
printf 'Created %s/%s\n' "$PWD" "$archive"
