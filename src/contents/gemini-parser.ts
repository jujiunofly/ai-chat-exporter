/**
 * Gemini DOM Parser Content Script
 * Parses conversations from gemini.google.com using DOM reading and API-based conversation list
 *
 * Authentication Strategy:
 * - Primary: Hook-script that monkey-patches window.fetch/XHR to intercept `at` (auth token)
 *   and `f.sid` (session ID) from Gemini's batchexecute requests, then posts them via
 *   window.postMessage for the content script to store in chrome.storage.local.
 * - Fallback: __WIZ_global_data, script tags, hidden inputs, meta tags.
 */
import type { Conversation, ChatMessage, PlatformParser, ConversationListItem } from '../lib/types'
import { generateId, extractTextContent, extractCodeBlocks, extractImages, cleanText } from '../lib/dom-utils'

/**
 * Hook script code that runs in the PAGE world (not the content script isolated world).
 * Monkey-patches window.fetch and XMLHttpRequest to intercept Gemini batchexecute requests
 * and extract auth tokens (at) and session IDs (f.sid).
 */
const HOOK_SCRIPT_CODE = `(() => {
  const result = {}

  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args)
    try {
      processRequest(args[0], args[1]?.body?.toString?.())
    } catch (e) {}
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__url = url
    return originalOpen.apply(this, arguments)
  }

  XMLHttpRequest.prototype.send = function (body) {
    if (this.__url && this.__url.includes("batchexecute")) {
      try {
        processRequest(this.__url, body && body.toString ? body.toString() : null)
      } catch (e) {}
    }
    return originalSend.apply(this, arguments)
  }

  function getAccountSlot() {
    try {
      var matched = window.location.pathname.match(/\\/u\\/(\\d+)(?:\\/|$)/)
      if (matched && matched[1]) return "u" + matched[1]
    } catch (e) {}
    return "default"
  }

  function processRequest(url, body) {
    try {
      var atMatch = body ? body.match(/at=([a-zA-Z0-9%:\\-_]+)/) : null
      var sidMatch = url ? url.match(/f\\.sid=([0-9]+)/) : null

      if (atMatch || sidMatch) {
        result.at = atMatch ? decodeURIComponent(atMatch[1]) : result.at
        result.sid = sidMatch ? sidMatch[1] : result.sid
        result.accountSlot = getAccountSlot()
        result.lastUsed = Date.now()

        window.postMessage(
          { type: "GEMINI_CREDENTIALS", payload: { at: result.at, sid: result.sid, accountSlot: result.accountSlot, lastUsed: result.lastUsed } },
          "*"
        )
      }
    } catch (e) {}
  }
})()`

/**
 * Inject the hook script into the page world.
 * The hook patches fetch/XHR and sends credentials back via postMessage.
 */
function injectHookScript() {
  // Avoid injecting twice
  if (document.querySelector('script[data-gemini-hook="true"]')) return

  const script = document.createElement('script')
  script.textContent = HOOK_SCRIPT_CODE
  script.setAttribute('data-gemini-hook', 'true')
  script.type = 'text/javascript'
  script.async = false
  document.documentElement.appendChild(script)
  script.remove()
}

/**
 * Gemini parser implementation
 */
class GeminiParser implements PlatformParser {
  platform = 'gemini' as const

  /**
   * Check if current page is a Gemini conversation
   */
  isConversationPage(): boolean {
    return !!(
      document.querySelector('[class*="message-content"]') ||
      document.querySelector('[class*="response-container"]') ||
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('.user-query, .model-response')
    )
  }

