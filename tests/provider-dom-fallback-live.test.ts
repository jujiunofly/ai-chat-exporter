import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type DeepSeekParserConstructor = typeof import('../src/contents/deepseek-parser').DeepSeekParser
type GrokParserConstructor = typeof import('../src/contents/grok-parser').GrokParser
type DeepSeekHistoryParser = typeof import('../src/contents/deepseek-parser').parseDeepSeekHistoryPage
type DeepSeekHistoryCursor = typeof import('../src/contents/deepseek-parser').deepSeekHistoryCursor

let DeepSeekParser: DeepSeekParserConstructor
let GrokParser: GrokParserConstructor
let parseDeepSeekHistoryPage: DeepSeekHistoryParser
let deepSeekHistoryCursor: DeepSeekHistoryCursor

describe('provider DOM fallback regressions', () => {
  beforeAll(async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
      runtime: { onMessage: { addListener: vi.fn() }, getURL: vi.fn((path: string) => path) },
    })
    ;({ DeepSeekParser, parseDeepSeekHistoryPage, deepSeekHistoryCursor } = await import('../src/contents/deepseek-parser'))
    ;({ GrokParser } = await import('../src/contents/grok-parser'))
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    document.title = ''
    window.localStorage.clear()
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
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{ id: 'one', title: 'One', updated_at: 100, pinned: false }],
              has_more: true,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{ id: 'one', title: 'Duplicate' }, { id: 'two', title: 'Two', updated_at: 50, pinned: false }],
              has_more: false,
            },
          },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const parser = new DeepSeekParser()
    const conversations = await parser.fetchAllConversations()
    expect(conversations.map(item => item.id)).toEqual(['one', 'two'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v0/chat_session/fetch_page')
    expect(String(fetchMock.mock.calls[1][0])).toContain('lte_cursor.updated_at=100')
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: true, pagesFetched: 2 })
  })

  it('continues DeepSeek pagination from the oldest timestamp on the page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [
                { id: 'newer', title: 'Newer', updated_at: 200, pinned: false },
                { id: 'older', title: 'Older', updated_at: 100, pinned: false },
              ],
              has_more: true,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{ id: 'oldest', title: 'Oldest', updated_at: 40, pinned: false }],
              has_more: false,
            },
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const parser = new DeepSeekParser()
    const conversations = await parser.fetchAllConversations()
    expect(conversations.map(item => item.id)).toEqual(['newer', 'older', 'oldest'])
    expect(String(fetchMock.mock.calls[1][0])).toContain('lte_cursor.updated_at=100')
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: true, pagesFetched: 2 })
  })

  it('paginates from the last unpinned row, not an older pinned timestamp', async () => {
    expect(deepSeekHistoryCursor([
      { id: 'pinned-old', pinned: true, updated_at: 10 },
      { id: 'unpinned-new', pinned: false, updated_at: 200 },
      { id: 'unpinned-older', pinned: false, updated_at: 150 },
    ])).toEqual({ pinned: false, updatedAt: 150 })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [
                { id: 'pinned-old', title: 'Pinned', updated_at: 10, pinned: true },
                { id: 'new', title: 'New', updated_at: 200, pinned: false },
                { id: 'older', title: 'Older', updated_at: 150, pinned: false },
              ],
              has_more: true,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{ id: 'oldest', title: 'Oldest', updated_at: 40, pinned: false }],
              has_more: false,
            },
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const parser = new DeepSeekParser()
    const conversations = await parser.fetchAllConversations()
    expect(conversations.map(item => item.id)).toEqual(['pinned-old', 'new', 'older', 'oldest'])
    expect(String(fetchMock.mock.calls[1][0])).toContain('lte_cursor.pinned=false')
    expect(String(fetchMock.mock.calls[1][0])).toContain('lte_cursor.updated_at=150')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('lte_cursor.updated_at=10')
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: true, pagesFetched: 2 })
  })

  it('retries a duplicate DeepSeek page once with an exclusive second, then marks incomplete', async () => {
    const firstPage = {
      ok: true,
      json: async () => ({
        data: {
          biz_data: {
            chat_sessions: [
              { id: 'session-0', title: 'Chat 0', updated_at: 50, pinned: false },
              { id: 'session-1', title: 'Chat 1', updated_at: 50, pinned: false },
            ],
            has_more: true,
          },
        },
      }),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(firstPage)
    vi.stubGlobal('fetch', fetchMock)
    const parser = new DeepSeekParser()
    const conversations = await parser.fetchAllConversations()
    expect(conversations.map(item => item.id)).toEqual(['session-0', 'session-1'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1][0])).toContain('lte_cursor.updated_at=50')
    expect(String(fetchMock.mock.calls[2][0])).toContain('lte_cursor.updated_at=49')
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: false, pagesFetched: 3 })
  })

  it('keeps a partial DeepSeek API list and labels it incomplete', async () => {
    document.body.innerHTML = '<aside><a href="/a/chat/s/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb">Sidebar chat</a></aside>'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{ id: 'api-only', title: 'Partial', updated_at: 9, pinned: false }],
              has_more: true,
            },
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }))

    const parser = new DeepSeekParser()
    const conversations = await parser.fetchAllConversations()

    expect(conversations.map(item => item.id)).toEqual(['api-only'])
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: false, pagesFetched: 1 })
  })

  it('sends the DeepSeek localStorage bearer on history requests', async () => {
    window.localStorage.setItem('userToken', JSON.stringify({ value: 'ds-live-token', __version: '1' }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { biz_data: { chat_sessions: [{ id: 'tok', title: 'Token chat', updated_at: 1, pinned: false }], has_more: false } },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await new DeepSeekParser().fetchAllConversations()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer ds-live-token')
    expect(fetchMock.mock.calls[0][1].headers['x-client-platform']).toBe('web')
    expect(fetchMock.mock.calls[0][1].headers['x-client-bundle-id']).toBe('com.deepseek.chat')
  })

  it('reads DeepSeek biz_data history and detail envelopes', async () => {
    expect(parseDeepSeekHistoryPage({
      data: { biz_data: { chat_sessions: [{ id: 'session-1' }], has_more: false } },
    }).items).toEqual([{ id: 'session-1' }])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          biz_data: {
            chat_session: { title: 'Biz chat', created_at: 1_700_000_000 },
            chat_messages: [
              { message_id: 'm1', parent_id: null, role: 'USER', fragments: [{ type: 'REQUEST', content: 'Question from envelope' }] },
              { message_id: 'm2', parent_id: 'm1', role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: 'Answer from envelope' }] },
            ],
          },
        },
      }),
    }))

    const conversation = await new DeepSeekParser().fetchConversationDetail('session-1')
    expect(conversation).toMatchObject({
      id: 'session-1',
      title: 'Biz chat',
      platform: 'deepseek',
      source: 'api',
      sourceCompleteness: 'verified',
    })
    expect(conversation?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Question from envelope'],
      ['assistant', 'Answer from envelope'],
    ])
  })

  it('labels a terminal Grok API list complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ conversations: [{ conversationId: 'grok-api', title: 'API chat' }] }),
    }))

    const parser = new GrokParser()
    const conversations = await parser.fetchAllConversations()

    expect(conversations.map(item => item.id)).toEqual(['grok-api'])
    expect(parser.getConversationListMeta()).toEqual({ source: 'api', complete: true })
  })

  it('discards a partial Grok API list and labels the sidebar fallback incomplete', async () => {
    document.body.innerHTML = '<nav><a href="/c/sidebar-grok">Sidebar chat</a></nav>'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          conversations: [{ conversationId: 'api-only', title: 'Partial' }],
          nextPageToken: 'next',
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }))

    const parser = new GrokParser()
    const conversations = await parser.fetchAllConversations()

    expect(conversations.map(item => item.id)).toEqual(['sidebar-grok'])
    expect(parser.getConversationListMeta()).toEqual({ source: 'sidebar', complete: false })
  })
})
