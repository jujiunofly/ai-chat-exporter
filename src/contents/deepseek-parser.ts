/**
 * DeepSeek DOM + API Parser Content Script
 * Parses conversations from deepseek.com / chat.deepseek.com
 * - DOM parsing for current conversation page
 * - API-based conversation list fetching (cookie-authenticated)
 */
import type { Conversation, ChatMessage, ConversationListItem } from '../lib/types'
import { generateId, extractTextContent, extractTextWithMedia, extractCodeBlocks, extractImages, cleanText } from '../lib/dom-utils'
import { registerParserMessageHandler, runParserMain } from '../lib/parser-runtime'
import { extractApiMessageText, getApiMessageRecords, normalizeApiMessageRole } from '../lib/api-message-normalizer'
import { isProviderRateLimitError, isRateLimitedResponse, ProviderRateLimitError } from '../lib/provider-rate-limit'

function deepSeekTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function deepSeekModelName(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export interface DeepSeekHistoryPage {
  items: any[]
  nextCursor?: string
  hasMore: boolean
  nextUpdatedAt?: number
  nextPinned?: boolean
}

interface DeepSeekConversationListMeta extends Record<string, unknown> {
  source: 'api' | 'sidebar'
  complete: boolean
  pagesFetched?: number
}

function deepSeekUnixSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric
  }
  return undefined
}

/**
 * Next fetch_page cursor. The live client walks the page in API order and
 * keeps the oldest (pinned DESC, updated_at DESC) key via touchCursor/eS —
 * not the globally smallest timestamp, which can stick on an old pinned row
 * and make every later page replay the first 100 unpinned chats.
 */
export function deepSeekHistoryCursor(items: any[]): { pinned: boolean; updatedAt: number } | undefined {
  let pinned: boolean | null = null
  let value: number | null = null
  for (const item of items) {
    const updatedAt = deepSeekUnixSeconds(item?.updated_at ?? item?.updatedAt)
    if (updatedAt == null) continue
    const itemPinned = typeof item?.pinned === 'boolean' ? item.pinned : false
    const alreadyOlder = pinned !== null && value !== null && (pinned === itemPinned ? value < updatedAt : !pinned)
    if (alreadyOlder) continue
    pinned = itemPinned
    value = updatedAt
  }
  if (pinned === null || value === null) return undefined
  return { pinned, updatedAt: value }
}

function unwrapDeepSeekPayload(data: any): any {
  let current = data
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break
    if (current.biz_data && typeof current.biz_data === 'object') {
      current = current.biz_data
      continue
    }
    if (current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
      current = current.data
      continue
    }
    break
  }
  return current
}

/** Normalize the several history response envelopes seen in DeepSeek builds. */
export function parseDeepSeekHistoryPage(data: any): DeepSeekHistoryPage {
  const envelope = unwrapDeepSeekPayload(data)
  const rawItems = Array.isArray(envelope)
    ? envelope
    : envelope?.items || envelope?.conversations || envelope?.chat_sessions || envelope?.chat_session || envelope?.biz_data || envelope?.data || []
  const items = Array.isArray(rawItems) ? rawItems : []
  const nextCursor = [
    envelope?.next_cursor,
    envelope?.nextCursor,
    envelope?.next_page_token,
    envelope?.nextPageToken,
    envelope?.cursor,
  ].find(value => typeof value === 'string' && value.length > 0)
  const explicitHasMore = envelope?.has_more ?? envelope?.hasMore ?? envelope?.has_next_page
  const cursor = deepSeekHistoryCursor(items)
  return {
    items,
    nextCursor,
    hasMore: typeof explicitHasMore === 'boolean' ? explicitHasMore : Boolean(nextCursor),
    ...(cursor ? { nextUpdatedAt: cursor.updatedAt, nextPinned: cursor.pinned } : {}),
  }
}

/** DeepSeek keeps the session bearer in localStorage, not a cookie. */
export function readDeepSeekAccessToken(): string | null {
  try {
    const raw = window.localStorage?.getItem('userToken')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
    if (parsed && typeof parsed.value === 'string' && parsed.value.trim()) return parsed.value.trim()
  } catch {}
  return null
}