  /**
   * Get the conversation title from the page
   * Strategy:
   * 1. Parse document.title (most reliable: "Conversation Title - Gemini")
   * 2. Try conversation-title class
   * 3. Try first user message as fallback
   * 4. Last resort: "Untitled Conversation"
   */
  getConversationTitle(): string {
    // 1. Parse document.title — most reliable for Gemini
    const pageTitle = document.title
    if (pageTitle) {
      // Gemini formats titles as "Conversation Title - Gemini"
      const cleaned = pageTitle.replace(/\s*[–|]\s*Gemini.*$/i, '').trim()
      if (cleaned && cleaned !== 'Gemini' && cleaned.length > 0) {
        return cleaned
      }
    }

    // 2. Try conversation-title class
    const titleEl = document.querySelector('[class*="conversation-title"]')
    if (titleEl) {
      const text = extractTextContent(titleEl)
      if (text && text !== 'Gemini' && text.length > 0) {
        return text
      }
    }

    // 3. Try first user message as fallback
    const firstUserMsg = document.querySelector('.user-query, [class*="user-message"], [data-message-author-role="user"]')
    if (firstUserMsg) {
      const text = extractTextContent(firstUserMsg)
      if (text && text.length > 0) {
        return text.length > 80 ? text.substring(0, 80) + '...' : text
      }
    }

    return 'Untitled Conversation'
  }

  /**
   * Parse the current conversation from the DOM
   */
  async parseCurrentConversation(): Promise<Conversation | null> {
    try {
      const messages = this.extractMessages()

      if (messages.length === 0) {
        return null
      }

      return {
        id: generateId(),
        title: this.getConversationTitle(),
        url: window.location.href,
        messages,
        createdAt: this.extractCreatedAt(),
        platform: 'gemini'
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get the account slot from the URL path (e.g., /u/0/app/...)
   */
  private getAccountSlot(): string {
    try {
      const matched = window.location.pathname.match(/\/u\/(\d+)(?:\/|$)/)
      if (matched?.[1]) return `u${matched[1]}`
    } catch (e) {}
    return 'default'
  }

  /**
   * Extract the auth token. Priority:
   * 1. Hooked credentials from chrome.storage.local (most reliable)
   * 2. __WIZ_global_data (fallback)
   * 3. Script tags (fallback)
   * 4. Hidden inputs / meta tags (fallback)
   *
   * This is async because it reads from chrome.storage.local.
   */
  private async getAuthToken(): Promise<string | null> {
    // 1. Check hooked credentials in storage (most reliable)
    try {
      const stored = await chrome.storage.local.get(['gemini_credentials', 'gemini_credentials_map'])
      const credentials = stored.gemini_credentials
      const credentialsMap: Record<string, { at?: string; sid?: string; accountSlot?: string; lastUsed?: number }> = stored.gemini_credentials_map || {}

      // Try to find credentials for current account slot
      const accountSlot = this.getAccountSlot()
      const slotCreds = Object.values(credentialsMap).find(c => c.accountSlot === accountSlot)

      if (slotCreds?.at) return slotCreds.at
      if (credentials?.at) return credentials.at
    } catch (e) {
      // chrome.storage not available in tests
    }

    // 2. Fallback: try __WIZ_global_data
    try {
      const wizData = (window as any).__WIZ_global_data
      if (wizData && wizData.SNlM0e) {
        return wizData.SNlM0e
      }
    } catch {
      // Not available
    }

    // 3. Try document.cookie for SNlM0e
    try {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        if (name === 'SNlM0e' && value) {
          return value
        }
      }
    } catch {
      // Cookies not accessible
    }

    // 4. Try to find the token in page scripts
    const scripts = document.querySelectorAll('script')
    for (const script of scripts) {
      const text = script.textContent || ''
      // Look for SNlM0e pattern
      const match = text.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
      if (match) {
        return match[1]
      }
    }

    // 5. Fallback: try to find a hidden input with the token
    const input = document.querySelector('input[name="SNlM0e"]') as HTMLInputElement
    if (input) {
      return input.value
    }

    // 6. Fallback: try meta tag
    const meta = document.querySelector('meta[name="SNlM0e"]')
    if (meta) {
      return meta.getAttribute('content')
    }

    return null
  }

  /**
   * Get session ID from stored hooked credentials.
   */
  private async getSessionId(): Promise<string> {
    try {
      const stored = await chrome.storage.local.get(['gemini_credentials'])
      return stored.gemini_credentials?.sid || ''
    } catch {
      return ''
    }
  }

  /**
   * Build the correct URL params for Gemini batchexecute API.
   */
  private buildBatchExecuteUrl(
    rpcids: string,
    sourcePath: string,
    sessionId: string
  ): string {
    const params = new URLSearchParams({
      rpcids,
      'source-path': sourcePath,
      bl: 'boq_assistant-bard-web-server_20260107.06_p0',
      'f.sid': sessionId,
      _reqid: String(Math.floor(Math.random() * 100000)),
      rt: 'c'
    })
    return `https://gemini.google.com/_/BardChatUi/data/batchexecute?${params.toString()}`
  }

  /**
   * Build the form body for a batchexecute request.
   */
  private buildBatchExecuteBody(requestPayload: string, authToken: string): string {
    const body = new URLSearchParams()
    body.set('f.req', requestPayload)
    body.set('at', authToken)
    return body.toString()
  }

  /**
   * Make a batchexecute API call with proper auth and request format.
   */
  private async makeBatchExecuteCall(
    rpcids: string,
    sourcePath: string,
    requestPayload: string,
    authToken: string,
    sessionId: string
  ): Promise<string | null> {
    const url = this.buildBatchExecuteUrl(rpcids, sourcePath, sessionId)
    const body = this.buildBatchExecuteBody(requestPayload, authToken)

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body
    })

    if (!response.ok) {
      console.error(`[Gemini Parser] API error: ${response.status}`)
      return null
    }

    return response.text()
  }

