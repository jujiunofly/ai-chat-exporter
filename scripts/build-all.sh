#!/bin/bash
# Build extension for all browsers
# Chrome/Edge: clean Plasmo manifest
# Firefox: patched with gecko-specific fields

set -e
cd "$(dirname "$0")/.."

echo "=== Building with Plasmo ==="
npx plasmo build

echo ""
echo "=== Verifying options page layout bundle ==="
options_css="$(ls build/chrome-mv3-prod/options.*.css 2>/dev/null | head -n 1)"
if [ -z "$options_css" ]; then
  echo "Missing options CSS bundle"
  exit 1
fi

if ! grep -q 'width:auto!important' "$options_css"; then
  echo "Options CSS is missing the full-page body width override"
  exit 1
fi

if ! grep -q 'grid-template-columns:repeat(12,minmax(0,1fr))' "$options_css"; then
  echo "Options CSS is missing the dashboard grid layout"
  exit 1
fi

node <<'NODE'
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync('build/chrome-mv3-prod/options.html', 'utf8')
const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1])
const cssFiles = hrefs.map(href => ({
  href,
  css: fs.readFileSync(path.join('build/chrome-mv3-prod', href.replace(/^\//, '')), 'utf8'),
}))
const popupIndex = cssFiles.findIndex(file => file.css.includes('width:380px'))
const optionsIndex = cssFiles.findIndex(file => file.css.includes('width:auto!important'))

if (popupIndex === -1 || optionsIndex === -1 || popupIndex > optionsIndex) {
  console.error('options.html must load popup-width CSS before options full-page CSS')
  process.exit(1)
}
NODE

echo ""
echo "=== Verifying preview page layout bundle ==="
preview_css="$(ls build/chrome-mv3-prod/tabs/preview.*.css 2>/dev/null | head -n 1)"
if [ -z "$preview_css" ]; then
  echo "Missing preview CSS bundle"
  exit 1
fi

if ! grep -q 'width:auto!important' "$preview_css"; then
  echo "Preview CSS is missing the full-page body width override"
  exit 1
fi

node <<'NODE'
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync('build/chrome-mv3-prod/tabs/preview.html', 'utf8')
const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1])
const cssFiles = hrefs.map(href => ({
  href,
  css: fs.readFileSync(path.join('build/chrome-mv3-prod', href.replace(/^\//, '')), 'utf8'),
}))
const popupIndex = cssFiles.findIndex(file => file.css.includes('width:380px'))
const previewIndex = cssFiles.findIndex(file => file.css.includes('width:auto!important'))

if (popupIndex === -1 || previewIndex === -1 || popupIndex > previewIndex) {
  console.error('preview.html must load popup-width CSS before preview full-page CSS')
  process.exit(1)
}
NODE

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

echo ""
echo "=== Creating Firefox ZIP (patched manifest) ==="
cd build/chrome-mv3-prod
rm -f ../../ai-chat-exporter-firefox.zip
zip -r ../../ai-chat-exporter-firefox.zip . > /dev/null
echo "Firefox: $(ls -lh ../../ai-chat-exporter-firefox.zip | awk '{print $5}')"

echo ""
echo "=== Done ==="
echo "Chrome/Edge: ai-chat-exporter.zip"
echo "Firefox:     ai-chat-exporter-firefox.zip"
