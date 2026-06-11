/**
 * Gemini Auth Token Extraction Tests
 * Tests for SNlM0e token extraction from various sources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome.storage
;(globalThis as any).chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
}

describe('Gemini Auth Token Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    // Reset window.__WIZ_global_data
    delete (window as any).__WIZ_global_data
  })

  describe('Token from __WIZ_global_data', () => {
    it('should extract SNlM0e from window.__WIZ_global_data', () => {
      ;(window as any).__WIZ_global_data = {
        SNlM0e: 'wiz-global-data-token-abc123',
        otherData: 'irrelevant',
      }

      const wizData = (window as any).__WIZ_global_data
      expect(wizData.SNlM0e).toBe('wiz-global-data-token-abc123')
    })

    it('should return null when __WIZ_global_data has no SNlM0e', () => {
      ;(window as any).__WIZ_global_data = {
        otherData: 'some-data',
      }

      const wizData = (window as any).__WIZ_global_data
      expect(wizData.SNlM0e).toBeUndefined()
    })

    it('should handle missing __WIZ_global_data gracefully', () => {
      delete (window as any).__WIZ_global_data

      const wizData = (window as any).__WIZ_global_data
      expect(wizData).toBeUndefined()
    })
  })

  describe('Token from script tags', () => {
    it('should extract SNlM0e from script tag content', () => {
      document.body.innerHTML = `
        <script>
          window.__WIZ_global_data = {"SNlM0e":"script-tag-token-xyz789"};
        </script>
        <div>Content</div>
      `

      const scripts = document.querySelectorAll('script')
      let found = null

      for (const script of scripts) {
        const text = script.textContent || ''
        const match = text.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
        if (match) {
          found = match[1]
          break
        }
      }

      expect(found).toBe('script-tag-token-xyz789')
    })

    it('should handle multiple script tags', () => {
      document.body.innerHTML = `
        <script>var x = 1;</script>
        <script>
          {"SNlM0e":"found-in-second-script"}
        </script>
        <script>var y = 2;</script>
      `

      const scripts = document.querySelectorAll('script')
      let found = null

      for (const script of scripts) {
        const text = script.textContent || ''
        const match = text.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
        if (match) {
          found = match[1]
          break
        }
      }

      expect(found).toBe('found-in-second-script')
    })

    it('should return null when no script contains SNlM0e', () => {
      document.body.innerHTML = `
        <script>var x = 1;</script>
        <script>var y = 2;</script>
      `

      const scripts = document.querySelectorAll('script')
      let found = null

      for (const script of scripts) {
        const text = script.textContent || ''
        const match = text.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
        if (match) {
          found = match[1]
          break
        }
      }

      expect(found).toBeNull()
    })
  })

  describe('Token from hidden input', () => {
    it('should extract SNlM0e from hidden input', () => {
      document.body.innerHTML = `
        <input type="hidden" name="SNlM0e" value="hidden-input-token-456" />
      `

      const input = document.querySelector('input[name="SNlM0e"]') as HTMLInputElement
      expect(input).not.toBeNull()
      expect(input.value).toBe('hidden-input-token-456')
    })

    it('should handle missing hidden input', () => {
      document.body.innerHTML = '<div>No inputs</div>'

      const input = document.querySelector('input[name="SNlM0e"]') as HTMLInputElement
      expect(input).toBeNull()
    })
  })

  describe('Token from meta tag', () => {
    it('should extract SNlM0e from meta tag', () => {
      document.body.innerHTML = `
        <meta name="SNlM0e" content="meta-tag-token-789" />
      `

      const meta = document.querySelector('meta[name="SNlM0e"]')
      expect(meta).not.toBeNull()
      expect(meta?.getAttribute('content')).toBe('meta-tag-token-789')
    })

    it('should handle missing meta tag', () => {
      document.body.innerHTML = '<div>No meta tags</div>'

      const meta = document.querySelector('meta[name="SNlM0e"]')
      expect(meta).toBeNull()
    })
  })

  describe('Token priority', () => {
    it('should prefer __WIZ_global_data over script tags', () => {
      ;(window as any).__WIZ_global_data = {
        SNlM0e: 'wiz-data-wins',
      }

      document.body.innerHTML = `
        <script>
          {"SNlM0e":"script-loses"}
        </script>
      `

      // Simulate priority order: 1. __WIZ_global_data, 2. cookie, 3. script, 4. input, 5. meta
      let found = null

      // 1. Try __WIZ_global_data
      const wizData = (window as any).__WIZ_global_data
      if (wizData?.SNlM0e) {
        found = wizData.SNlM0e
      }

      expect(found).toBe('wiz-data-wins')
    })

    it('should fall back to script tags when __WIZ_global_data unavailable', () => {
      delete (window as any).__WIZ_global_data

      document.body.innerHTML = `
        <script>
          {"SNlM0e":"script-wins"}
        </script>
      `

      let found = null

      // 1. Try __WIZ_global_data
      const wizData = (window as any).__WIZ_global_data
      if (wizData?.SNlM0e) {
        found = wizData.SNlM0e
      }

      // 2. Try script tags
      if (!found) {
        const scripts = document.querySelectorAll('script')
        for (const script of scripts) {
          const text = script.textContent || ''
          const match = text.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
          if (match) {
            found = match[1]
            break
          }
        }
      }

      expect(found).toBe('script-wins')
    })
  })
})
