import { describe, expect, it } from 'vitest'
import type { Conversation } from '../src/lib/types'
import {
  analyzeConversationIntegrity,
  conversationIntegrityError,
  isConversationComplete,
} from '../src/lib/conversation-integrity'

const conversation = (messages: Conversation['messages']): Conversation => ({
  id: 'integrity-test',
  title: 'Integrity test',
  url: 'https://example.test/chat/integrity-test',
  platform: 'chatgpt',
  messages,
})

describe('conversation integrity gate', () => {
  it('rejects missing and empty conversations', () => {
    expect(analyzeConversationIntegrity(null).status).toBe('empty')
    expect(analyzeConversationIntegrity(conversation([])).status).toBe('empty')
    expect(isConversationComplete(null)).toBe(false)
  })

  it('marks user-only results as recoverable but not exportable', () => {
    const result = analyzeConversationIntegrity(conversation([
      { id: 'u1', role: 'user', content: 'Question' },
    ]))
    expect(result.status).toBe('suspicious')
    expect(result.shouldAttemptFallback).toBe(true)
    expect(result.reasons).toContain('assistant_messages_missing')
    expect(isConversationComplete(conversation([
      { id: 'u1', role: 'user', content: 'Question' },
    ]))).toBe(false)
    expect(conversationIntegrityError(result)).toContain('assistant')
  })

  it('accepts a non-empty user/assistant transcript', () => {
    const result = analyzeConversationIntegrity(conversation([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Answer' },
    ]))
    expect(result.status).toBe('complete')
    expect(result.userCount).toBe(1)
    expect(result.assistantCount).toBe(1)
    expect(isConversationComplete(conversation([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Answer' },
    ]))).toBe(true)
  })
})