  /**
   * Fetch ALL conversations via Gemini's batchexecute API.
   * Uses the correct RPC ID 'MaZiqc' and proper request format matching the original extension.
   */
  async fetchAllConversations(): Promise<ConversationListItem[]> {
    const conversations: ConversationListItem[] = []

    try {
      // Get the auth token (async — reads from chrome.storage.local first)
      const authToken = await this.getAuthToken()
      if (!authToken) {
        console.error('[Gemini Parser] Could not find auth token')
        return this.getConversationList() // Fall back to DOM
      }

      // Get session ID from stored hooked credentials
      const sessionId = await this.getSessionId()

      let nextPageToken: string = ''
      let hasMore = true
      let retries = 0
      const maxRetries = 2

      while (hasMore) {
        try {
          // Use the correct RPC ID 'MaZiqc' and request format
          // Format: [[\"MaZiqc\", JSON.stringify([20, pageToken, [0,null,1]]), null, \"generic\"]]
          const requestPayload = JSON.stringify([
            ['MaZiqc', JSON.stringify([20, nextPageToken || null, [0, null, 1]]), null, 'generic']
          ])

          const text = await this.makeBatchExecuteCall(
            'MaZiqc',
            '/app',
            requestPayload,
            authToken,
            sessionId
          )

          if (!text) {
            if (retries < maxRetries) {
              retries++
              await new Promise(r => setTimeout(r, 1000))
              continue
            }
            break
          }

          // Parse the response — each payload line starts with a number, then JSON
          const lines = text.split('\n')
          let parsed = false

          for (const line of lines) {
            const trimmed = line.trim()
            // Lines containing conversation data start with a number then ]
            if (trimmed.startsWith(']') || trimmed.startsWith('[')) {
              continue
            }
            // Try to parse lines that look like JSON arrays
            const jsonStart = trimmed.indexOf('[')
            if (jsonStart === -1) continue
            const jsonPart = trimmed.substring(jsonStart)
            try {
              const data = JSON.parse(jsonPart)
              if (Array.isArray(data) && data.length > 0) {
                const items = this.parseBatchResponse(data)
                if (items.length > 0) {
                  conversations.push(...items)
                  parsed = true
                }
                // Check for next page token in the response
                if (data[0] && Array.isArray(data[0]) && data[0][1]) {
                  nextPageToken = data[0][1]
                } else {
                  hasMore = false
                }
              }
            } catch {
              // Skip non-JSON lines
            }
          }

          if (!parsed || !nextPageToken) {
            hasMore = false
          }
        } catch (error) {
          console.error('[Gemini Parser] Error in pagination:', error)
          break
        }
      }
    } catch (error) {
      console.error('[Gemini Parser] Error fetching conversations:', error)
    }

    // If API didn't return results, fall back to DOM
    if (conversations.length === 0) {
      return this.getConversationList()
    }

    return conversations
  }