function deepSeekClientLocale(): string {
  const language = typeof navigator !== 'undefined' ? navigator.language : ''
  return language.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en_US'
}

function deepSeekRequestHeaders(): Record<string, string> {
  // Live fetch_page ignores lte_cursor unless the web client headers are present
  // and then always returns the first 100 sessions.
  const headers: Record<string, string> = {
    Accept: '*/*',
    'x-client-platform': 'web',
    'x-client-version': '2.3.0',
    'x-client-bundle-id': 'com.deepseek.chat',
    'x-client-locale': deepSeekClientLocale(),
    'x-client-timezone-offset': String(-new Date().getTimezoneOffset() * 60),
  }
  const token = readDeepSeekAccessToken()
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

function isDeepSeekAuthEnvelope(data: any): boolean {
  const code = data?.code ?? data?.data?.biz_code
  return code === 40002 || code === 40003 || code === 40012
}

function extractDeepSeekMessageText(item: Record<string, unknown>): string {
  const fragments = Array.isArray(item.fragments) ? item.fragments : []
  const fromFragments = fragments
    .filter((fragment): fragment is Record<string, unknown> => !!fragment && typeof fragment === 'object')
    .filter(fragment => ['REQUEST', 'RESPONSE', 'TEMPLATE_RESPONSE'].includes(String(fragment.type || '')))
    .map(fragment => typeof fragment.content === 'string' ? fragment.content : '')
    .map(text => text.trim())
    .filter(Boolean)
  if (fromFragments.length > 0) return fromFragments.join('\n\n')
  return extractApiMessageText(item)
}

function deepSeekActiveMessageRecords(payload: any): { records: any[]; complete: boolean } {
  const records = Array.isArray(payload?.chat_messages) && payload.chat_messages.length > 0
    ? payload.chat_messages
    : getApiMessageRecords(payload)
  const byId = new Map<string, any>()
  for (const record of records) {
    const id = typeof record?.message_id === 'string' ? record.message_id : typeof record?.id === 'string' ? record.id : null
    if (id) byId.set(id, record)
  }
  const leafId = typeof payload?.chat_session?.current_message_id === 'string'
    ? payload.chat_session.current_message_id
    : [...byId.keys()].at(-1)
  if (!leafId || !byId.has(leafId)) {
    return { records, complete: records.length > 0 }
  }

  const chain: any[] = []
  const seen = new Set<string>()
  let nodeId: string | null = leafId
  let complete = true
  while (nodeId) {
    if (seen.has(nodeId)) {
      complete = false
      break
    }
    seen.add(nodeId)
    const node = byId.get(nodeId)
    if (!node) {
      complete = false
      break
    }
    chain.unshift(node)
    const parent = node.parent_id
    nodeId = typeof parent === 'string' && parent ? parent : null
  }
  return { records: chain, complete }
}

/**
 * DeepSeek parser implementation
 */
export class DeepSeekParser {
  platform = 'deepseek' as const
  private authenticationRequired = false
  private conversationListMeta: DeepSeekConversationListMeta = { source: 'sidebar', complete: false }

  /** Safe aggregate signal for the scheduled-export status surface. */
  isAuthenticationRequired(): boolean {
    return this.authenticationRequired
  }

  getConversationListMeta(): DeepSeekConversationListMeta {
    return { ...this.conversationListMeta }
  }

  /**
   * Check if current page is a DeepSeek conversation
   */
  isConversationPage(): boolean {
    return !!(
      document.querySelector('[class*="chat-message"], [class*="ds-message"], [data-message-author-role]') ||
      document.querySelector('[data-message-author-role]') ||
      window.location.pathname.match(/\/a\/chat\/s\/[a-f0-9-]+/) ||
      window.location.pathname.match(/\/chat\/[a-f0-9-]+/)
    )
  }

  /**
   * Get the conversation title from the page
   * Strategy:
   * 1. Parse document.title (most reliable: "Conversation Title - DeepSeek")
   * 2. Try first user message as fallback
   * 3. Last resort: "Untitled Conversation"
   */
  getConversationTitle(): string {
    // 1. Parse document.title — most reliable
    const pageTitle = document.title
    if (pageTitle) {
      const cleaned = pageTitle.replace(/\s*[-–|]\s*DeepSeek.*$/i, '').trim()
      if (cleaned && cleaned !== 'DeepSeek' && cleaned.length > 0) {
        return cleaned
      }
    }

    // 2. Try first user message as fallback
    const firstUserMsg =
      document.querySelector('[data-message-author-role="user"]') ||
      document.querySelector('[class*="user-message"]') ||
      document.querySelector('[class*="message-user"]')
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
        id: this.extractConversationId() || generateId(),
        title: this.getConversationTitle(),
        url: window.location.href,
        messages,
        createdAt: this.extractCreatedAt(),
        modelName: deepSeekModelName(
          document.body.getAttribute('data-model'),
          document.querySelector('[data-model]')?.getAttribute('data-model')
        ),
        platform: 'deepseek'
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Fetch ALL conversations via DeepSeek API
   * DeepSeek uses cookie-based auth, so we can fetch directly with credentials: 'include'
   */
  async fetchAllConversations(): Promise<ConversationListItem[]> {
    this.conversationListMeta = { source: 'sidebar', complete: false }
    const conversations: ConversationListItem[] = []
    const seen = new Set<string>()
    let paginationFailed = false
    let pagesFetched = 0

    try {
      // Live DeepSeek UI reads GET /api/v0/chat_session/fetch_page with an
      // lte cursor of { pinned, updated_at }. The retired /chat/history path
      // 404s and previously left bulk export with an empty sidebar fallback.
      const pageSize = 100
      const maxPages = 100
      let updatedAt: number | null = null
      let pinned = false
      let triedExclusiveCursor = false
      const seenCursors = new Set<string>()
      for (let page = 0; page < maxPages; page++) {
        const query = new URLSearchParams()
        query.set('count', String(pageSize))
        query.set('lte_cursor.pinned', String(pinned))
        if (updatedAt !== null) query.set('lte_cursor.updated_at', String(updatedAt))
        const response = await fetch(`https://chat.deepseek.com/api/v0/chat_session/fetch_page?${query.toString()}`, {
          method: 'GET',
          credentials: 'include',
          headers: deepSeekRequestHeaders()
        })
        if (isRateLimitedResponse(response)) throw new ProviderRateLimitError()
        if (response.status === 401 || response.status === 403) {
          this.authenticationRequired = true
          throw new Error(`DeepSeek history request failed: ${response.status}`)
        }
        if (!response.ok) throw new Error(`DeepSeek history request failed: ${response.status}`)

        const payload = await response.json()
        if (isDeepSeekAuthEnvelope(payload)) {
          this.authenticationRequired = true
          throw new Error('DeepSeek history request failed: authentication required')
        }

        this.authenticationRequired = false

        const pageData = parseDeepSeekHistoryPage(payload)
        pagesFetched += 1
        let added = 0
        for (const item of pageData.items) {
          const id = item?.id || item?.chat_session_id
          if (typeof id !== 'string' || !id || seen.has(id)) continue
          const title = item.title || item.name || 'Untitled Conversation'
          seen.add(id)
          added += 1
          const updated = deepSeekUnixSeconds(item.updated_at ?? item.updatedAt)
          const created = deepSeekUnixSeconds(item.created_at ?? item.createdAt)
          conversations.push({
            id,
            title,
            url: `https://chat.deepseek.com/a/chat/s/${id}`,
            platform: 'deepseek',
            createdAt: created
              ? created * 1000
              : updated
                ? updated * 1000
                : undefined
          })
        }

        if (pageData.items.length === 0) break

        const maybeMore = pageData.hasMore === true || pageData.items.length >= pageSize
        if (added === 0) {
          // Inclusive lte repeats the last row. Skip that second once; never
          // walk 1s-at-a-time and never send milliseconds (the client stores
          // seconds in the query).
          if (!maybeMore || updatedAt == null || triedExclusiveCursor) {
            if (maybeMore) paginationFailed = true
            break
          }
          triedExclusiveCursor = true
          updatedAt -= 1
          const cursorKey = `${pinned}:${updatedAt}`
          if (seenCursors.has(cursorKey)) {
            paginationFailed = true
            break
          }
          seenCursors.add(cursorKey)
          continue
        }

        if (!maybeMore) break

        const nextUpdatedAt = pageData.nextUpdatedAt
        const nextPinned = pageData.nextPinned ?? pinned
        if (nextUpdatedAt == null) {
          paginationFailed = maybeMore
          break
        }
        let nextAt = nextUpdatedAt
        let nextPin = nextPinned
        let cursorKey = `${nextPin}:${nextAt}`
        if (seenCursors.has(cursorKey)) {
          if (triedExclusiveCursor) {
            paginationFailed = true
            break
          }
          triedExclusiveCursor = true
          nextAt -= 1
          cursorKey = `${nextPin}:${nextAt}`
          if (seenCursors.has(cursorKey)) {
            paginationFailed = true
            break
          }
        }
        seenCursors.add(cursorKey)
        updatedAt = nextAt
        pinned = nextPin
        if (page === maxPages - 1) {
          paginationFailed = true
          break
        }
      }
    } catch (error) {
      if (isProviderRateLimitError(error)) throw error
      paginationFailed = true
      console.error('[DeepSeek Parser] Error fetching conversations:', error)
    }

    if (!paginationFailed && conversations.length === 0) {
      return this.getConversationList()
    }
    if (conversations.length === 0) {
      return this.getConversationList()
    }

    this.conversationListMeta = {
      source: 'api',
      complete: !paginationFailed,
      pagesFetched
    }
    return conversations
  }

  /**
   * Fetch full conversation detail from the DeepSeek API
   */
  async fetchConversationDetail(id: string): Promise<Conversation | null> {
    try {
      const data = await this.fetchDeepSeekHistoryMessages(id)
      if (!data) return null

      const payload = unwrapDeepSeekPayload(data)
      const branch = deepSeekActiveMessageRecords(payload)
      const items = branch.records.length ? branch.records : getApiMessageRecords(data)
      const messages: ChatMessage[] = []

      for (const item of items) {
        const role = normalizeApiMessageRole(item)
        if (role) {
          const content = extractDeepSeekMessageText(item)
          if (content) {
            messages.push({
              id: typeof item.id === 'string'
                ? item.id
                : typeof (item as any).message_id === 'string'
                  ? (item as any).message_id
                  : generateId(),
              role,
              content: cleanText(content),
              timestamp: deepSeekTimestamp(
                item.inserted_at ?? item.created_at ?? item.createdAt ?? item.create_time ??
                (item.message as any)?.created_at ?? (item as any).timestamp
              )
            })
          }
        }
      }

      if (messages.length === 0) return null

      const session = payload?.chat_session && typeof payload.chat_session === 'object'
        ? payload.chat_session
        : payload
      const title = session?.title || session?.name || data.title || payload?.title || this.getConversationTitle()

      return {
        id,
        title,
        url: `https://chat.deepseek.com/a/chat/s/${id}`,
        messages,
        createdAt: deepSeekTimestamp(
          session?.created_at ?? session?.createdAt ?? data.created_at ?? data.createdAt ?? data.create_time
        ),
        modelName: deepSeekModelName(
          session?.model, session?.model_name, data.model, data.model_name, data.modelName, data.model_slug
        ),
        platform: 'deepseek',
        source: 'api',
        sourceCompleteness: branch.complete ? 'verified' : 'unverified'
      }
    } catch (error) {
      if (isProviderRateLimitError(error)) throw error
      console.error(`[DeepSeek Parser] Error fetching conversation detail:`, error)
      return null
    }
  }

  private async fetchDeepSeekHistoryMessages(id: string): Promise<any | null> {
    const headers = {
      ...deepSeekRequestHeaders(),
      'Content-Type': 'application/json',
    }
    const getUrl = `https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      credentials: 'include',
      headers,
    })
    if (isRateLimitedResponse(getResponse)) throw new ProviderRateLimitError()
    if (getResponse.ok) {
      const payload = await getResponse.json()
      if (isDeepSeekAuthEnvelope(payload)) {
        this.authenticationRequired = true
        return null
      }
      this.authenticationRequired = false
      return payload
    }
    if (getResponse.status === 401 || getResponse.status === 403) {
      this.authenticationRequired = true
      console.error(`[DeepSeek Parser] Failed to fetch conversation ${id}: ${getResponse.status}`)
      return null
    }

    const postResponse = await fetch('https://chat.deepseek.com/api/v0/chat/history_messages', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ chat_session_id: id }),
    })
    if (isRateLimitedResponse(postResponse)) throw new ProviderRateLimitError()
    if (!postResponse.ok) {
      if (postResponse.status === 401 || postResponse.status === 403) this.authenticationRequired = true
      console.error(`[DeepSeek Parser] Failed to fetch conversation ${id}: ${postResponse.status}`)
      return null
    }
    const payload = await postResponse.json()
    if (isDeepSeekAuthEnvelope(payload)) {
      this.authenticationRequired = true
      return null
    }
    this.authenticationRequired = false
    return payload
  }

  /**
   * Extract conversation ID from the URL
   */
  private extractConversationId(): string | null {
    const match = window.location.pathname.match(/\/a\/chat\/s\/([a-f0-9-]+)/)
    if (match) return match[1]
    const match2 = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/)
    if (match2) return match2[1]
    return null
  }

  /**
   * Extract all messages from the conversation DOM
   * Uses deduplication to avoid counting the same message twice
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    const seenElements = new Set<Element>()

    // Try data-message-author-role first (if DeepSeek uses it)
    const messageElements = document.querySelectorAll('[data-message-author-role]')

    if (messageElements.length > 0) {
      messageElements.forEach(element => {
        if (seenElements.has(element)) return
        seenElements.add(element)
        const message = this.parseMessageElement(element)
        if (message) {
          messages.push(message)
        }
      })
    } else {
      // Fallback: query user and assistant candidates together. Running one
      // selector at a time used to stop after the first user node and silently
      // drop every assistant response. querySelectorAll preserves DOM order.
      const classCandidates = Array.from(document.querySelectorAll(
        '[class*="message-user"], [class*="message-assistant"], ' +
        '[class*="ds-message"], [class*="chat-message"], [class*="turn"]'
      ))
      classCandidates.forEach(element => {
        if (seenElements.has(element)) return
        // Do not parse a generic wrapper when it contains a more specific
        // role-bearing candidate; that would duplicate the transcript.
        const specificChild = element.querySelector(
          '[class*="message-user"], [class*="message-assistant"]'
        )
        if (specificChild && !element.matches('[class*="message-user"], [class*="message-assistant"]')) return
        seenElements.add(element)
        const role = this.determineRoleFromElement(element) || this.determineRoleFromClass(element)
        if (!role) return
        const content = this.extractMessageContent(element)
        if (!content.trim()) return
        messages.push({
          id: element.getAttribute('data-message-id') || generateId(),
          role,
          content,
        })
      })

      // Final fallback: look for generic message containers
      if (messages.length === 0) {
        const genericSelectors = [
          '[class*="message"]',
          '[class*="msg"]',
          '[class*="turn"]'
        ]

        for (const selector of genericSelectors) {
          const elements = document.querySelectorAll(selector)
          elements.forEach(element => {
            if (seenElements.has(element)) return
            seenElements.add(element)
            const message = this.parseGenericMessage(element)
            if (message) {
              messages.push(message)
            }
          })
          if (messages.length > 0) break
        }
      }
    }

    return messages
  }

  /**
   * Parse a message element with data-message-author-role
   */
  private parseMessageElement(element: Element): ChatMessage | null {
    const role = element.getAttribute('data-message-author-role') as ChatMessage['role']
    if (!role || (role !== 'user' && role !== 'assistant')) {
      return null
    }

    const contentElement = element.querySelector(
      '.markdown, [class*="markdown"], [class*="content"]'
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
      name: img.alt,
      uploaded: role === 'user'
    }))

    const messageId = element.getAttribute('data-message-id') || generateId()

    return {
      id: messageId,
      role,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
      timestamp: deepSeekTimestamp(
        element.querySelector('time[datetime]')?.getAttribute('datetime')
          || element.getAttribute('data-timestamp')
          || element.getAttribute('data-created-at')
      )
    }
  }

  /**
   * Determine role from CSS class name
   */
  private determineRoleFromClass(element: Element): ChatMessage['role'] | null {
    const className = element.className || ''
    if (typeof className === 'string') {
      if (className.includes('user')) return 'user'
      if (className.includes('assistant') || className.includes('bot') || className.includes('ai')) return 'assistant'
    }
    return null
  }

  /**
   * Parse a generic message container
   */
  private parseGenericMessage(element: Element): ChatMessage | null {
    const role = this.determineRoleFromElement(element)
    if (!role) return null

    const content = this.extractMessageContent(element)
    if (!content.trim()) return null

    return {
      id: generateId(),
      role,
      content,
    }
  }

  /**
   * Determine role from element by checking indicators
   */
  private determineRoleFromElement(element: Element): ChatMessage['role'] | null {
    const hasUserIndicator = element.querySelector(
      '[class*="user"], [data-role="user"]'
    )
    const hasAssistantIndicator = element.querySelector(
      '[class*="assistant"], [data-role="assistant"], [class*="bot"], [class*="ai"]'
    )

    if (hasUserIndicator) return 'user'
    if (hasAssistantIndicator) return 'assistant'

    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
    if (ariaLabel.includes('user') || ariaLabel.includes('you')) return 'user'
    if (ariaLabel.includes('assistant') || ariaLabel.includes('ai') || ariaLabel.includes('deepseek')) return 'assistant'

    return null
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
      '[class*="edit"]',
      '[class*="regenerate"]'
    ]

    removeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove())
    })

    const contentElement = clone.querySelector(
      '.markdown, [class*="markdown"], [class*="content"], [class*="text"]'
    ) || clone

    return cleanText(extractTextWithMedia(contentElement))
  }

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
      'nav a[href*="/chat/"]',
      'aside a[href*="/chat/"]',
      '[class*="sidebar"] a[href*="/chat/"]',
      '[class*="nav"] a[href*="/chat/"]',
      'a[href*="/a/chat/s/"]',
      'a[href*="/chat/"]'
    ]

    for (const selector of selectors) {
      const links = document.querySelectorAll(selector)

      links.forEach(link => {
        const href = link.getAttribute('href')
        if (!href) return

        const match = href.match(/\/a\/chat\/s\/([a-f0-9-]+)/) || href.match(/\/chat\/([a-f0-9-]+)/)
        if (!match) return

        const id = match[1]
        if (seen.has(id)) return

        const title = extractTextContent(link) || 'Untitled Conversation'

        seen.add(id)
        conversations.push({
          id,
          title,
          url: new URL(href, window.location.origin).href,
          platform: 'deepseek'
        })
      })

      if (conversations.length > 0) break
    }

    return conversations
  }
}

// Create parser instance
const parser = new DeepSeekParser()

// Export for content script
export const config = {
  matches: ['https://deepseek.com/*', 'https://chat.deepseek.com/*']
}

// Register the shared popup-message handler (see src/lib/parser-runtime.ts)
registerParserMessageHandler({
  platform: 'deepseek',
  parser,
  extractConversationId: url =>
    (url.match(/\/a\/chat\/s\/([a-f0-9-]+)/) || url.match(/\/chat\/([a-f0-9-]+)/))?.[1] ?? null
})

// Run on page load
runParserMain(parser)
