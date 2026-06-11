/**
 * Export Markdown Tests
 */

import { describe, it, expect } from 'vitest'
import { conversationToMarkdown, generateMarkdownFilename } from '../src/lib/export-markdown'
import type { Conversation, ExportOptions } from '../src/lib/types'

describe('Export Markdown', () => {
  const defaultOptions: ExportOptions = {
    format: 'markdown',
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

  describe('conversationToMarkdown', () => {
    it('should generate markdown with metadata', () => {
      const conv = createConversation()
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('# Test Conversation')
      expect(markdown).toContain('**Platform:** ChatGPT')
      expect(markdown).toContain('**Messages:** 2')
    })

    it('should generate markdown without metadata', () => {
      const conv = createConversation()
      const options = { ...defaultOptions, includeMetadata: false }
      const markdown = conversationToMarkdown(conv, options)
      
      expect(markdown).not.toContain('# Test Conversation')
      expect(markdown).not.toContain('**Platform:**')
    })

    it('should format user messages correctly', () => {
      const conv = createConversation()
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('### 👤 User')
      expect(markdown).toContain('Hello, how are you?')
    })

    it('should format assistant messages correctly', () => {
      const conv = createConversation()
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('### 🤖 Assistant')
      expect(markdown).toContain("I'm doing well, thank you!")
    })

    it('should handle messages with code blocks', () => {
      const conv = createConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is some code:',
            codeBlocks: [
              {
                language: 'javascript',
                code: 'console.log("hello");'
              }
            ]
          }
        ]
      })
      
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('```javascript')
      expect(markdown).toContain('console.log("hello");')
    })

    it('should handle messages with images', () => {
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
      
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('![Test image](https://example.com/image.png)')
    })

    it('should handle empty conversation', () => {
      const conv = createConversation({ messages: [] })
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('# Test Conversation')
      expect(markdown).toContain('**Messages:** 0')
    })

    it('should handle special characters', () => {
      const conv = createConversation({
        title: 'Test <script>alert("xss")</script>',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello & welcome to "our" service!'
          }
        ]
      })
      
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      // Markdown should preserve the content (not escape HTML like HTML would)
      expect(markdown).toContain('Hello & welcome')
    })

    it('should add footer with export info', () => {
      const conv = createConversation()
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('---')
      expect(markdown).toContain('Exported from ChatGPT')
    })

    it('should handle Gemini platform', () => {
      const conv = createConversation({ platform: 'gemini' })
      const markdown = conversationToMarkdown(conv, defaultOptions)
      
      expect(markdown).toContain('**Platform:** Google Gemini')
      expect(markdown).toContain('Exported from Google Gemini')
    })
  })

  describe('generateMarkdownFilename', () => {
    it('should generate filename from title', () => {
      const conv = createConversation({ title: 'My Test Conversation' })
      const filename = generateMarkdownFilename(conv)
      
      expect(filename).toBe('My-Test-Conversation.md')
    })

    it('should sanitize special characters', () => {
      const conv = createConversation({ title: 'Test: File (v2.0)!' })
      const filename = generateMarkdownFilename(conv)
      
      // Only filesystem-unsafe chars are removed: <>:"/\|?* 
      expect(filename).toBe('Test-File-(v2.0)!.md')
    })

    it('should handle long titles', () => {
      const conv = createConversation({ 
        title: 'A'.repeat(300) 
      })
      const filename = generateMarkdownFilename(conv)
      
      expect(filename.length).toBeLessThanOrEqual(204) // 200 + '.md'
    })

    it('should handle empty title', () => {
      const conv = createConversation({ title: '' })
      const filename = generateMarkdownFilename(conv)
      
      expect(filename).toBe('conversation.md')
    })

    it('should handle whitespace-only titles', () => {
      const conv = createConversation({ title: '   ' })
      const filename = generateMarkdownFilename(conv)
      
      // Whitespace-only titles get sanitized to empty, fallback to 'conversation.md'
      expect(filename).toBe('conversation.md')
    })

    it('should preserve Chinese characters in title', () => {
      const conv = createConversation({ title: '父亲体检报告分析' })
      const filename = generateMarkdownFilename(conv)
      
      expect(filename).toBe('父亲体检报告分析.md')
    })
  })

  describe('Paragraph Break Preservation', () => {
    it('should preserve double newlines as paragraph breaks', () => {
      const conv = createConversation({
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
        }]
      })
      const md = conversationToMarkdown(conv, defaultOptions)
      
      expect(md).toContain('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.')
    })

    it('should not merge content from different paragraphs', () => {
      const conv = createConversation({
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: 'Para one.\n\nPara two.'
        }]
      })
      const md = conversationToMarkdown(conv, defaultOptions)
      
      // Verify the two paragraphs are separated by a blank line
      expect(md).toContain('Para one.\n\nPara two.')
    })

    it('should preserve headers within message content', () => {
      const conv = createConversation({
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: '# Title\n\nBody text.\n\n## Subheading\n\nMore text.'
        }]
      })
      const md = conversationToMarkdown(conv, defaultOptions)
      
      expect(md).toContain('# Title')
      expect(md).toContain('## Subheading')
    })

    it('should preserve inline code and bold/italic within paragraphs', () => {
      const conv = createConversation({
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: 'This has **bold**, *italic*, and `code` inline.'
        }]
      })
      const md = conversationToMarkdown(conv, defaultOptions)
      
      expect(md).toContain('**bold**')
      expect(md).toContain('*italic*')
      expect(md).toContain('`code`')
    })
  })
})