  /**
   * Parse the batchexecute response to extract conversation items
   */
  private parseBatchResponse(data: any[]): ConversationListItem[] {
    const items: ConversationListItem[] = []

    try {
      // The response structure varies, try to find conversation entries
      const findConversations = (obj: any): void => {
        if (!obj || typeof obj !== 'object') return

        if (Array.isArray(obj)) {
          // Look for arrays that contain conversation-like data
          for (const item of obj) {
            if (Array.isArray(item) && item.length >= 2) {
              // Check if this looks like a conversation entry (has ID and title)
              const maybeId = item[0]
              const maybeTitle = item[1] || item[2]
              if (typeof maybeId === 'string' && maybeId.length > 10 && typeof maybeTitle === 'string') {
                items.push({
                  id: maybeId,
                  title: maybeTitle,
                  url: `https://gemini.google.com/app/${maybeId}`,
                  platform: 'gemini'
                })
              }
            }
            findConversations(item)
          }
        } else {
          for (const key of Object.keys(obj)) {
            findConversations(obj[key])
          }
        }
      }

      findConversations(data)
    } catch {
      // Parsing failed
    }

    return items
  }

  /**
   * Fetch full conversation detail from the Gemini API.
   * Uses batchexecute to get the full conversation content.
   */
  async fetchConversationDetail(id: string): Promise<Conversation | null> {
    try {
      const authToken = await this.getAuthToken()
      if (!authToken) {
        console.error('[Gemini Parser] Could not find auth token for detail fetch')
        return null
      }

      const sessionId = await this.getSessionId()

      // Use batchexecute to fetch conversation detail
      // RPC ID for conversation detail is typically 'McFRL' or similar
      // Format: [[\"McFRL\", JSON.stringify([null, id, null, null, null]), null, \"generic\"]]
      const requestPayload = JSON.stringify([
        ['McFRL', JSON.stringify([null, id, null, null, null]), null, 'generic']
      ])

      const text = await this.makeBatchExecuteCall(
        'McFRL',
        `/app/${id}`,
        requestPayload,
        authToken,
        sessionId
      )

      if (!text) {
        console.error(`[Gemini Parser] Failed to fetch conversation ${id}`)
        return null
      }

      // Parse the response to extract messages
      const messages: ChatMessage[] = []
      const lines = text.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        const jsonStart = trimmed.indexOf('[')
        if (jsonStart === -1) continue
        const jsonPart = trimmed.substring(jsonStart)
        try {
          const data = JSON.parse(jsonPart)
          // Extract messages from the response structure
          this.extractMessagesFromApiResponse(data, messages)
        } catch {
          // Skip non-JSON lines
        }
      }

      // Try to extract title from the response
      let title = 'Untitled Conversation'
      const pageTitle = document.title
      if (pageTitle) {
        const cleaned = pageTitle.replace(/\s*[–|]\s*Gemini.*$/i, '').trim()
        if (cleaned && cleaned !== 'Gemini') {
          title = cleaned
        }
      }

      return {
        id,
        title,
        url: `https://gemini.google.com/app/${id}`,
        messages,
        createdAt: Date.now(), // Approximate
        platform: 'gemini'
      }
    } catch (error) {
      console.error(`[Gemini Parser] Error fetching conversation detail:`, error)
      return null
    }
  }

  /**
   * Extract messages from a Gemini batchexecute API response
   */
  private extractMessagesFromApiResponse(data: any, messages: ChatMessage[]): void {
    if (!data || typeof data !== 'object') return

    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string') {
          // Check if this looks like a message content string
          const trimmed = item.trim()
          if (trimmed.length > 5 && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
            // Could be user or model content depending on position
            // We'll make a best guess based on content
            messages.push({
              id: generateId(),
              role: messages.length % 2 === 0 ? 'user' : 'assistant',
              content: trimmed
            })
          }
        } else {
          this.extractMessagesFromApiResponse(item, messages)
        }
      }
    } else if (typeof data === 'object') {
      for (const key of Object.keys(data)) {
        this.extractMessagesFromApiResponse(data[key], messages)
      }
    }
  }

  /**
   * Extract all messages from the conversation DOM
   * Uses a single pass with deduplication to avoid counting messages twice
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    const seenElements = new Set<Element>()

    // First, try to find turn containers (single reliable selector approach)
    // Gemini uses turn-based containers. Try common patterns.
    const turnSelectors = [
      '.conversation-turn',
      '[class*="turn"]',
      '[class*="message-container"]',
      '.user-query',
      '.model-response'
    ]

    // Collect all message elements with their roles using a unified approach
    const userElements: Element[] = []
    const assistantElements: Element[] = []

    // Primary approach: find user and model messages with specific selectors
    document.querySelectorAll('.user-query, [class*="user-message"], [data-message-author-role="user"]').forEach(el => {
      if (!seenElements.has(el)) {
        seenElements.add(el)
        userElements.push(el)
      }
    })

    document.querySelectorAll('.model-response, [class*="model-message"], [data-message-author-role="model"]').forEach(el => {
      if (!seenElements.has(el)) {
        seenElements.add(el)
        assistantElements.push(el)
      }
    })

    // Process user messages
    for (const element of userElements) {
      const message = this.parseMessageElement(element, 'user')
      if (message) {
        messages.push(message)
      }
    }

    // Process assistant messages
    for (const element of assistantElements) {
      const message = this.parseMessageElement(element, 'assistant')
      if (message) {
        messages.push(message)
      }
    }

    // If no messages found with specific selectors, try broader approach
    if (messages.length === 0) {
      const allMessageSelectors = [
        '[class*="query"]',
        '[class*="response"]',
        '[class*="content"]'
      ]

      for (const selector of allMessageSelectors) {
        document.querySelectorAll(selector).forEach(element => {
          if (seenElements.has(element)) return
          seenElements.add(element)

          const isUser = /query|user/i.test(element.className) ||
                         element.getAttribute('data-message-author-role') === 'user'
          const role: ChatMessage['role'] = isUser ? 'user' : 'assistant'
          const message = this.parseMessageElement(element, role)
          if (message) {
            messages.push(message)
          }
        })
      }
    }

    // querySelectorAll already returns elements in DOM order — no sort needed
    return messages
  }

  /**
   * Parse a message element
   */
  private parseMessageElement(element: Element, role: ChatMessage['role']): ChatMessage | null {
    const contentElement = element.querySelector(
      '[class*="content"], [class*="text"], .markdown'
    ) || element

    const content = this.extractMessageContent(contentElement)

    if (!content.trim()) {
      return null
    }

    const codeBlocks = extractCodeBlocks(contentElement)

    const imageData = extractImages(contentElement)
    const attachments = imageData.map(img => ({
      type: 'image' as const,
      url: img.url,
      name: img.alt
    }))

    const messageId = element.getAttribute('data-message-id') ||
                     element.id ||
                     generateId()

    return {
      id: messageId,
      role,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined
    }
  }

  /**
   * Extract clean content from a message element
   */
  private extractMessageContent(element: Element): string {
    const clone = element.cloneNode(true) as Element

    const removeSelectors = [
      'button',
      '[class*="toolbar"]',
      '[class*="action"]',
      '[class*="copy"]',
      '[class*="share"]',
      '[class*="menu"]'
    ]

    removeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove())
    })

    let content = ''

    const textElements = clone.querySelectorAll('p, div, span, li')

    if (textElements.length > 0) {
      const textParts: string[] = []
      textElements.forEach(el => {
        const text = el.textContent?.trim()
        if (text) {
          textParts.push(text)
        }
      })
      content = textParts.join('\n\n')
    } else {
      content = clone.textContent || ''
    }

    return cleanText(content)
  }

  // getElementPosition removed — querySelectorAll already returns DOM order

  /**
   * Extract conversation creation timestamp
   */
  private extractCreatedAt(): number | undefined {
    const timeElements = document.querySelectorAll('time[datetime]')
    if (timeElements.length > 0) {
      const datetime = timeElements[0].getAttribute('datetime')
      if (datetime) {
        const timestamp = new Date(datetime).getTime()
        if (!isNaN(timestamp)) {
          return timestamp
        }
      }
    }
    return undefined
  }

  /**
   * Get list of conversations from the sidebar (DOM-based, limited to visible items)
   */
  getConversationList(): ConversationListItem[] {
    const conversations: ConversationListItem[] = []
    const seen = new Set<string>()

    const selectors = [
      'nav a[href*="/app/"]',
      'aside a[href*="/app/"]',
      '[class*="sidebar"] a[href*="/app/"]',
      '[class*="history"] a[href*="/app/"]',
      'a[href^="/app/"]'
    ]

    for (const selector of selectors) {
      const links = document.querySelectorAll(selector)

      links.forEach(link => {
        const href = link.getAttribute('href')
        if (!href) return

        const match = href.match(/\/app\/([a-f0-9]+)/)
        if (!match) return

        const id = match[1]
        if (seen.has(id)) return

        const title = extractTextContent(link) || 'Untitled Conversation'

        seen.add(id)
        conversations.push({
          id,
          title,
          url: new URL(href, window.location.origin).href,
          platform: 'gemini'
        })
      })

      if (conversations.length > 0) break
    }

    return conversations
  }
}

