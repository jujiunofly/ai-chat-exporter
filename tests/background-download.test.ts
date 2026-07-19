// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('background download filename behavior', () => {
  it('does not register onDeterminingFilename without preserving the requested filename', () => {
    const source = readFileSync(join(process.cwd(), 'src/background.ts'), 'utf8')

    expect(source).not.toContain('onDeterminingFilename.addListener((downloadItem, suggest) => {\n  suggest()')
    expect(source).not.toContain('onDeterminingFilename.addListener')
  })

  it('uses a data URL rather than a blob URL in the MV3 service worker', () => {
    const source = readFileSync(join(process.cwd(), 'src/background.ts'), 'utf8')

    expect(source).not.toContain('URL.createObjectURL')
    expect(source).toContain("textToDataUrl(markdown, 'text/markdown')")
  })

  it('maintains the cleanup alarm and expires preview snapshots', () => {
    const source = readFileSync(join(process.cwd(), 'src/background.ts'), 'utf8')

    expect(source).toContain("chrome.alarms.create('cleanup-exports', { periodInMinutes: 60 })")
    expect(source).toContain("chrome.alarms.get('cleanup-exports'")
  })
})
