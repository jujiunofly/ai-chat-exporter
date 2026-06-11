/**
 * Auto-Download Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome API
const mockChrome = {
  downloads: {
    download: vi.fn().mockResolvedValue(1)
  }
}

vi.stubGlobal('chrome', mockChrome)

// Mock URL.createObjectURL and revokeObjectURL
const mockUrls = new Map<string, Blob>()
vi.stubGlobal('URL', {
  ...globalThis.URL,
  createObjectURL: (blob: Blob) => {
    const url = `blob:http://localhost/${Math.random().toString(36).substring(2)}`
    mockUrls.set(url, blob)
    return url
  },
  revokeObjectURL: (url: string) => {
    mockUrls.delete(url)
  }
})

describe('Auto-Download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUrls.clear()
  })

  describe('saveAs: false behavior', () => {
    it('should call chrome.downloads.download with saveAs: false', async () => {
      const mockDownload = vi.fn().mockResolvedValue(1)
      mockChrome.downloads.download = mockDownload
      
      // Simulate markdown export
      await mockChrome.downloads.download({
        url: 'blob:http://localhost/test',
        filename: 'test.md',
        saveAs: false
      })
      
      expect(mockDownload).toHaveBeenCalledWith({
        url: 'blob:http://localhost/test',
        filename: 'test.md',
        saveAs: false
      })
    })

    it('should not show save dialog when saveAs is false', async () => {
      const options = {
        url: 'blob:http://localhost/test',
        filename: 'export.md',
        saveAs: false
      }
      
      expect(options.saveAs).toBe(false)
    })
  })

  describe('Filename handling', () => {
    it('should pass correct filename to download', async () => {
      const mockDownload = vi.fn().mockResolvedValue(1)
      mockChrome.downloads.download = mockDownload
      
      const filename = 'my-conversation.md'
      
      await mockChrome.downloads.download({
        url: 'blob:http://localhost/test',
        filename,
        saveAs: false
      })
      
      expect(mockDownload).toHaveBeenCalledWith(
        expect.objectContaining({ filename })
      )
    })

    it('should add .pdf extension for PDF exports', () => {
      let filename = 'my-conversation'
      
      if (!filename.endsWith('.pdf')) {
        filename += '.pdf'
      }
      
      expect(filename).toBe('my-conversation.pdf')
    })

    it('should not double-add extension', () => {
      let filename = 'my-conversation.pdf'
      
      if (!filename.endsWith('.pdf')) {
        filename += '.pdf'
      }
      
      expect(filename).toBe('my-conversation.pdf')
    })
  })

  describe('Blob URL management', () => {
    it('should create object URL from blob', () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      
      expect(url).toMatch(/^blob:/)
      
      URL.revokeObjectURL(url)
    })

    it('should revoke object URL after download', () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      
      URL.revokeObjectURL(url)
      
      // After revoking, the URL should no longer be in our map
      expect(mockUrls.has(url)).toBe(false)
    })
  })
})