// Create parser instance
const parser = new GeminiParser()

// Export for content script
export const config = {
  matches: ['https://gemini.google.com/*']
}

// Listen for credentials from hook script (page world -> content script world)
window.addEventListener('message', async (event) => {
  if (event.source === window && event.data?.type === 'GEMINI_CREDENTIALS') {
    const { at, sid, accountSlot, lastUsed } = event.data.payload
    if (at || sid) {
      try {
        // Get existing map to merge
        const existing = await chrome.storage.local.get(['gemini_credentials_map'])
        const credentialsMap = existing.gemini_credentials_map || {}

        // Update the map with new credentials for this session
        const key = sid || 'default'
        credentialsMap[key] = {
          at,
          sid,
          accountSlot,
          lastUsed: lastUsed || Date.now()
        }

        await chrome.storage.local.set({
          gemini_credentials: { at, sid },
          gemini_credentials_map: credentialsMap
        })
      } catch (e) {
        // Storage may not be available in some contexts
      }
    }
  }
})

// Inject hook script into the page world for credential extraction
injectHookScript()

// Main function to run when script loads
async function main() {
  if (parser.isConversationPage()) {
    const conversation = await parser.parseCurrentConversation()
    if (conversation) {
      chrome.storage.local.set({
        [`conversation-${conversation.id}`]: conversation
      })
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PARSE_CONVERSATION') {
    parser.parseCurrentConversation().then(conversation => {
      if (conversation && conversation.messages.length > 0) {
        sendResponse({ data: conversation })
      } else {
        // DOM parsing returned 0 messages — try API
        const url = window.location.href
        const match = url.match(/\/app\/([a-zA-Z0-9_-]+)/)
        if (match) {
          parser.fetchConversationDetail(match[1]).then(apiConv => {
            sendResponse({ data: apiConv || conversation })
          }).catch(() => {
            sendResponse({ data: conversation })
          })
        } else {
          sendResponse({ data: conversation })
        }
      }
    }).catch(error => {
      sendResponse({ error: error.message })
    })
    return true
  }

  if (message.type === 'DETECT_PLATFORM') {
    sendResponse({
      data: {
        platform: 'gemini',
        isConversationPage: parser.isConversationPage(),
        title: parser.getConversationTitle()
      }
    })
  }

  if (message.type === 'FETCH_CONVERSATION_LIST') {
    try {
      const list = parser.getConversationList()
      sendResponse({ data: list })
    } catch (error) {
      sendResponse({ error: (error as Error).message })
    }
  }

  if (message.type === 'FETCH_ALL_CONVERSATIONS') {
    parser.fetchAllConversations().then(list => {
      sendResponse({ data: list })
    }).catch(error => {
      // Fall back to DOM-based list
      try {
        const fallbackList = parser.getConversationList()
        sendResponse({ data: fallbackList })
      } catch (e) {
        sendResponse({ error: (error as Error).message })
      }
    })
    return true
  }

  if (message.type === 'FETCH_CONVERSATION_DETAIL') {
    parser.fetchConversationDetail(message.data?.id).then(conversation => {
      sendResponse({ data: conversation })
    }).catch(error => {
      sendResponse({ error: error.message })
    })
    return true
  }
})

// Run on page load
main()
