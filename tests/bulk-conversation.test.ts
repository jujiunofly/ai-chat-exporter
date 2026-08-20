import { describe, expect, it } from 'vitest'
import { hasUsableConversation, mergeConversationsForExport } from '../src/lib/bulk-conversation'

describe('bulk conversation validation', () => {
  it('accepts a complete conversation whose Gemini ID differs only by c_ prefix', () => {
    expect(hasUsableConversation({
      id: 'abc123',
      messages: [
        { id: 'm0', role: 'user', content: 'Question' },
        { id: 'm1', role: 'assistant', content: 'Real answer' }
      ]
    }, 'c_abc123')).toBe(true)
  })

  it('rejects assistant-only conversations as incomplete', () => {
    expect(hasUsableConversation({
      id: 'abc123',
      messages: [{ id: 'm1', role: 'assistant', content: 'Real answer' }]
    }, 'abc123')).toBe(false)
  })

  it('rejects a content-bearing conversation from a different tab', () => {
    expect(hasUsableConversation({
      id: 'opened-chat',
      messages: [{ id: 'm1', role: 'assistant', content: 'Wrong conversation' }]
    }, 'requested-chat')).toBe(false)
  })

  it('rejects metadata-only conversations so bulk export never writes empty documents', () => {
    expect(hasUsableConversation({ id: 'requested-chat', messages: [] }, 'requested-chat')).toBe(false)
    expect(hasUsableConversation({
      id: 'requested-chat',
      messages: [{ id: 'm1', role: 'user', content: '   ' }]
    }, 'requested-chat')).toBe(false)
  })

  it('merges verified conversations while keeping each title as a heading', () => {
    const merged = mergeConversationsForExport([
      {
        id: 'one',
        title: 'First chat',
        url: 'https://chatgpt.com/c/one',
        platform: 'chatgpt',
        source: 'api',
        sourceCompleteness: 'verified',
        messages: [
          { id: 'u1', role: 'user', content: 'Q1' },
          { id: 'a1', role: 'assistant', content: 'A1' },
        ],
      },
      {
        id: 'two',
        title: 'Second chat',
        url: 'https://chatgpt.com/c/two',
        platform: 'chatgpt',
        source: 'api',
        sourceCompleteness: 'verified',
        messages: [
          { id: 'u2', role: 'user', content: 'Q2' },
          { id: 'a2', role: 'assistant', content: 'A2' },
        ],
      },
    ], '2 conversations')

    expect(merged.title).toBe('2 conversations')
    expect(merged.sourceCompleteness).toBe('verified')
    expect(merged.messages.map(message => [message.role, message.content])).toEqual([
      ['system', 'First chat'],
      ['user', 'Q1'],
      ['assistant', 'A1'],
      ['system', 'Second chat'],
      ['user', 'Q2'],
      ['assistant', 'A2'],
    ])
  })
})
