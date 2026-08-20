/**
 * ChatGPT DOM Parser Content Script
 * Parses conversations from chatgpt.com using DOM reading and API-based conversation list
 */
import type { Conversation, ChatMessage, ConversationListItem, Attachment } from '../lib/types'
import { generateId, extractTextContent, extractTextWithMedia, extractCodeBlocks, extractImages, cleanText } from '../lib/dom-utils'
import { registerParserMessageHandler, runParserMain } from '../lib/parser-runtime'
import { isProviderRateLimitError, isRateLimitedResponse, payloadLooksRateLimited, ProviderRateLimitError } from '../lib/provider-rate-limit'

function chatGptTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // ChatGPT's API uses Unix seconds; tolerate millisecond payloads from
    // newer endpoints as well.
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

function chatGptModelName(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** Matches the live ChatGPT sidebar page size. Larger bursts trigger history locks. */
const CHATGPT_LIST_PAGE_SIZE = 28
/** Minimum gap between ChatGPT API reads. Tests skip the wait. */
const CHATGPT_REQUEST_GAP_MS = (globalThis as { process?: { env?: { VITEST?: string } } }).process?.env?.VITEST
  ? 0
  : 3000

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

function chatGptLooksRateLimited(status: number, data: unknown): boolean {
  return status === 429 || payloadLooksRateLimited(data)
}

async function readChatGptBody(response: { json?: () => Promise<unknown>; text?: () => Promise<string> }): Promise<unknown> {
  if (typeof response.text === 'function') {
    const text = await response.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return text }
  }
  if (typeof response.json === 'function') return response.json()
  return null
}

const CHATGPT_CANONICAL_ORIGIN = 'https://chatgpt.com'
const CHATGPT_ALLOWED_ORIGINS = new Set([
  CHATGPT_CANONICAL_ORIGIN,
  'https://www.chatgpt.com',
  'https://chat.openai.com'
])

function chatGptConversationIdFromHref(href: string): string | null {
  const match = href.match(/\/c\/([a-zA-Z0-9_-]{8,})/)
  return match?.[1] ?? null
}

function chatGptListItems(data: any): any[] {
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.conversations)) return data.conversations
  if (Array.isArray(data?.data?.items)) return data.data.items
  if (Array.isArray(data?.data?.conversations)) return data.data.conversations
  if (Array.isArray(data?.data) && data.data.every((item: unknown) => item && typeof item === 'object')) {
    return data.data
  }
  return []
}

export type ChatGptBranchIssue =
  | 'current_node_missing'
  | 'leaf_missing'
  | 'missing_parent'
  | 'cycle'
  | 'no_resolvable_leaf'

export interface ChatGptBranchResolution {
  nodes: any[]
  complete: boolean
  leafId?: string
  issue?: ChatGptBranchIssue
}

interface ChatGptConversationListMeta extends Record<string, unknown> {
  source: 'api' | 'sidebar'
  complete: boolean
  pagesFetched?: number
  rateLimited?: boolean
}

/**
 * Resolve ChatGPT's selected root-to-leaf branch and prove that its parent
 * chain reaches a real root. A plausible-looking partial chain is not enough:
 * missing parents and cycles must remain visible to the export safety gate.
 */
