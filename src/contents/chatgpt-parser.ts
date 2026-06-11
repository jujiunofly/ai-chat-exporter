/**
 * ChatGPT DOM Parser Content Script
 * Parses conversations from chatgpt.com using DOM reading only
 */

import type { Conversation, ChatMessage, PlatformParser } from '../lib/types'
import { generateId, extractTextContent, extractCodeBlocks, extractImages, cleanText } from '../lib/dom-utils'

/**
 * ChatGPT parser implementation
 */
class ChatGPTParser implements PlatformParser {
  platform = 'chatgpt' as const
  
  /**
   * Check if current page is a ChatGPT conversation
   */
  isConversationPage(): boolean {
    // ChatGPT conversation pages have article elements for messages
    // or the main conversation container
    return !!(
      document.querySelector('[data-message-author-role]') ||
      document.querySelector('article') ||
      document.querySelector('[class*="conversation"]')
    )
  }
  
  /**
   * Get the conversation title from the page
   */
  getConversationTitle(): string {
    // Try to get title from various possible locations
    const titleSelectors = [
      'h1',
      '[class*="title"]',
      'title',
      '.conversation-title'
    ]
    
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const text = extractTextContent(element)
        if (text && text !== 'ChatGPT') {
          return text
        }
      }
    }
    
    // Fallback to page title
    const pageTitle = document.title
    return pageTitle.replace(/\s*[-–|]\s*ChatGPT.*$/i, '').trim() || 'Untitled Conversation'
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
        platform: 'chatgpt'
      }
    } catch (error) {
      return null
    }
  }
  
  /**
   * Extract all messages from the conversation
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    
    // ChatGPT uses data-message-author-role attribute
    const messageElements = document.querySelectorAll('[data-message-author-role]')
    
    if (messageElements.length > 0) {
      messageElements.forEach(element => {
        const message = this.parseMessageElement(element)
        if (message) {
          messages.push(message)
        }
      })
    } else {
      // Fallback: try article elements
      const articles = document.querySelectorAll('article')
      articles.forEach(article => {
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
    
    // Extract content
    const contentElement = element.querySelector(
      '.markdown, [class*="markdown"], [class*="content"]'
    ) || element
    
    const content = this.extractMessageContent(contentElement)
    
    if (!content.trim()) {
      return null
    }
    
    // Extract code blocks
    const codeBlocks = extractCodeBlocks(contentElement)
    
    // Extract images
    const imageData = extractImages(contentElement)
    const attachments = imageData.map(img => ({
      type: 'image' as const,
      url: img.url,
      name: img.alt
    }))
    
    // Generate message ID
    const messageId = element.getAttribute('data-message-id') || generateId()
    
    return {
      id: messageId,
      role,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined
    }
  }
  
  /**
   * Parse an article element (fallback)
   */
  private parseArticleElement(element: Element): ChatMessage | null {
    // Determine role from content or position
    const role = this.determineRoleFromArticle(element)
    if (!role) return null
    
    const content = this.extractMessageContent(element)
    if (!content.trim()) return null
    
    const codeBlocks = extractCodeBlocks(element)
    const imageData = extractImages(element)
    const attachments = imageData.map(img => ({
      type: 'image' as const,
      url: img.url,
      name: img.alt
    }))
    
    return {
      id: generateId(),
      role,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined
    }
  }
  
  /**
   * Determine the role of a message from an article element
   */
  private determineRoleFromArticle(element: Element): ChatMessage['role'] | null {
    // Check for user indicators
    const hasUserIndicator = element.querySelector(
      '[class*="user"], [data-role="user"]'
    )
    
    // Check for assistant indicators
    const hasAssistantIndicator = element.querySelector(
      '[class*="assistant"], [data-role="assistant"], [class*="bot"]'
    )
    
    if (hasUserIndicator) return 'user'
    if (hasAssistantIndicator) return 'assistant'
    
    // Check aria labels
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
    if (ariaLabel.includes('user') || ariaLabel.includes('you')) return 'user'
    if (ariaLabel.includes('assistant') || ariaLabel.includes('ai')) return 'assistant'
    
    // Check icon/avatar presence as heuristic
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
    // Clone to avoid modifying original
    const clone = element.cloneNode(true) as Element
    
    // Remove buttons, controls, and other UI elements
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
    
    // Extract text content
    let content = ''
    
    // Process text nodes and inline elements
    const walker = document.createTreeWalker(
      clone,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return NodeFilter.FILTER_ACCEPT
          }
          
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element
            const tag = el.tagName.toLowerCase()
            
            // Accept text content from these elements
            if (['p', 'span', 'div', 'strong', 'em', 'code'].includes(tag)) {
              return NodeFilter.FILTER_ACCEPT
            }
            
            return NodeFilter.FILTER_SKIP
          }
          
          return NodeFilter.FILTER_SKIP
        }
      }
    )
    
    let node: Node | null
    const textParts: string[] = []
    
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text) {
          textParts.push(text)
        }
      }
    }
    
    content = textParts.join(' ')
    
    // Clean up the content
    return cleanText(content)
  }
  
  /**
   * Extract conversation creation timestamp
   */
  private extractCreatedAt(): number | undefined {
    // Look for time elements or metadata
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
}

// Create parser instance
const parser = new ChatGPTParser()

// Export for content script
export const config = {
  matches: ['https://chatgpt.com/*']
}

// Main function to run when script loads
async function main() {
  if (parser.isConversationPage()) {
    const conversation = await parser.parseCurrentConversation()
    if (conversation) {
      // Store conversation data for popup access
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
    return true // Keep message channel open
  }
  
  if (message.type === 'DETECT_PLATFORM') {
    sendResponse({
      data: {
        platform: 'chatgpt',
        isConversationPage: parser.isConversationPage(),
        title: parser.getConversationTitle()
      }
    })
  }
})

// Run on page load
main()
