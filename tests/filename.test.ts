/**
 * Filename Generation Tests
 */

import { describe, it, expect } from 'vitest'
import { generateFilename, getDefaultPattern, FILENAME_PREVIEW_VARS } from '../src/lib/filename'
import type { Conversation } from '../src/lib/types'

describe('Filename Generation', () => {
  const createConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
    id: 'test-conv-1',
    title: 'Test Conversation',
    url: 'https://chatgpt.com/c/test',
    messages: [
      { id: 'msg-1', role: 'user', content: 'Hello' },
      { id: 'msg-2', role: 'assistant', content: 'Hi there' }
    ],
    platform: 'chatgpt',
    ...overrides
  })

  describe('generateFilename', () => {
    it('should generate filename with date pattern', () => {
      const conv = createConversation()
      const filename = generateFilename('{date}', conv)
      
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should generate filename with title pattern', () => {
      const conv = createConversation({ title: 'My Test Conversation' })
      const filename = generateFilename('{title}', conv)
      
      expect(filename).toBe('my-test-conversation')
    })

    it('should generate filename with platform pattern', () => {
      const conv = createConversation({ platform: 'chatgpt' })
      const filename = generateFilename('{platform}', conv)
      
      expect(filename).toBe('chatgpt')
    })

    it('should generate filename with msgcount pattern', () => {
      const conv = createConversation()
      const filename = generateFilename('{msgcount}', conv)
      
      expect(filename).toBe('2')
    })

    it('should generate filename with index pattern', () => {
      const conv = createConversation()
      const filename = generateFilename('{index}', conv, 5)
      
      expect(filename).toBe('005')
    })

    it('should generate filename with multiple patterns', () => {
      const conv = createConversation({ title: 'my-chat' })
      const filename = generateFilename('{date}-{platform}-{title}', conv)
      
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-chatgpt-my-chat$/)
    })

    it('should handle long titles by truncating', () => {
      const conv = createConversation({ title: 'A'.repeat(200) })
      const filename = generateFilename('{title}', conv)
      
      expect(filename.length).toBeLessThanOrEqual(100)
    })

    it('should sanitize special characters', () => {
      const conv = createConversation({ title: 'Test: File (v2.0)! @#$%' })
      const filename = generateFilename('{title}', conv)
      
      expect(filename).not.toMatch(/[:!@#$%^&*()]/)
      expect(filename).toBe('test-file-v20')
    })

    it('should handle empty title by using first user message', () => {
      const conv = createConversation({ title: '' })
      const filename = generateFilename('{title}', conv)
      
      // Empty title falls back to first user message content
      expect(filename).toBe('hello')
    })

    it('should handle empty title with no messages', () => {
      const conv = createConversation({ title: '', messages: [] })
      const filename = generateFilename('{title}', conv)
      
      expect(filename).toBe('untitled')
    })

    it('should handle Untitled Conversation title by using first user message', () => {
      const conv = createConversation({ title: 'Untitled Conversation' })
      const filename = generateFilename('{title}', conv)
      
      // Untitled Conversation falls back to first user message content
      expect(filename).toBe('hello')
    })

    it('should handle missing index by defaulting to 000', () => {
      const conv = createConversation()
      const filename = generateFilename('{index}', conv)
      
      expect(filename).toBe('000')
    })

    it('should pad index to 3 digits', () => {
      const conv = createConversation()
      
      expect(generateFilename('{index}', conv, 1)).toBe('001')
      expect(generateFilename('{index}', conv, 42)).toBe('042')
      expect(generateFilename('{index}', conv, 123)).toBe('123')
    })
  })

  describe('getDefaultPattern', () => {
    it('should return default pattern', () => {
      const pattern = getDefaultPattern()
      
      expect(pattern).toBe('{date}-{title}')
    })
  })

  describe('FILENAME_PREVIEW_VARS', () => {
    it('should have all expected keys', () => {
      const conv = createConversation()
      
      expect(FILENAME_PREVIEW_VARS.date).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.datetime).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.end_date).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.conv_date).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.conv_datetime).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.title).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.platform).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.index).toBeDefined()
      expect(FILENAME_PREVIEW_VARS.msgcount).toBeDefined()
    })

    it('should generate date preview', () => {
      const conv = createConversation()
      const date = FILENAME_PREVIEW_VARS.date(conv)
      
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should generate datetime preview', () => {
      const conv = createConversation()
      const datetime = FILENAME_PREVIEW_VARS.datetime(conv)
      
      // ISO datetime with milliseconds removed, format: YYYY-MM-DDTHHmmss.sssZ -> YYYY-MM-DDTHHmmss
      expect(datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}/)
    })

    it('should generate end_date preview (same as date)', () => {
      const conv = createConversation()
      const endDate = FILENAME_PREVIEW_VARS.end_date(conv)
      const date = FILENAME_PREVIEW_VARS.date(conv)
      
      expect(endDate).toBe(date)
    })

    it('should generate conv_date preview from createdAt', () => {
      const conv = createConversation({ createdAt: new Date('2025-03-15T10:30:00Z').getTime() })
      const convDate = FILENAME_PREVIEW_VARS.conv_date(conv)
      
      expect(convDate).toBe('2025-03-15')
    })

    it('should generate conv_date fallback to current date when no createdAt', () => {
      const conv = createConversation()
      const convDate = FILENAME_PREVIEW_VARS.conv_date(conv)
      
      expect(convDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should generate conv_datetime preview from createdAt', () => {
      const conv = createConversation({ createdAt: new Date('2025-03-15T10:30:00Z').getTime() })
      const convDatetime = FILENAME_PREVIEW_VARS.conv_datetime(conv)
      
      expect(convDatetime).toMatch(/^2025-03-15T/)
    })

    it('should generate title preview', () => {
      const conv = createConversation({ title: 'My Chat' })
      const title = FILENAME_PREVIEW_VARS.title(conv)
      
      expect(title).toBe('my-chat')
    })

    it('should generate platform preview', () => {
      const conv = createConversation({ platform: 'gemini' })
      const platform = FILENAME_PREVIEW_VARS.platform(conv)
      
      expect(platform).toBe('gemini')
    })

    it('should generate index preview', () => {
      const conv = createConversation()
      const index = FILENAME_PREVIEW_VARS.index(conv)
      
      expect(index).toBe('001')
    })

    it('should generate msgcount preview', () => {
      const conv = createConversation()
      const msgcount = FILENAME_PREVIEW_VARS.msgcount(conv)
      
      expect(msgcount).toBe('2')
    })
  })

  describe('Conversation Date Tokens', () => {
    it('should use conv_date in filename pattern', () => {
      const conv = createConversation({ 
        title: 'My Test Conversation',
        createdAt: new Date('2025-01-20T08:00:00Z').getTime() 
      })
      const filename = generateFilename('{conv_date}-{title}', conv)
      
      expect(filename).toMatch(/^2025-01-20-my-test-conversation$/)
    })

    it('should use conv_datetime in filename pattern', () => {
      const conv = createConversation({ 
        title: 'My Test Conversation',
        createdAt: new Date('2025-01-20T08:00:00Z').getTime() 
      })
      const filename = generateFilename('{conv_datetime}-{title}', conv)
      
      // T gets lowercased to t by sanitizeFilename
      expect(filename).toMatch(/^2025-01-20t\d{6}-my-test-conversation$/)
    })

    it('should use end_date in filename pattern', () => {
      const conv = createConversation({ title: 'My Test Conversation' })
      const filename = generateFilename('{end_date}-{title}', conv)
      
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-my-test-conversation$/)
    })

    it('should fallback conv_date to current date when no createdAt', () => {
      const conv = createConversation({ title: 'My Test Conversation' })
      const filename = generateFilename('{conv_date}-{title}', conv)
      
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-my-test-conversation$/)
    })
  })
})