export function resolveChatGptActiveBranch(
  nodeMap: Record<string, any>,
  currentNodeId: unknown
): ChatGptBranchResolution {
  const buildChain = (leafId: string): ChatGptBranchResolution => {
    const nodes: any[] = []
    const visited = new Set<string>()
    let nodeId = leafId

    while (nodeId) {
      if (visited.has(nodeId)) {
        return { nodes, complete: false, leafId, issue: 'cycle' }
      }
      visited.add(nodeId)

      const node = nodeMap[nodeId]
      if (!node || typeof node !== 'object') {
        return { nodes, complete: false, leafId, issue: 'missing_parent' }
      }

      nodes.unshift(node)
      if (node.parent === null) {
        return { nodes, complete: true, leafId }
      }
      if (typeof node.parent !== 'string' || !node.parent) {
        return { nodes, complete: false, leafId, issue: 'missing_parent' }
      }
      nodeId = node.parent
    }

    return { nodes, complete: false, leafId, issue: 'missing_parent' }
  }

  if (typeof currentNodeId === 'string' && currentNodeId) {
    if (!nodeMap[currentNodeId]) {
      return { nodes: [], complete: false, leafId: currentNodeId, issue: 'leaf_missing' }
    }
    return buildChain(currentNodeId)
  }

  // Preserve the legacy best-effort transcript for diagnostics, but never
  // certify it: without current_node there is no authoritative branch choice.
  const parentIds = new Set(
    Object.values(nodeMap)
      .map(node => typeof node?.parent === 'string' ? node.parent : null)
      .filter((id): id is string => Boolean(id))
  )
  const fallbackLeafId = Object.entries(nodeMap)
    .filter(([id]) => !parentIds.has(id))
    .sort(([, left], [, right]) => {
      const leftTime = Number(left?.message?.create_time) || 0
      const rightTime = Number(right?.message?.create_time) || 0
      return rightTime - leftTime
    })
    .at(0)?.[0]

  if (!fallbackLeafId) {
    return { nodes: [], complete: false, issue: 'no_resolvable_leaf' }
  }

  const fallback = buildChain(fallbackLeafId)
  return fallback.complete
    ? { ...fallback, complete: false, issue: 'current_node_missing' }
    : fallback
}

function resolveChatGptOrigin(currentOrigin: unknown): string {
  return typeof currentOrigin === 'string' && CHATGPT_ALLOWED_ORIGINS.has(currentOrigin)
    ? currentOrigin
    : CHATGPT_CANONICAL_ORIGIN
}

/**
 * ChatGPT parser implementation
 */
export class ChatGPTParser {
  platform = 'chatgpt' as const
  private accessToken: string | null = null
  private accountId: string | null = null
  private authenticationRequired = false
  private nextRequestAt = 0
  private conversationListMeta: ChatGptConversationListMeta = { source: 'sidebar', complete: false }
  private readonly apiOrigin: string
  private readonly legacyTokenCleanup: Promise<void>

  constructor(currentOrigin: unknown = typeof window !== 'undefined' ? window.location.origin : undefined) {
    this.apiOrigin = resolveChatGptOrigin(currentOrigin)
    this.legacyTokenCleanup = this.removeLegacyStoredToken()
  }

  /** Safe aggregate signal for the scheduled-export status surface. */
  isAuthenticationRequired(): boolean {
    return this.authenticationRequired
  }

  getConversationListMeta(): ChatGptConversationListMeta {
    return { ...this.conversationListMeta }
  }

  /** Remove tokens written by older releases without ever reading them back. */
  private async removeLegacyStoredToken(): Promise<void> {
    try {
      await chrome.storage.local.remove('chatGPTAccessToken')
    } catch {
      // Cleanup is best-effort; auth still proceeds with memory-only state.
    }
  }
  
  /**
   * Check if current page is a ChatGPT conversation
   */
  isConversationPage(): boolean {
    return !!(
      document.querySelector('[data-message-author-role]') ||
      document.querySelector('article') ||
      document.querySelector('[class*="conversation"]')
    )
  }
  
