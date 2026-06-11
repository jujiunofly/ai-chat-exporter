/**
 * Export PDF Tests
 */

import { describe, it, expect } from 'vitest'
import { conversationToHtml } from '../src/lib/export-pdf'
import type { Conversation, ExportOptions } from '../src/lib/types'

describe('Export PDF', () => {
  const defaultOptions: ExportOptions = {
    format: 'pdf',
    includeMetadata: true,
    includeCodeBlocks: true,
    includeImages: true
  }

  const createConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
    id: 'test-conv-1',
    title: 'Test Conversation',
    url: 'https://chatgpt.com/c/test',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, how are you?'
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: "I'm doing well, thank you!"
      }
    ],
    platform: 'chatgpt',
    ...overrides
  })

  describe('conversationToHtml', () => {
    it('should generate valid HTML structure', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html')
      expect(html).toContain('<head>')
      expect(html).toContain('<body>')
      expect(html).toContain('</html>')
    })

    it('should include metadata when enabled', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<h1>Test Conversation</h1>')
      expect(html).toContain('Platform:')
      expect(html).toContain('ChatGPT')
      expect(html).toContain('Messages:')
      expect(html).toContain('2')
    })

    it('should exclude metadata when disabled', () => {
      const conv = createConversation()
      const options = { ...defaultOptions, includeMetadata: false }
      const html = conversationToHtml(conv, options)
      
      expect(html).not.toContain('<h1>Test Conversation</h1>')
      expect(html).not.toContain('**Platform:**')
    })

    it('should format user messages', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('class="message user"')
      expect(html).toContain('Hello, how are you?')
    })

    it('should format assistant messages', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('class="message assistant"')
      expect(html).toContain('I&#039;m doing well, thank you!')
    })

    it('should include code blocks when enabled', () => {
      const conv = createConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is code:',
            codeBlocks: [
              {
                language: 'python',
                code: 'print("hello")'
              }
            ]
          }
        ]
      })
      
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<pre')
      expect(html).toContain('print(&quot;hello&quot;)')
    })

    it('should exclude code blocks when disabled', () => {
      const conv = createConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is code:',
            codeBlocks: [
              {
                language: 'python',
                code: 'print("hello")'
              }
            ]
          }
        ]
      })
      
      const options = { ...defaultOptions, includeCodeBlocks: false }
      const html = conversationToHtml(conv, options)
      
      expect(html).not.toContain('<pre')
    })

    it('should include images when enabled', () => {
      const conv = createConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is an image:',
            attachments: [
              {
                type: 'image',
                url: 'https://example.com/image.png',
                name: 'Test image'
              }
            ]
          }
        ]
      })
      
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<img')
      expect(html).toContain('src="https://example.com/image.png"')
    })

    it('should escape HTML in content', () => {
      const conv = createConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test <script>alert("xss")</script>'
          }
        ]
      })
      
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('<script>alert')
    })

    it('should handle empty conversation', () => {
      const conv = createConversation({ messages: [] })
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Test Conversation')
    })

    it('should include print styles', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<style>')
      expect(html).toContain('@page')
      expect(html).toContain('font-family')
    })

    it('should handle Gemini platform', () => {
      const conv = createConversation({ platform: 'gemini' })
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('Google Gemini')
    })
  })

  describe('HTML Structure', () => {
    it('should have proper CSS classes', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('class="conversation"')
      expect(html).toContain('class="messages"')
      expect(html).toContain('class="metadata"')
    })

    it('should include footer', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('<footer>')
      expect(html).toContain('Exported from')
    })

    it('should have responsive viewport meta', () => {
      const conv = createConversation()
      const html = conversationToHtml(conv, defaultOptions)
      
      expect(html).toContain('meta name="viewport"')
    })
  })
})
