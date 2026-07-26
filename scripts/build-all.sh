#!/bin/bash
# Build extension for all browsers
# Chrome/Edge: clean Plasmo manifest
# Firefox: patched with gecko-specific fields

set -e
cd "$(dirname "$0")/.."

echo "=== Building with Plasmo ==="
npx plasmo build

echo ""
echo "=== Verifying Chrome/Edge build ==="
node scripts/verify-build.js chrome

echo ""
echo "=== Refreshing unpacked Chrome extension ==="
rsync -a --delete build/chrome-mv3-prod/ ai-chat-exporter/
node scripts/verify-build.js unpacked

echo ""
echo "=== Creating Chrome/Edge ZIP (clean manifest) ==="
cd build/chrome-mv3-prod
rm -f ../../ai-chat-exporter.zip
zip -r ../../ai-chat-exporter.zip . > /dev/null
echo "Chrome/Edge: $(ls -lh ../../ai-chat-exporter.zip | awk '{print $5}')"

echo ""
echo "=== Applying Firefox patches ==="
cd ../..
node scripts/patch-firefox-manifest.js
node scripts/verify-build.js firefox

echo ""
echo "=== Creating Firefox ZIP (patched manifest) ==="
cd build/chrome-mv3-prod
rm -f ../../ai-chat-exporter-firefox.zip
zip -r ../../ai-chat-exporter-firefox.zip . > /dev/null
echo "Firefox: $(ls -lh ../../ai-chat-exporter-firefox.zip | awk '{print $5}')"

# Source packaging uses repository-relative paths and the selected ref's metadata.
cd ../..

echo ""
echo "=== Creating source archive from tracked Git content ==="
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Cannot create source archive: build must run inside a Git working tree." >&2
  exit 1
fi
SOURCE_ARCHIVE_REF="${SOURCE_ARCHIVE_REF:-HEAD}"
PACKAGE_VERSION="$(git show "${SOURCE_ARCHIVE_REF}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"
SOURCE_ARCHIVE_PREFIX="ai-chat-exporter-${PACKAGE_VERSION}-source/"
rm -f ai-chat-exporter-source.zip
git archive \
  --format=zip \
  --prefix="${SOURCE_ARCHIVE_PREFIX}" \
  "${SOURCE_ARCHIVE_REF}" \
  -o ai-chat-exporter-source.zip
bash scripts/verify-source-archive.sh \
  ai-chat-exporter-source.zip \
  "${PACKAGE_VERSION}" \
  "${SOURCE_ARCHIVE_PREFIX}"
echo "Source:      ai-chat-exporter-source.zip (ref: ${SOURCE_ARCHIVE_REF})"

echo ""
echo "=== Done ==="
echo "Chrome/Edge: ai-chat-exporter.zip"
echo "Firefox:     ai-chat-exporter-firefox.zip"
echo "Source:      ai-chat-exporter-source.zip"
