/**
 * Gemini DOM Parser Content Script
 * Parses conversations from gemini.google.com using DOM reading only
 */

import type { Conversation, ChatMessage, PlatformParser } from '../lib/types'
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
    // Gemini uses message-response containers
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
    // Try to get title from various possible locations
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
    
    // Fallback to page title
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
   * Extract all messages from the conversation
   */
  private extractMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    
    // Gemini uses different selectors for user queries and model responses
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
    
    // Extract user queries
    querySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        const message = this.parseMessageElement(element, 'user')
        if (message) {
          messages.push(message)
        }
      })
    })
    
    // Extract model responses
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
    // Extract content
    const contentElement = element.querySelector(
      '[class*="content"], [class*="text"], .markdown'
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
    
    // Generate message ID from element
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
    // Clone to avoid modifying original
    const clone = element.cloneNode(true) as Element
    
    // Remove buttons, controls, and other UI elements
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
    
    // Extract text content preserving structure
    let content = ''
    
    // Process paragraphs and divs
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
      // Fallback to full text content
      content = clone.textContent || ''
    }
    
    // Clean up the content
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
        platform: 'gemini',
        isConversationPage: parser.isConversationPage(),
        title: parser.getConversationTitle()
      }
    })
  }
})

// Run on page load
main()
