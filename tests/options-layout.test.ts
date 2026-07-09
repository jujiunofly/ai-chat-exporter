import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('Options page layout isolation', () => {
  it('loads options CSS after popup CSS so full-page body rules win', () => {
    const source = readSource('src/options.tsx')

    const popupImportIndex = source.indexOf("import './styles/popup.css'")
    const optionsImportIndex = source.indexOf("import './styles/options.css'")

    expect(popupImportIndex).toBeGreaterThanOrEqual(0)
    expect(optionsImportIndex).toBeGreaterThanOrEqual(0)
    expect(popupImportIndex).toBeLessThan(optionsImportIndex)
  })

  it('does not import popup CSS from options CSS', () => {
    const source = readSource('src/styles/options.css')

    expect(source).not.toMatch(/@import\s+['"]\.\/popup\.css['"]/)
    expect(source).toContain('width: auto !important')
    expect(source).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))')
  })

  it('overrides popup html overflow rules so settings pages can scroll', () => {
    const source = readSource('src/styles/options.css')

    expect(source).toMatch(/html\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*\}/)
    expect(source).toMatch(/html\s*\{[\s\S]*overflow-x:\s*hidden[\s\S]*\}/)
    expect(source).toMatch(/#__plasmo\s*\{[\s\S]*overflow:\s*visible[\s\S]*\}/)
    expect(source).toMatch(/\.popup-container\s*\{[\s\S]*max-height:\s*none[\s\S]*\}/)
  })

  it('overrides popup html overflow rules so preview pages can scroll', () => {
    const source = readSource('src/styles/print.css')

    expect(source).toMatch(/html\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*\}/)
    expect(source).toMatch(/html\s*\{[\s\S]*overflow-x:\s*hidden[\s\S]*\}/)
    expect(source).toMatch(/#__plasmo\s*\{[\s\S]*overflow:\s*visible[\s\S]*\}/)
    expect(source).toMatch(/\.popup-container\s*\{[\s\S]*max-height:\s*none[\s\S]*\}/)
  })

  it('uses a runtime scroll guard on full-page extension surfaces', () => {
    const optionsSource = readSource('src/options.tsx')
    const previewSource = readSource('src/tabs/preview.tsx')
    const hookSource = readSource('src/lib/use-full-page-scroll.ts')

    expect(optionsSource).toContain('useFullPageScroll()')
    expect(previewSource).toContain('useFullPageScroll()')
    expect(hookSource).toContain("setProperty('overflow-y', 'auto', 'important')")
    expect(hookSource).toContain("setProperty('width', 'auto', 'important')")
    expect(hookSource).toContain("getElementById('__plasmo')")
    expect(hookSource).toContain("setProperty('overflow', 'visible', 'important')")
  })

  it('keeps appearance and storage controls visible in the first settings card', () => {
    const source = readSource('src/options.tsx')

    const generalCardIndex = source.indexOf('general-card')
    const contentCardIndex = source.indexOf('content-card')
    const filenameCardIndex = source.indexOf('filename-card')
    const themeIndex = source.indexOf("T('UI Theme')")
    const storageIndex = source.indexOf("T('Download Folder Strategy')")

    expect(generalCardIndex).toBeGreaterThanOrEqual(0)
    expect(contentCardIndex).toBeGreaterThan(generalCardIndex)
    expect(filenameCardIndex).toBeGreaterThan(contentCardIndex)
    expect(themeIndex).toBeGreaterThan(generalCardIndex)
    expect(themeIndex).toBeLessThan(contentCardIndex)
    expect(storageIndex).toBeGreaterThan(generalCardIndex)
    expect(storageIndex).toBeLessThan(contentCardIndex)
  })
})
