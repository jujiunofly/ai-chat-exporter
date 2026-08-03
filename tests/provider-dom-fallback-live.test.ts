import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type DeepSeekParserConstructor = typeof import('../src/contents/deepseek-parser').DeepSeekParser
type GrokParserConstructor = typeof import('../src/contents/grok-parser').GrokParser
type DeepSeekHistoryParser = typeof import('../src/contents/deepseek-parser').parseDeepSeekHistoryPage

let DeepSeekParser: DeepSeekParserConstructor
let GrokParser: GrokParserConstructor
let parseDeepSeekHistoryPage: DeepSeekHistoryParser

describe('provider DOM fallback regressions', () => {
  beforeAll(async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
      runtime: { onMessage: { addListener: vi.fn() }, getURL: vi.fn((path: string) => path) },
    })
    ;({ DeepSeekParser, parseDeepSeekHistoryPage } = await import('../src/contents/deepseek-parser'))
    ;({ GrokParser } = await import('../src/contents/grok-parser'))
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    document.title = ''
  })

  it('keeps DeepSeek assistant nodes after a user fallback match', async () => {
    document.body.innerHTML = `
      <div class="message-user">Question one</div>
      <div class="message-assistant">Answer one</div>
      <div class="message-user">Question two</div>
      <div class="message-assistant">Answer two</div>
    `
    const conversation = await new DeepSeekParser().parseCurrentConversation()
    expect(conversation?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Question one'],
      ['assistant', 'Answer one'],
      ['user', 'Question two'],
      ['assistant', 'Answer two'],
    ])
  })

  it('keeps Grok assistant nodes after a user fallback match', async () => {
    window.history.replaceState({}, '', '/chat/test-grok')
    document.body.innerHTML = `
      <div class="message-user">Question one</div>
      <div class="message-assistant">Answer one</div>
      <div class="message-user">Question two</div>
      <div class="message-assistant">Answer two</div>
    `
    const conversation = await new GrokParser().parseCurrentConversation()
    expect(conversation?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Question one'],
      ['assistant', 'Answer one'],
      ['user', 'Question two'],
      ['assistant', 'Answer two'],
    ])
  })

  it('normalizes DeepSeek pagination envelopes and cursor state', () => {
    expect(parseDeepSeekHistoryPage({
      data: { items: [{ id: 'one' }], has_more: true, next_cursor: 'cursor-2' },
    })).toEqual({ items: [{ id: 'one' }], hasMore: true, nextCursor: 'cursor-2' })
    expect(parseDeepSeekHistoryPage({ data: [{ id: 'last' }] })).toEqual({
      items: [{ id: 'last' }], hasMore: false,
    })
  })

  it('fetches every DeepSeek history page and de-duplicates IDs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { items: [{ id: 'one', title: 'One' }], has_more: true, next_cursor: 'next' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { items: [{ id: 'one', title: 'Duplicate' }, { id: 'two', title: 'Two' }] } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const conversations = await new DeepSeekParser().fetchAllConversations()
    expect(conversations.map(item => item.id)).toEqual(['one', 'two'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=next')
  })
})