  /**
   * Get the conversation title from the page
   * Strategy:
   * 1. Parse document.title (most reliable: "Conversation Title - ChatGPT")
   * 2. Try sidebar link matching the current URL
   * 3. Fall back to first user message
   * 4. Last resort: "Untitled Conversation"
   */
  getConversationTitle(): string {
    // 1. Parse document.title — most reliable for ChatGPT
    const pageTitle = document.title
    if (pageTitle) {
      // ChatGPT formats titles as "Conversation Title - ChatGPT"
      const cleaned = pageTitle.replace(/\s*[-–|]\s*ChatGPT.*$/i, '').trim()
      if (cleaned && cleaned !== 'ChatGPT' && cleaned.length > 0) {
        return cleaned
      }
    }

    // 2. Try to find the title in the sidebar link matching current conversation URL
    const convId = chatGptConversationIdFromHref(window.location.pathname)
    if (convId) {
      const sidebarLinks = document.querySelectorAll('a[href*="/c/"]')
      for (const link of sidebarLinks) {
        const href = link.getAttribute('href') || ''
        if (href.includes(convId)) {
          const text = extractTextContent(link)
          if (text && text !== 'ChatGPT' && text.length > 0) {
            return text
          }
        }
      }
    }

    // 3. Try first user message as fallback
    const firstUserMsg = document.querySelector('[data-message-author-role="user"]')
    if (firstUserMsg) {
      const text = extractTextContent(firstUserMsg)
      if (text && text.length > 0) {
        // Truncate to reasonable length for a title
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
      
      // Extract real conversation ID from URL (e.g., /c/abc-123-def)
      const conversationId = chatGptConversationIdFromHref(window.location.pathname) || generateId()

      return {
        id: conversationId,
        title: this.getConversationTitle(),
        url: window.location.href,
        messages,
        createdAt: this.extractCreatedAt(),
        platform: 'chatgpt',
        modelName: chatGptModelName(
          document.body.getAttribute('data-model'),
          document.querySelector('[data-model]')?.getAttribute('data-model')
        ),
        source: 'dom',
        sourceCompleteness: 'unverified'
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get a ChatGPT access token by calling the session endpoint.
   * Keeps the token only in this parser instance's memory.
   */
  private async getAccessToken(): Promise<string> {
    await this.legacyTokenCleanup
    if (this.accessToken) return this.accessToken

    const response = await fetch(`${this.apiOrigin}/api/auth/session`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    if (isRateLimitedResponse(response)) throw new ProviderRateLimitError()
    if (response.status === 401 || response.status === 403) {
      this.authenticationRequired = true
      throw new Error('Authentication required')
    }
    const data = await response.json()
    const token = [
      data?.accessToken,
      data?.access_token,
      data?.user?.accessToken,
      data?.account?.accessToken,
    ].find(value => typeof value === 'string' && value)
    const accountId = [
      data?.account?.id,
      data?.user?.chatgpt_account_id,
      data?.user?.chatgptAccountId,
      data?.account?.account_id,
    ].find(value => typeof value === 'string' && value)
    if (typeof accountId === 'string') this.accountId = accountId
    if (typeof token !== 'string' || !token) {
      throw new Error('No access token in response')
    }

    this.accessToken = token
    this.authenticationRequired = false
    return this.accessToken
  }

  private deviceId(): string | null {
    try {
      const stored = window.localStorage?.getItem('oai-did')
      if (stored) return stored
    } catch {}
    try {
      const match = document.cookie.match(/(?:^|; )oai-did=([^;]+)/)
      if (match?.[1]) return decodeURIComponent(match[1])
    } catch {}
    return null
  }

  private conversationAuthHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'oai-language': 'en-US',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    }
    if (token) {
      headers.Authorization = 'Bearer ' + token
      if (this.accountId) headers['Chatgpt-Account-Id'] = this.accountId
      const deviceId = this.deviceId()
      if (deviceId) headers['oai-device-id'] = deviceId
    }
    return headers
  }

  /**
   * Clear cached access token (call on 401)
   */
  private async resetAccessToken(): Promise<void> {
    this.accessToken = null
  }

  private async paceChatGptRequest(): Promise<void> {
    const now = Date.now()
    const startAt = Math.max(now, this.nextRequestAt)
    this.nextRequestAt = startAt + CHATGPT_REQUEST_GAP_MS
    if (startAt > now) await wait(startAt - now)
  }

  /**
   * Fetch ALL conversations via the ChatGPT API (same API the browser uses when scrolling the sidebar).
   * This gets far more conversations than the DOM-only approach.
   */
  async fetchAllConversations(): Promise<ConversationListItem[]> {
    const conversations: ConversationListItem[] = []
    this.conversationListMeta = { source: 'sidebar', complete: false }
    let offset = 0
    const limit = CHATGPT_LIST_PAGE_SIZE
    const maxPages = 200
    let hasMore = true
    let pagesFetched = 0
    let complete = true
    let apiSucceeded = false
    let rateLimited = false
    let retries = 0
    const maxRetries = 1

    const stopForRateLimit = () => {
      if (conversations.length === 0) throw new ProviderRateLimitError()
      rateLimited = true
      complete = false
    }

    const useSidebarFallback = () => {
      this.conversationListMeta = { source: 'sidebar', complete: false }
      return this.getConversationList()
    }

    let token: string | null = null
    try {
      token = await this.getAccessToken()
    } catch (error) {
      if (isProviderRateLimitError(error)) throw error
      // ChatGPT still authenticates some list reads with cookies alone.
    }

    while (hasMore && pagesFetched < maxPages) {
      try {
        await this.paceChatGptRequest()
        const response = await fetch(
          `${this.apiOrigin}/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`,
          {
            credentials: 'include',
            headers: this.conversationAuthHeaders(token)
          }
        )

        if (response.status === 401) {
          if (retries < maxRetries) {
            retries++
            await this.resetAccessToken()
            try {
              token = await this.getAccessToken()
              continue
            } catch (error) {
              if (isProviderRateLimitError(error)) throw error
            }
          }
          this.authenticationRequired = true
          console.error('[ChatGPT Parser] Authentication expired')
          complete = false
          break
        }

        const payload = await readChatGptBody(response)
        if (isRateLimitedResponse(response) || chatGptLooksRateLimited(response.status, payload)) {
          stopForRateLimit()
          break
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) this.authenticationRequired = true
          console.error(`[ChatGPT Parser] API error: ${response.status}`)
          complete = false
          break
        }

        const data = payload
        const items = chatGptListItems(data)
        pagesFetched += 1
        apiSucceeded = true
        this.authenticationRequired = false

        if (items.length === 0) {
          hasMore = false
          break
        }

        for (const item of items) {
          const id = item?.id || item?.conversation_id || item?.conversationId
          if (typeof id !== 'string' || !id) continue
          conversations.push({
            id,
            title: item.title || item.name || 'Untitled Conversation',
            url: `${this.apiOrigin}/c/${id}`,
            platform: 'chatgpt',
            messageCount: item.message_count || item.messageCount || undefined,
            createdAt: chatGptTimestamp(item.create_time ?? item.update_time)
          })
        }

        offset += limit
        if (items.length < limit) hasMore = false
      } catch (error) {
        if (isProviderRateLimitError(error)) throw error
        console.error('[ChatGPT Parser] Error fetching conversations:', error)
        complete = false
        break
      }
    }

    if (pagesFetched >= maxPages && hasMore) complete = false

    // A logged-out or header-stripped list call still returns 200 with items: [].
    // That is not an empty account — fall back to whatever the sidebar can see.
    if (conversations.length === 0) return useSidebarFallback()

    this.conversationListMeta = {
      source: 'api',
      complete,
      pagesFetched,
      ...(rateLimited ? { rateLimited: true } : {}),
    }
    return conversations
  }

  /**
   * Fetch full conversation detail from the ChatGPT API.
   * Returns a complete Conversation object with messages.
   */
  async fetchConversationDetail(id: string): Promise<Conversation | null> {
    try {
      let token: string | null = null
      try {
        token = await this.getAccessToken()
      } catch (error) {
        if (isProviderRateLimitError(error)) throw error
      }
      let data: any | null = null

      for (let attempt = 0; attempt < 2; attempt++) {
        await this.paceChatGptRequest()
        const response = await fetch(
          `${this.apiOrigin}/backend-api/conversation/${id}`,
          {
            credentials: 'include',
            headers: this.conversationAuthHeaders(token)
          }
        )

        if (response.status === 401 && attempt === 0) {
          await this.resetAccessToken()
          try {
            token = await this.getAccessToken()
          } catch (error) {
            if (isProviderRateLimitError(error)) throw error
            token = null
          }
          continue
        }

        const payload = await readChatGptBody(response)
        if (isRateLimitedResponse(response) || chatGptLooksRateLimited(response.status, payload)) {
          throw new ProviderRateLimitError()
        }

        if (!response.ok) {
          console.error(`[ChatGPT Parser] Failed to fetch conversation ${id}: ${response.status}`)
          return null
        }

        data = payload
        break
      }

      if (!data) return null
      const messages: ChatMessage[] = []
      let sourceCompleteness: Conversation['sourceCompleteness'] = 'unverified'
      let modelName = chatGptModelName(
        data.default_model_slug,
        data.model_slug,
        data.model,
        data.metadata?.model_slug,
        data.metadata?.default_model_slug
      )

      // ChatGPT API returns a tree of messages with mapping
      if (data.mapping && typeof data.mapping === 'object') {
        const nodeMap: Record<string, any> = data.mapping
        // A conversation mapping contains every edited/regenerated branch.
        // Only its current_node is the path the user is actually viewing.
        const branch = resolveChatGptActiveBranch(nodeMap, data.current_node)
        sourceCompleteness = branch.complete ? 'verified' : 'unverified'
        for (const node of branch.nodes) {
          if (node.message) {
            const msg = node.message
            const role = msg.author?.role
            if (role === 'user' || role === 'assistant') {
              const { text: content, attachments: partAttachments } = this.extractParts(msg.content?.parts, role)
              if (content.trim() || partAttachments.length > 0) {
                modelName ||= chatGptModelName(
                  msg.metadata?.model_slug,
                  msg.metadata?.default_model_slug,
                  msg.model_slug,
                  msg.model
                )
                messages.push({
                  id: msg.id || generateId(),
                  role: role as ChatMessage['role'],
                  content: content.trim(),
                  attachments: partAttachments.length ? partAttachments : undefined,
                  timestamp: chatGptTimestamp(msg.create_time)
                })
              }
            }
          }
        }
      }

      // Older API payloads may be a flat authoritative transcript. Never use
      // this fallback to hide a broken mapping/current_node tree.
      else if (Array.isArray(data.messages)) {
        sourceCompleteness = 'verified'
        for (const msg of data.messages) {
          const role = msg.author?.role || msg.role
          if (role === 'user' || role === 'assistant') {
            const { text: content, attachments: partAttachments } = this.extractParts(msg.content?.parts, role)
            if (content.trim() || partAttachments.length > 0) {
              modelName ||= chatGptModelName(
                msg.metadata?.model_slug,
                msg.metadata?.default_model_slug,
                msg.model_slug,
                msg.model
              )
              messages.push({
                id: msg.id || generateId(),
                role: role as ChatMessage['role'],
                content: content.trim(),
                attachments: partAttachments.length ? partAttachments : undefined,
                timestamp: chatGptTimestamp(msg.create_time)
              })
            }
          }
        }
      }

      return {
        id: data.id || data.conversation_id || id,
        title: data.title || this.getConversationTitle(),
        url: `${this.apiOrigin}/c/${id}`,
        messages,
        createdAt: chatGptTimestamp(data.create_time),
        modelName,
        platform: 'chatgpt',
        source: 'api',
        sourceCompleteness
      }
    } catch (error) {
      if (isProviderRateLimitError(error)) throw error
      console.error(`[ChatGPT Parser] Error fetching conversation detail:`, error)
      return null
    }
  }

  /**
   * Extract all messages from the conversation
   * Uses deduplication to avoid counting the same message twice
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    const seenElements = new Set<Element>()
    
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
      // Fallback: try article elements only if no data-message-author-role found
      const articles = document.querySelectorAll('article')
      articles.forEach(article => {
        if (seenElements.has(article)) return
        seenElements.add(article)
        const message = this.parseArticleElement(article)
        if (message) {
          messages.push(message)
        }
      })
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
      timestamp: this.extractMessageTimestamp(element)
    }
  }
  
  /**
   * Parse an article element (fallback)
   */
  private parseArticleElement(element: Element): ChatMessage | null {
    const role = this.determineRoleFromArticle(element)
    if (!role) return null
    
    const content = this.extractMessageContent(element)
    if (!content.trim()) return null
    
    const codeBlocks = extractCodeBlocks(element)
    const imageData = extractImages(element)
    const attachments = imageData.map(img => ({
      type: 'image' as const,
      url: img.url,
      name: img.alt,
      uploaded: role === 'user'
    }))
    
    return {
      id: generateId(),
      role,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
      timestamp: this.extractMessageTimestamp(element)
    }
  }
  
  /**
   * Determine the role of a message from an article element
   */
  private determineRoleFromArticle(element: Element): ChatMessage['role'] | null {
    const hasUserIndicator = element.querySelector(
      '[class*="user"], [data-role="user"]'
    )
    const hasAssistantIndicator = element.querySelector(
      '[class*="assistant"], [data-role="assistant"], [class*="bot"]'
    )
    
    if (hasUserIndicator) return 'user'
    if (hasAssistantIndicator) return 'assistant'
    
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
    if (ariaLabel.includes('user') || ariaLabel.includes('you')) return 'user'
    if (ariaLabel.includes('assistant') || ariaLabel.includes('ai')) return 'assistant'
    
    const hasUserAvatar = element.querySelector('[class*="avatar-user"]')
    const hasAssistantAvatar = element.querySelector('[class*="avatar-assistant"], [class*="logo"]')
    
    if (hasUserAvatar) return 'user'
    if (hasAssistantAvatar) return 'assistant'
    
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
    
    // Preserve DOM image nodes as Markdown at their original position. The
    // previous text-only walker made every rendered image look like a trailing
    // attachment once the shared exporter received it.
    return cleanText(extractTextWithMedia(clone))
  }
  
  /**
   * Extract text and attachments from ChatGPT message content parts.
   * ChatGPT API content parts are objects with .text, .type, etc. — not strings.
   */
  private extractParts(
    parts: any[] | undefined,
    role: ChatMessage['role']
  ): { text: string; attachments: Attachment[] } {
    const textParts: string[] = []
    const attachments: Attachment[] = []
    if (!parts || !Array.isArray(parts)) return { text: '', attachments }
    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        if (typeof part === 'string') textParts.push(part)
        continue
      }
      if (typeof part.text === 'string') {
        textParts.push(cleanText(part.text))
      } else if (part.type === 'image_file' || part.type === 'file') {
        const url = (part.file && part.file.url) || ''
        attachments.push({
          type: 'file',
          url,
          name: part.name || 'Uploaded file',
          uploaded: role === 'user'
        })
      } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
        attachments.push({
          type: 'image',
          url: part.image_url.url,
          name: 'Image',
          uploaded: role === 'user'
        })
      }
    }
    return { text: textParts.join('\n').trim(), attachments }
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

