import { describe, expect, it } from 'vitest'
import { shouldUseApiFallback, preferMoreCompleteConversation } from '../src/lib/parser-fallback'
import type { Conversation } from '../src/lib/types'

const conv = (messages: Conversation['messages']): Conversation => ({
  id: 'conv-1',
  title: 'Test Conversation',
  url: 'https://claude.ai/chat/conv-1',
  platform: 'claude',
  messages
})

describe('parser API fallback decision', () => {
  it('falls back when DOM returns null', () => {
    expect(shouldUseApiFallback(null)).toBe(true)
  })

  it('falls back when DOM returns zero messages', () => {
    expect(shouldUseApiFallback(conv([]))).toBe(true)
  })

  it('falls back when DOM returns only user messages', () => {
    expect(shouldUseApiFallback(conv([
      { id: 'u1', role: 'user', content: 'Please analyse this report' }
    ]))).toBe(true)
  })

  it('falls back when assistant message is empty', () => {
    expect(shouldUseApiFallback(conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: '   ' }
    ]))).toBe(true)
  })

  it('does not fall back when DOM includes a non-empty assistant response', () => {
    expect(shouldUseApiFallback(conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Answer' }
    ]))).toBe(false)
  })

  it('prefers API conversation when it has more messages than partial DOM result', () => {
    const dom = conv([{ id: 'u1', role: 'user', content: 'Question' }])
    const api = conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Answer' }
    ])
    expect(preferMoreCompleteConversation(dom, api)).toBe(api)
  })

  it('prefers API conversation with assistant content even when DOM has more user-only messages', () => {
    const dom = conv([
      { id: 'u1', role: 'user', content: 'Question 1' },
      { id: 'u2', role: 'user', content: 'Question 2' },
      { id: 'u3', role: 'user', content: 'Question 3' }
    ])
    const api = conv([
      { id: 'u1', role: 'user', content: 'Question 1' },
      { id: 'a1', role: 'assistant', content: 'Answer 1' }
    ])
    expect(preferMoreCompleteConversation(dom, api)).toBe(api)
  })

  it('prefers API conversation when both have assistant content and equal message count', () => {
    const dom = conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Rendered math H 0 H_0 H 0' }
    ])
    const api = conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Rendered math \\(H_0\\)' }
    ])
    expect(preferMoreCompleteConversation(dom, api)).toBe(api)
  })

  it('keeps DOM conversation when API returns no improvement', () => {
    const dom = conv([
      { id: 'u1', role: 'user', content: 'Question' },
      { id: 'a1', role: 'assistant', content: 'Answer' }
    ])
    const api = conv([{ id: 'u1', role: 'user', content: 'Question' }])
    expect(preferMoreCompleteConversation(dom, api)).toBe(dom)
  })
})
