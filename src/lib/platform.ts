import type { ExportablePlatform } from './types'

function normalizedHostname(hostname: string): string {
  return hostname.replace(/\.$/, '').replace(/^www\./i, '').toLowerCase()
}

/**
 * Detect the supported chat provider from a page URL.
 * Host matching is origin-based: subdomains of chatgpt.com are accepted,
 * lookalike hosts such as notchatgpt.com are not.
 */
export function detectPlatformFromUrl(url: string): ExportablePlatform | null {
  try {
    const host = normalizedHostname(new URL(url).hostname)
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') {
      return 'chatgpt'
    }
    if (host === 'gemini.google.com' || host.endsWith('.gemini.google.com')) return 'gemini'
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'claude'
    if (host === 'deepseek.com' || host.endsWith('.deepseek.com') || host === 'chat.deepseek.com') {
      return 'deepseek'
    }
    if (host === 'grok.com' || host.endsWith('.grok.com')) return 'grok'
  } catch {}
  return null
}

/**
 * Resolve the ChatGPT / Claude / … tab the popup should talk to.
 * Action popups can use the current window; a pinned detached panel cannot,
 * because that window is the exporter itself.
 */
export async function getProviderTab(preferredTabId?: number): Promise<chrome.tabs.Tab | undefined> {
  if (typeof preferredTabId === 'number' && preferredTabId > 0) {
    try {
      const tab = await chrome.tabs.get(preferredTabId)
      if (tab?.id && tab.url && detectPlatformFromUrl(tab.url)) return tab
    } catch {
      // The captured tab may have been closed; fall through to a live query.
    }
  }

  const pickFrom = (tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined =>
    tabs.find(tab => tab.url && detectPlatformFromUrl(tab.url))

  try {
    const [lastFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (lastFocused?.url && detectPlatformFromUrl(lastFocused.url)) return lastFocused
  } catch {}

  try {
    const [current] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (current?.url && detectPlatformFromUrl(current.url)) return current
  } catch {}

  try {
    const fromAll = pickFrom(await chrome.tabs.query({}))
    if (fromAll) return fromAll
  } catch {}

  return undefined
}

/** Retry popup→content-script messaging while the provider SPA finishes booting. */
export async function sendTabMessage<T = any>(
  tabId: number,
  message: unknown,
  attempts = 6
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message) as T
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reach the chat page. Refresh the tab and try again.')
}
