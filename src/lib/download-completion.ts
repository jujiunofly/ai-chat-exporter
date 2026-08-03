/**
 * Start a browser download and wait until Chrome/Firefox reports that the
 * file is complete. A download id only means that the transfer was queued;
 * callers must await this helper before recording export history.
 */
export async function downloadAndWait(
  options: chrome.downloads.DownloadOptions,
  timeoutMs = 60_000,
  downloadsApi: typeof chrome.downloads = chrome.downloads
): Promise<number> {
  const downloadId = await downloadsApi.download(options)

  // Some unit-test/browser shims expose download() but not onChanged. Keep a
  // compatibility path for those environments; real extension manifests
  // include the downloads permission and provide the event API.
  if (!downloadsApi.onChanged?.addListener) return downloadId

  return new Promise<number>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error('Download completion timed out')), timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      try {
        downloadsApi.onChanged.removeListener(onChanged)
      } catch {
        // The browser may tear down the service context while the download is
        // still present; there is nothing useful left to clean up.
      }
    }

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(downloadId)
    }

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return
      if (delta.error?.current) {
        finish(new Error(`Download interrupted: ${delta.error.current}`))
        return
      }
      if (delta.state?.current === 'interrupted') {
        finish(new Error('Download interrupted'))
        return
      }
      if (delta.state?.current === 'complete') finish()
    }

    downloadsApi.onChanged.addListener(onChanged)

    // The event can fire before the listener is attached, especially for a
    // small data URL. Search the item once to close that race window.
    if (downloadsApi.search) {
      downloadsApi.search({ id: downloadId }).then(items => {
        const state = items[0]?.state
        if (state === 'complete') finish()
        else if (state === 'interrupted') finish(new Error('Download interrupted'))
      }).catch(() => {
        // The event listener remains authoritative if search is unavailable.
      })
    }
  })
}
