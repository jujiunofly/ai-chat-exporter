/**
 * Claude DOM Parser Content Script
 * Parses conversations from claude.ai using DOM reading and API-based conversation list
 *
 * Authentication Strategy:
 * - Cookie-based: Claude uses session cookies sent with credentials: 'include'
 * - No access token needed — the browser's cookie handles authentication
 * - Org ID is extracted from the page HTML or API responses
 */
import type { Conversation, ChatMessage, PlatformParser, ConversationListItem, ConversationArtifact } from '../lib/types'
import { generateId, extractTextContent, extractCodeBlocks, extractImages } from '../lib/dom-utils'
import { preferMoreCompleteConversation } from '../lib/parser-fallback'
import { getApiMessageRecords, normalizeApiMessageRole } from '../lib/api-message-normalizer'
import { inferClaudeArtifactType } from '../lib/claude-artifact'
import { claudeElementToMarkdown, extractClaudeMessageMarkdown, normalizeClaudeMarkdown } from '../lib/claude-rich-text'

/** UUID regex for matching conversation IDs and org IDs */
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** Regex to extract org ID from API URLs in the page */
const ORG_API_REGEX = /\/api\/organizations\/([a-f0-9-]{36})\/chat_conversations/i

/** Regex to extract org ID from lastActiveOrg cookie or page data */
const LAST_ACTIVE_ORG_REGEX = /lastActiveOrg[^a-f0-9]{0,120}?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i

/** Regex to extract org ID from analytics/user ID calls */
const USER_ID_REGEX = /"_setUserId",\s*"([a-f0-9-]{36})"/i

type ClaudeApiRecord = Record<string, any>

function firstString(...values: unknown[]): string | null {
  return values.find(value => typeof value === 'string' && value.trim()) as string | null || null
}

function recordId(record: ClaudeApiRecord): string | null {
  return firstString(record.uuid, record.id, record.message_uuid, record.messageUuid)
}

function parentId(record: ClaudeApiRecord): string | null {
  return firstString(
    record.parent_uuid,
    record.parent_message_uuid,
    record.parentMessageUuid,
    record.parent_id,
    record.parentId,
    record.parent?.uuid,
    record.parent?.id
  )
}

function findBranchPointer(value: any, depth = 0): string | null {
  if (!value || depth > 3 || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBranchPointer(item, depth + 1)
      if (found) return found
    }
    return null
  }
  const direct = firstString(
    value.current_leaf_message_uuid,
    value.current_leaf_uuid,
    value.currentLeafMessageUuid,
    value.currentLeafUuid,
    value.current_node_uuid,
    value.currentNodeUuid,
    value.current_node?.uuid,
    value.current_node?.id,
    value.currentNode?.uuid,
    value.currentNode?.id
  )
  if (direct) return direct
  for (const key of ['conversation', 'metadata', 'tree', 'branch']) {
    const found = findBranchPointer(value[key], depth + 1)
    if (found) return found
  }
  return null
}

/**
 * Resolve Claude's tree response to one active parent chain. Returning every
 * record from a `tree=True` response exports abandoned regenerated answers.
 * When an explicit leaf is unavailable, active flags or the longest coherent
 * chain are used as a conservative fallback instead of flattening siblings.
 */
export function selectClaudeActiveBranch(
  records: ClaudeApiRecord[],
  payload: unknown
): ClaudeApiRecord[] {
  if (records.length < 2) return records
  const byId = new Map(records.map(record => [recordId(record), record]).filter(([id]) => Boolean(id)) as [string, ClaudeApiRecord][])
  const leafId = findBranchPointer(payload)

  const buildChain = (startId: string): ClaudeApiRecord[] => {
    const chain: ClaudeApiRecord[] = []
    const seen = new Set<string>()
    let current: string | null = startId
    while (current && !seen.has(current)) {
      seen.add(current)
      const record = byId.get(current)
      if (!record) return []
      chain.push(record)
      current = parentId(record)
    }
    if (current) return []
    return chain.reverse()
  }

  if (leafId && byId.has(leafId)) {
    const chain = buildChain(leafId)
    if (chain.length > 0) return chain
  }

  const active = records.filter(record =>
    record.is_current === true || record.isCurrent === true || record.active === true ||
    record.selected === true || record.is_active === true
  )
  if (active.length > 0) {
    const activeLeaf = active[active.length - 1]
    const activeId = recordId(activeLeaf)
    if (activeId) {
      const chain = buildChain(activeId)
      if (chain.length > 0) return chain
    }
  }

  const hasParents = records.some(record => parentId(record))
  if (!hasParents) return records

  // Choose the most complete parent chain. Ties use the last leaf in API
  // order, which is generally the newest branch, while still excluding all
  // sibling records from the export.
  const children = new Set(records.map(parentId).filter(Boolean) as string[])
  const leaves = records.filter(record => {
    const id = recordId(record)
    return Boolean(id && !children.has(id))
  })
  let best: ClaudeApiRecord[] = []
  for (const leaf of leaves) {
    const id = recordId(leaf)
    if (!id) continue
    const chain = buildChain(id)
    if (chain.length >= best.length) best = chain
  }
  return best.length > 0 ? best : records.slice(0, 1)
}

