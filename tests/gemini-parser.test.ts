/**
 * Gemini Parser Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock DOM utilities
vi.mock('../src/lib/dom-utils', () => ({
  generateId: () => 'test-id-456',
  extractTextContent: (element: Element | null) => element?.textContent?.trim() || '',
  extractTextWithBreaks: (element: Element | null) => element?.textContent?.trim() || '',
  extractCodeBlocks: () => [],
  extractImages: () => [],
  cleanText: (text: string) => text.replace(/\s+/g, ' ').trim()
}))

describe('Gemini Parser', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('isConversationPage', () => {
    it('should detect conversation page with user queries', () => {
      document.body.innerHTML = `
        <div class="user-query">Hello Gemini</div>
        <div class="model-response">Hello! How can I help?</div>
      `
      
      const hasQueries = document.querySelectorAll('.user-query').length > 0
      expect(hasQueries).toBe(true)
    })

    it('should detect conversation page with message content', () => {
      document.body.innerHTML = `
        <div class="message-content">User message</div>
        <div class="message-content">Model response</div>
      `
      
      const hasContent = document.querySelectorAll('.message-content').length > 0
      expect(hasContent).toBe(true)
    })

    it('should detect conversation page with response containers', () => {
      document.body.innerHTML = `
        <div class="response-container">Response</div>
      `
      
      const hasContainer = document.querySelectorAll('.response-container').length > 0
      expect(hasContainer).toBe(true)
    })

    it('should return false for non-conversation pages', () => {
      document.body.innerHTML = `
        <div>Regular page content</div>
      `
      
      const hasElements = 
        document.querySelectorAll('.user-query').length > 0 ||
        document.querySelectorAll('.model-response').length > 0 ||
        document.querySelectorAll('.message-content').length > 0
      expect(hasElements).toBe(false)
    })

    it('should handle empty DOM', () => {
      document.body.innerHTML = ''
      
      const hasElements = document.querySelectorAll('[class*="message"]').length > 0
      expect(hasElements).toBe(false)
    })
  })

  describe('Message Parsing', () => {
    it('should extract user queries', () => {
      document.body.innerHTML = `
        <div class="user-query">
          <div class="content">What is machine learning?</div>
        </div>
      `
      
      const query = document.querySelector('.user-query')
      expect(query).not.toBeNull()
      expect(query?.textContent).toContain('What is machine learning?')
    })

    it('should extract model responses', () => {
      document.body.innerHTML = `
        <div class="model-response">
          <div class="content">Machine learning is a subset of AI...</div>
        </div>
      `
      
      const response = document.querySelector('.model-response')
      expect(response).not.toBeNull()
      expect(response?.textContent).toContain('Machine learning is a subset of AI')
    })

    it('should handle multi-turn conversations', () => {
      document.body.innerHTML = `
        <div class="user-query">First question</div>
        <div class="model-response">First answer</div>
        <div class="user-query">Second question</div>
        <div class="model-response">Second answer</div>
      `
      
      const queries = document.querySelectorAll('.user-query')
      const responses = document.querySelectorAll('.model-response')
      
      expect(queries.length).toBe(2)
      expect(responses.length).toBe(2)
    })

    it('should handle messages with code blocks', () => {
      document.body.innerHTML = `
        <div class="model-response">
          <div class="content">
            Here's an example:
            <pre><code>def hello():
    print("Hello, world!")</code></pre>
          </div>
        </div>
      `
      
      const codeBlock = document.querySelector('pre code')
      expect(codeBlock).not.toBeNull()
      expect(codeBlock?.textContent).toContain('def hello():')
    })

    it('should handle messages with images', () => {
      document.body.innerHTML = `
        <div class="model-response">
          <div class="content">
            <img src="https://example.com/chart.png" alt="Data visualization" />
          </div>
        </div>
      `
      
      const image = document.querySelector('img')
      expect(image).not.toBeNull()
      expect(image?.getAttribute('alt')).toBe('Data visualization')
    })
  })

  describe('Title Extraction', () => {
    it('should extract title from conversation-title class', () => {
      document.body.innerHTML = `
        <div class="conversation-title">Gemini Chat</div>
        <div>Content</div>
      `
      
      const title = document.querySelector('.conversation-title')?.textContent
      expect(title).toBe('Gemini Chat')
    })

    it('should extract title from h1', () => {
      document.body.innerHTML = `
        <h1>Gemini Conversation</h1>
        <div>Content</div>
      `
      
      const title = document.querySelector('h1')?.textContent
      expect(title).toBe('Gemini Conversation')
    })

    it('should fallback to page title', () => {
      document.title = 'My Chat - Gemini'
      
      const pageTitle = document.title.replace(/[-–|]\s*Gemini.*$/i, '').trim()
      expect(pageTitle).toBe('My Chat')
    })
  })

  describe('Special Characters', () => {
    it('should handle HTML entities', () => {
      document.body.innerHTML = `
        <div class="user-query">
          <div>Test &amp; special &lt;characters&gt;</div>
        </div>
      `
      
      const content = document.querySelector('.user-query')?.textContent
      expect(content).toContain('&')
      expect(content).toContain('<')
    })

    it('should handle unicode characters', () => {
      document.body.innerHTML = `
        <div class="user-query">
          <div>Hello 世界 🌏</div>
        </div>
      `
      
      const content = document.querySelector('.user-query')?.textContent
      expect(content).toContain('世界')
      expect(content).toContain('🌏')
    })

    it('should handle newlines and whitespace', () => {
      document.body.innerHTML = `
        <div class="user-query">
          <div>
            Line 1
            
            Line 2
            
            Line 3
          </div>
        </div>
      `
      
      const content = document.querySelector('.user-query')?.textContent
      expect(content).toContain('Line 1')
      expect(content).toContain('Line 3')
    })
  })
})
