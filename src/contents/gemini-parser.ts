/**
 * Gemini DOM Parser Content Script
 * Parses conversations from gemini.google.com using DOM reading and API-based conversation list
 */
import type { Conversation, ChatMessage, PlatformParser, ConversationListItem } from '../lib/types'
import { generateId, extractTextContent, extractCodeBlocks, extractImages, cleanText } from '../lib/dom-utils'

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
   */
  getConversationTitle(): string {
    const titleSelectors = [
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      'h1',
      'title'
    ]
    
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const text = extractTextContent(element)
        if (text && text !== 'Gemini') {
          return text
        }
      }
    }
    
    const pageTitle = document.title
    return pageTitle.replace(/\s*[-–|]\s*Gemini.*$/i, '').trim() || 'Untitled Conversation'
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
   * Fetch ALL conversations via Gemini's batchexecute API.
   * This gets the conversation history from the server rather than just the visible sidebar.
   */
  async fetchAllConversations(): Promise<ConversationListItem[]> {
    const conversations: ConversationListItem[] = []
    
    try {
      // Get the SNlM0e auth token from the page
      const authMatch = document.cookie.match(/SNlM0e=([^;]+)/)
      if (!authMatch) {
        console.error('[Gemini Parser] Could not find auth token')
        return this.getConversationList() // Fall back to DOM
      }
      const authToken = authMatch[1]

      // Use the batchexecute API to fetch conversation list
      // This is the same API Gemini uses internally
      let nextPageToken: string | undefined
      let hasMore = true

      while (hasMore) {
        try {
          // Build the request body for batchexecute
          const batchBody = `f.req=${encodeURIComponent(JSON.stringify([
            [null, null, null, null, null, [nextPageToken || ''], null, null, null, null]
          ]))}`

          const response = await fetch(
            'https://gemini.google.com/_/BardChatUi/data/batchexecute',
            {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: `f.req=${encodeURIComponent(JSON.stringify([
                ['ChatHistoryListUi', null, [nextPageToken || ''], null, 'generic']
              ]))}`
            }
          )

          if (!response.ok) {
            console.error(`[Gemini Parser] API error: ${response.status}`)
            break
          }

          const text = await response.text()
          
          // Parse the response (it's in a special format)
          // Each line starts with a number followed by the JSON data
          const lines = text.split('\n')
          let parsed = false

          for (const line of lines) {
            if (line.startsWith('[')) {
              try {
                const data = JSON.parse(line)
                if (Array.isArray(data) && data.length > 0) {
                  // Look for conversation items in the response
                  const items = this.parseBatchResponse(data)
                  if (items.length > 0) {
                    conversations.push(...items)
                    parsed = true
                  }
                  // Check for next page token
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
   * Extract all messages from the conversation
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    
    const querySelectors = [
      '.user-query',
      '[class*="user-message"]',
      '[data-message-author-role="user"]',
      '[class*="query"]'
    ]
    
    const responseSelectors = [
      '.model-response',
      '[class*="model-message"]',
      '[data-message-author-role="model"]',
      '[class*="response"]'
    ]
    
    querySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        const message = this.parseMessageElement(element, 'user')
        if (message) {
          messages.push(message)
        }
      })
    })
    
    responseSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        const message = this.parseMessageElement(element, 'assistant')
        if (message) {
          messages.push(message)
        }
      })
    })
    
    // Sort by position in DOM
    messages.sort((a, b) => {
      const posA = this.getElementPosition(a.id)
      const posB = this.getElementPosition(b.id)
      return posA - posB
    })
    
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
  
  /**
   * Get element position in the document
   */
  private getElementPosition(elementId: string): number {
    const element = document.getElementById(elementId)
    if (!element) return 0
    
    let position = 0
    let current: Element | null = element
    
    while (current) {
      const prev = current.previousElementSibling
      if (prev) {
        position++
        current = prev
      } else {
        current = current.parentElement
      }
    }
    
    return position
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
      sendResponse({ data: conversation })
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
})

// Run on page load
main()