/**
 * Extract organization ID from the page.
 * Tries multiple strategies:
 * 1. Find org ID from API URLs in the page HTML
 * 2. Find from lastActiveOrg in page data
 * 3. Find from _setUserId analytics calls
 */
function extractOrgId(): string | null {
  try {
    const html = document.documentElement?.innerHTML || ''

    // Strategy 1: Find org ID from API URLs
    const apiMatch = html.match(ORG_API_REGEX)
    if (apiMatch && apiMatch[1]) {
      return apiMatch[1]
    }

    // Strategy 2: Find from lastActiveOrg pattern
    const lastActiveMatch = html.match(LAST_ACTIVE_ORG_REGEX)
    if (lastActiveMatch && lastActiveMatch[1]) {
      return lastActiveMatch[1]
    }

    // Strategy 3: Find from _setUserId analytics
    const userIdMatch = html.match(USER_ID_REGEX)
    if (userIdMatch && userIdMatch[1]) {
      return userIdMatch[1]
    }
  } catch {
    // HTML not available
  }

  return null
}

/**
 * Claude parser implementation
 */
export class ClaudeParser implements PlatformParser {
  platform = 'claude' as const

  /** Cached org ID to avoid re-extracting */
  private cachedOrgId: string | null = null

  /**
   * Check if current page is a Claude conversation
   */
  isConversationPage(): boolean {
    return !!(
      document.querySelector('[data-testid="chat-message"]') ||
      document.querySelector('.font-claude-message') ||
      document.querySelector('[data-is-streaming]') ||
      document.querySelector('.font-claude-response') ||
      document.querySelector('[data-testid="user-message"]') ||
      document.querySelector('[data-testid="assistant-message"]') ||
      window.location.pathname.match(/\/chat\/[a-f0-9-]+/)
    )
  }