  private extractMessageTimestamp(element: Element): number | undefined {
    const timeValue = element.querySelector('time[datetime]')?.getAttribute('datetime')
    const attributeValue = element.getAttribute('data-timestamp')
      || element.getAttribute('data-created-at')
      || element.getAttribute('data-create-time')
    return chatGptTimestamp(timeValue || attributeValue)
  }
  
  /**
   * Get list of conversations from the sidebar (DOM-based, limited to visible items)
   */
  getConversationList(): ConversationListItem[] {
    const conversations: ConversationListItem[] = []
    const seen = new Set<string>()
    
    const selectors = [
      'nav a[href*="/c/"]',
      'aside a[href*="/c/"]',
      '[class*="sidebar"] a[href*="/c/"]',
      '[class*="nav"] a[href*="/c/"]',
      'a[href*="/c/"]',
      'a[href^="/c/"]'
    ]
    
    for (const selector of selectors) {
      const links = document.querySelectorAll(selector)
      
      links.forEach(link => {
        const href = link.getAttribute('href')
        if (!href) return
        
        const id = chatGptConversationIdFromHref(href)
        if (!id) return
        if (seen.has(id)) return
        
        const title = extractTextContent(link) || 'Untitled Conversation'
        
        seen.add(id)
        conversations.push({
          id,
          title,
          url: new URL(href, window.location.origin).href,
          platform: 'chatgpt'
        })
      })
      
      if (conversations.length > 0) break
    }
    
    return conversations
  }
}

// Create parser instance
const parser = new ChatGPTParser()

// Export for content script
export const config = {
  matches: ['https://chatgpt.com/*', 'https://www.chatgpt.com/*', 'https://chat.openai.com/*']
}

// Register the shared popup-message handler (see src/lib/parser-runtime.ts)
registerParserMessageHandler({
  platform: 'chatgpt',
  parser,
  extractConversationId: url => url.match(/\/c\/([a-zA-Z0-9_-]{8,})/)?.[1] ?? null,
  requireApiDetailForCurrentExport: true,
  preferApiDetailWhenComplete: true,
  apiDetailUnavailableError:
    'ChatGPT did not return a verifiably complete active branch. Export was stopped instead of saving a potentially truncated page snapshot. Reload ChatGPT and try again.'
})

// Run on page load
runParserMain(parser)
