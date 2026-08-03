import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type ClaudeParserConstructor = typeof import('../src/contents/claude-parser').ClaudeParser
type ClaudeBranchSelector = typeof import('../src/contents/claude-parser').selectClaudeActiveBranch

let ClaudeParser: ClaudeParserConstructor
let selectClaudeActiveBranch: ClaudeBranchSelector

describe('Claude parser live DOM regressions', () => {
  beforeAll(async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
          remove: vi.fn(async () => {})
        }
      },
      runtime: {
        onMessage: { addListener: vi.fn() },
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
      }
    })

    ;({ ClaudeParser, selectClaudeActiveBranch } = await import('../src/contents/claude-parser'))
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    document.title = ''
    window.history.replaceState({}, '', '/chat/test-conversation')
  })

  it('captures assistant replies from Claude data-is-streaming nodes', async () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="user-message">What is the answer?</div>
        <div data-is-streaming="false">
          <div class="prose"><p>The answer is here.</p></div>
        </div>
      </main>
    `

    const conversation = await new ClaudeParser().parseCurrentConversation()

    expect(conversation?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'What is the answer?'],
      ['assistant', 'The answer is here.']
    ])
  })

  it('does not duplicate a streaming answer when its old class is nested', async () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="user-message">Question</div>
        <div data-is-streaming="false">
          <div class="font-claude-message">Answer</div>
        </div>
      </main>
    `

    const conversation = await new ClaudeParser().parseCurrentConversation()

    expect(conversation?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ])
  })

  it('exports only the branch selected by Claude current leaf metadata', () => {
    const records = [
      { uuid: 'u1', sender: 'human', content: 'Question' },
      { uuid: 'a-old', parent_uuid: 'u1', sender: 'assistant', content: 'Old answer' },
      { uuid: 'a-new', parent_uuid: 'u1', sender: 'assistant', content: 'Current answer' },
      { uuid: 'u2', parent_uuid: 'a-new', sender: 'human', content: 'Follow up' },
      { uuid: 'a2', parent_uuid: 'u2', sender: 'assistant', content: 'Final answer' },
    ]
    const selected = selectClaudeActiveBranch(records, { current_leaf_message_uuid: 'a2' })
    expect(selected.map(record => record.uuid)).toEqual(['u1', 'a-new', 'u2', 'a2'])
  })

  it('does not flatten sibling branches when current leaf metadata is absent', () => {
    const records = [
      { uuid: 'u1', sender: 'human', content: 'Question' },
      { uuid: 'a-old', parent_uuid: 'u1', sender: 'assistant', content: 'Old answer' },
      { uuid: 'a-new', parent_uuid: 'u1', sender: 'assistant', content: 'Current answer' },
    ]
    const selected = selectClaudeActiveBranch(records, {})
    expect(selected).toHaveLength(2)
    expect(selected.map(record => record.uuid)).not.toContain('a-old')
  })
})