  /**
   * Get the conversation title from the page
   * Strategy:
   * 1. Parse document.title (most reliable: "Conversation Title | Claude" or "- Claude")
   * 2. Try first user message as fallback
   * 3. Last resort: "Untitled Conversation"
   */
  getConversationTitle(): string {
    // 1. Parse document.title — most reliable for Claude
    const pageTitle = document.title
    if (pageTitle) {
      // Claude formats titles as "Conversation Title | Claude" or "Conversation Title - Claude"
      const cleaned = pageTitle.replace(/\s*[|–-]\s*Claude.*$/i, '').trim()
      if (cleaned && cleaned !== 'Claude' && cleaned.length > 0) {
        return cleaned
      }
    }

    // 2. Try first user message as fallback
    const firstUserMsg = document.querySelector('[data-testid="user-message"]')
    if (firstUserMsg) {
      const text = extractTextContent(firstUserMsg)
      if (text && text.length > 0) {
        return text.length > 80 ? text.substring(0, 80) + '...' : text
      }
    }

    // 3. Fallback: look for any user message by role indicators
    const userMsg = document.querySelector('[class*="user-message"], [data-role="user"]')
    if (userMsg) {
      const text = extractTextContent(userMsg)
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

      // Extract real conversation ID from URL (e.g., /chat/abc-123-def)
      const urlMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/)
      const conversationId = urlMatch?.[1] || generateId()

      return {
        id: conversationId,
        title: this.getConversationTitle(),
        url: window.location.href,
        messages,
        createdAt: this.extractCreatedAt(),
        platform: 'claude'
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get the organization ID for API calls.
   * Caches the result to avoid re-extraction.
   */
  private async getOrgId(): Promise<string | null> {
    if (this.cachedOrgId && UUID_REGEX.test(this.cachedOrgId)) {
      return this.cachedOrgId
    }

    // Try extracting from page
    const orgId = extractOrgId()
    if (orgId) {
      this.cachedOrgId = orgId
      return orgId
    }

    // Try fetching from session API
    try {
      const response = await fetch('https://claude.ai/api/auth/session', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        if (data.orgID) {
          this.cachedOrgId = data.orgID
          return data.orgID
        }
        // Some responses have organization details
        if (data.organization?.id) {
          this.cachedOrgId = data.organization.id
          return data.organization.id
        }
      }
    } catch {
      // Session API not available
    }

    return null
  }

  /**
   * Fetch ALL conversations via the Claude API.
   * Uses cookie-based authentication (no access token needed).
   */
  async fetchAllConversations(): Promise<ConversationListItem[]> {
    const conversations: ConversationListItem[] = []
    let offset = 0
    const limit = 100
    let hasMore = true
    let retries = 0
    const maxRetries = 1

    const orgId = await this.getOrgId()
    if (!orgId) {
      console.error('[Claude Parser] Could not determine organization ID')
      return this.getConversationList() // Fall back to DOM
    }

    while (hasMore) {
      try {
        const response = await fetch(
          `https://claude.ai/api/organizations/${orgId}/chat_conversations?limit=${limit}&offset=${offset}`,
          {
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
            }
          }
        )

        if (response.status === 401 || response.status === 403) {
          console.error(`[Claude Parser] Authentication error: ${response.status}`)
          break
        }

        if (!response.ok) {
          console.error(`[Claude Parser] API error: ${response.status}`)
          break
        }

        const data = await response.json()
        const items = data.conversations || data.items || []

        if (items.length === 0) {
          hasMore = false
          break
        }

        for (const item of items) {
          conversations.push({
            id: item.uuid || item.id,
            title: item.name || item.title || 'Untitled Conversation',
            url: `https://claude.ai/chat/${item.uuid || item.id}`,
            platform: 'claude',
            createdAt: item.created_at ? new Date(item.created_at).getTime() : undefined
          })
        }

        offset += limit

        // If we got fewer items than the limit, we've reached the end
        if (items.length < limit) {
          hasMore = false
        }
      } catch (error) {
        console.error('[Claude Parser] Error fetching conversations:', error)
        break
      }
    }

    // If API didn't return results, fall back to DOM
    if (conversations.length === 0) {
      return this.getConversationList()
    }

    return conversations
  }

  /**
   * Fetch full conversation detail from the Claude API.
   * Returns a complete Conversation object with messages.
   */
  async fetchConversationDetail(id: string): Promise<Conversation | null> {
    try {
      const orgId = await this.getOrgId()
      if (!orgId) {
        console.error('[Claude Parser] Could not determine organization ID for detail fetch')
        return null
      }

      const response = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`,
        {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          }
        }
      )

      if (response.status === 401 || response.status === 403) {
        console.error(`[Claude Parser] Auth error for conversation ${id}: ${response.status}`)
        return null
      }

      if (!response.ok) {
        console.error(`[Claude Parser] Failed to fetch conversation ${id}: ${response.status}`)
        return null
      }

      const data = await response.json()
      const messages: ChatMessage[] = []
      const artifacts: ConversationArtifact[] = []

      const apiRecords = getApiMessageRecords(data) as ClaudeApiRecord[]
      const activeRecords = selectClaudeActiveBranch(apiRecords, data)
      for (const msg of activeRecords) {
          const role = normalizeApiMessageRole(msg)
          if (!role) continue

          const content = extractClaudeMessageMarkdown(msg)
          const blocks = Array.isArray(msg.content) ? msg.content : []
          for (const block of blocks) {
            if (!block || typeof block !== 'object') continue
            const typedBlock = block as Record<string, any>
            if (typedBlock.type === 'tool_use' && typedBlock.input?.content) {
              artifacts.push({
                type: inferClaudeArtifactType(typedBlock),
                title: typedBlock.input.title || typedBlock.name || 'Artifact',
                content: typedBlock.input.content,
                language: typedBlock.name,
                mimeType: typedBlock.input.mimeType
              })
            } else if (typedBlock.type === 'document') {
              artifacts.push({
                type: 'document',
                title: typedBlock.title || typedBlock.file_name || 'Uploaded File',
                content: typeof typedBlock.content === 'string' ? typedBlock.content : typedBlock.text || '',
                mimeType: typedBlock.media_type || typedBlock.mime_type
              })
            }
          }

          if (content.trim()) {
            messages.push({
              id: typeof msg.uuid === 'string'
                ? msg.uuid
                : typeof msg.id === 'string'
                  ? msg.id
                  : generateId(),
              role,
              content: normalizeClaudeMarkdown(content),
            })
          }
      }

      const conversation: Conversation = {
        id: data.uuid || data.id || id,
        title: data.name || data.title || this.getConversationTitle(),
        url: `https://claude.ai/chat/${id}`,
        messages,
        createdAt: data.created_at ? new Date(data.created_at).getTime() : undefined,
        platform: 'claude',
        artifacts: artifacts.length > 0 ? artifacts : undefined
      }

      return conversation
    } catch (error) {
      console.error(`[Claude Parser] Error fetching conversation detail:`, error)
      return null
    }
  }

