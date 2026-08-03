import { describe, expect, it, vi } from 'vitest'
import { downloadAndWait } from '../src/lib/download-completion'

function makeDownloads(state: 'complete' | 'interrupted' | 'pending' = 'pending') {
  let listener: ((delta: chrome.downloads.DownloadDelta) => void) | undefined
  const api = {
    download: vi.fn(async () => 42),
    onChanged: {
      addListener: vi.fn((next: (delta: chrome.downloads.DownloadDelta) => void) => { listener = next }),
      removeListener: vi.fn(),
    },
    search: vi.fn(async () => state === 'pending' ? [{ id: 42, state: 'in_progress' }] : [{ id: 42, state }]),
  } as unknown as typeof chrome.downloads
  return { api, emit: (delta: chrome.downloads.DownloadDelta) => listener?.(delta) }
}

describe('download completion tracking', () => {
  it('resolves only after the browser reports complete', async () => {
    const { api, emit } = makeDownloads()
    const promise = downloadAndWait({ url: 'data:text/plain,test', filename: 'test.txt', saveAs: false }, 1000, api)
    await Promise.resolve()
    let settled = false
    promise.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    emit({ id: 42, state: { current: 'complete' } } as chrome.downloads.DownloadDelta)
    await expect(promise).resolves.toBe(42)
    expect(api.onChanged.removeListener).toHaveBeenCalled()
  })

  it('rejects interrupted downloads and removes the listener', async () => {
    const { api, emit } = makeDownloads()
    const promise = downloadAndWait({ url: 'data:text/plain,test', filename: 'test.txt', saveAs: false }, 1000, api)
    await Promise.resolve()
    emit({ id: 42, state: { current: 'interrupted' } } as chrome.downloads.DownloadDelta)
    await expect(promise).rejects.toThrow('interrupted')
    expect(api.onChanged.removeListener).toHaveBeenCalled()
  })

  it('handles a completion event that raced listener registration via search', async () => {
    const { api } = makeDownloads('complete')
    await expect(downloadAndWait({ url: 'data:text/plain,test', filename: 'test.txt', saveAs: false }, 1000, api)).resolves.toBe(42)
  })
})
