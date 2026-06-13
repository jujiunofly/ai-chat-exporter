#!/usr/bin/env node
/**
 * Post-build script to add Firefox MV3 compatibility to the Plasmo manifest.
 * Run after `npx plasmo build` to fix:
 * 1. Missing browser_specific_settings.gecko.id
 * 2. Missing background.scripts fallback
 */
const fs = require('fs')
const path = require('path')

const manifestPath = path.join(__dirname, '..', 'build/chrome-mv3-prod/manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

// Add Firefox gecko ID
manifest.browser_specific_settings = {
  gecko: {
    id: "ai-chat-exporter@pinguarmy.github.io",
    strict_min_version: "109.0"
  }
}

// Add background.scripts fallback for Firefox
if (manifest.background && manifest.background.service_worker) {
  manifest.background.scripts = [manifest.background.service_worker]
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log('Firefox compatibility patches applied to manifest.json')