  /**
   * Extract all messages from the conversation DOM.
   * Uses deduplication to avoid counting the same message twice.
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    const seenElements = new Set<Element>()

    // Primary: keep the candidates in DOM order. Claude's answer container has
    // changed from the styling-only `.font-claude-message` class to the more
    // durable `[data-is-streaming]` attribute. Querying role-specific nodes in
    // separate passes (all assistants, then all users) silently reorders the
    // transcript, so the combined selector is intentional.
    const roleSpecificSelector =
      '[data-testid="user-message"], [data-testid="assistant-message"], [data-is-streaming], ' +
      '.font-claude-message, .font-claude-response, [data-role="user"], [data-role="assistant"], ' +
      '[class*="user-message"], [class*="human-message"], [class*="assistant-message"]'
    const roleSpecificMessages = document.querySelectorAll(roleSpecificSelector)
    // Prefer the smallest role-bearing nodes whenever they are available.
    // Otherwise a generic chat-message wrapper can be parsed as well.
    const messageContainers = roleSpecificMessages.length > 0
      ? roleSpecificMessages
      : document.querySelectorAll('[data-testid="chat-message"]')

    if (messageContainers.length > 0) {
      messageContainers.forEach(element => {
        if (seenElements.has(element)) return
        // A current Claude answer can contain a nested `.font-claude-message`
        // element inside its `[data-is-streaming]` container. Parse the
        // semantic container once instead of exporting the same answer twice.
        const streamingContainer = element.closest('[data-is-streaming]')
        if (
          element.matches('.font-claude-message, .font-claude-response') &&
          streamingContainer &&
          streamingContainer !== element
        ) {
          return
        }
        seenElements.add(element)
        const message = this.parseMessageElement(element)
        if (message) {
          messages.push(message)
        }
      })
    } else {
      // No known marker matched. Keep a conservative last-resort scan for
      // message-like nodes, but still walk them in document order.
      const fallbackMessages = document.querySelectorAll(
        '[class*="response"], [aria-label*="Claude" i], [aria-label*="assistant" i], ' +
        '[aria-label*="user" i], [aria-label*="human" i]'
      )
      fallbackMessages.forEach(element => {
        if (seenElements.has(element)) return
        seenElements.add(element)
        const content = this.extractMessageContent(element)
        if (!content.trim()) return

        const role = this.determineRoleFromElement(element)
        if (!role) return

        messages.push({
          id: generateId(),
          role,
          content: normalizeClaudeMarkdown(content)
        })
      })
    }

    return messages
  }

  /**
   * Parse a message element from Claude's DOM.
   * Determines the role from data-testid or other attributes.
   */
  private parseMessageElement(element: Element): ChatMessage | null {
    // Determine role from data-testid
    const testId = element.getAttribute('data-testid')
    let role: ChatMessage['role'] | null = null

    if (testId === 'user-message') {
      role = 'user'
    } else if (testId === 'assistant-message') {
      role = 'assistant'
    } else if (
      element.hasAttribute('data-is-streaming') ||
      element.matches('.font-claude-message, .font-claude-response')
    ) {
      // Claude currently marks assistant turns with data-is-streaming. The
      // value is true while a response is being generated and false once it
      // settles; both are assistant messages.
      role = 'assistant'
    } else if (testId === 'chat-message') {
      // For chat-message, check for user/assistant indicators inside
      const hasUserIndicator = element.querySelector('[data-testid="user-message"]') ||
        element.closest('[data-testid="user-message"]')
      const hasAssistantIndicator = element.querySelector('[data-testid="assistant-message"]') ||
        element.querySelector('.font-claude-message')

      if (hasUserIndicator) {
        role = 'user'
      } else if (hasAssistantIndicator) {
        role = 'assistant'
      } else {
        // Try to determine from class names or content
        role = this.determineRoleFromElement(element)
      }
    }

    if (!role) return null

    // Extract content from the message
    const contentElement = element.querySelector(
      '.font-claude-message, .font-claude-response, .prose, [class*="markdown"], [class*="content"]'
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
      element.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      generateId()

    return {
      id: messageId,
      role,
      content: normalizeClaudeMarkdown(content),
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined
    }
  }

  /**
   * Determine the role of a message from an element's class names and attributes.
   */
  private determineRoleFromElement(element: Element): ChatMessage['role'] | null {
    // Check for user-related classes
    const classList = Array.from(element.classList || [])
    const hasUserClass = classList.some(cls =>
      cls.includes('user') || cls.includes('human') || cls.includes('Human')
    )
    const hasAssistantClass = classList.some(cls =>
      cls.includes('assistant') || cls.includes('claude') || cls.includes('Claude') || cls.includes('response')
    )

    if (hasUserClass) return 'user'
    if (hasAssistantClass) return 'assistant'

    // Check aria-label
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
    if (ariaLabel.includes('user') || ariaLabel.includes('human') || ariaLabel.includes('you')) {
      return 'user'
    }
    if (ariaLabel.includes('assistant') || ariaLabel.includes('claude') || ariaLabel.includes('ai')) {
      return 'assistant'
    }

    if (element.hasAttribute('data-is-streaming')) return 'assistant'

    // Check for role attribute
    const roleAttr = element.getAttribute('role')?.toLowerCase() || ''
    if (roleAttr === 'user' || roleAttr === 'human') return 'user'
    if (roleAttr === 'assistant' || roleAttr === 'ai') return 'assistant'

    return null
  }

  /**
   * Extract clean content from a message element.
   * Removes buttons, toolbars, and other non-content elements.
   */
  private extractMessageContent(element: Element): string {
    const clone = element.cloneNode(true) as Element

    // Remove non-content elements
    return claudeElementToMarkdown(clone)
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

    // Claude sidebar links typically point to /chat/{uuid}
    const selectors = [
      'nav a[href*="/chat/"]',
      'aside a[href*="/chat/"]',
      '[class*="sidebar"] a[href*="/chat/"]',
      '[class*="nav"] a[href*="/chat/"]',
      'a[href^="/chat/"]'
    ]

    for (const selector of selectors) {
      const links = document.querySelectorAll(selector)

      links.forEach(link => {
        const href = link.getAttribute('href')
        if (!href) return

        const match = href.match(/\/chat\/([a-f0-9-]+)/)
        if (!match) return

        const id = match[1]
        if (seen.has(id)) return

        const title = extractTextContent(link) || 'Untitled Conversation'

        seen.add(id)
        conversations.push({
          id,
          title,
          url: new URL(href, window.location.origin).href,
          platform: 'claude'
        })
      })

      if (conversations.length > 0) break
    }

    return conversations
  }
}

// Create parser instance
const parser = new ClaudeParser()

// Export for content script
export const config = {
  matches: ['https://claude.ai/*']
}

// Main function to run when script loads
async function main() {
  if (parser.isConversationPage()) {
    const conversation = await parser.parseCurrentConversation()
    if (conversation) {
      chrome.storage.local.set({
        [`conversation-${conversation.id}`]: { ...conversation, timestamp: Date.now() }
      })
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PARSE_CONVERSATION') {
    parser.parseCurrentConversation().then(conversation => {
      // API detail is preferred when available because it preserves markdown,
      // artifacts, attachments, and assistant responses better than DOM text extraction.
      const url = window.location.href
      const match = url.match(/\/chat\/([a-f0-9-]+)/)
      if (match) {
        parser.fetchConversationDetail(match[1]).then(apiConv => {
          sendResponse({ data: preferMoreCompleteConversation(conversation, apiConv) })
        }).catch(err => {
          console.error('[Claude Parser] API fetch error:', err)
          sendResponse({ data: conversation })
        })
      } else {
        sendResponse({ data: conversation })
      }
    }).catch(error => {
      console.error('[Claude Parser] parseCurrentConversation error:', error)
      sendResponse({ error: error.message })
    })
    return true // Keep message channel open
  }

  if (message.type === 'DETECT_PLATFORM') {
    sendResponse({
      data: {
        platform: 'claude',
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
