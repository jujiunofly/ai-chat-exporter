import { describe, expect, it } from 'vitest'
import { parseBulkCalendarDate, selectBulkConversations } from '../src/lib/bulk-selection'
import type { ConversationListItem } from '../src/lib/types'

const item = (id: string, createdAt?: number): ConversationListItem => ({
  id,
  title: id,
  url: '',
  platform: 'chatgpt',
  createdAt,
})

describe('bulk selection', () => {
  it('rejects impossible calendar dates instead of normalizing them', () => {
    expect(parseBulkCalendarDate('2026-02-30')).toBeNull()
    expect(parseBulkCalendarDate('2026-13-01')).toBeNull()
  })

  it('treats date bounds as inclusive local calendar days', () => {
    const from = parseBulkCalendarDate('2026-06-08')!
    const to = parseBulkCalendarDate('2026-06-08', true)!
    const result = selectBulkConversations([
      item('start', from),
      item('end', to),
      item('next', to + 1),
    ], { from: '2026-06-08', to: '2026-06-08', limit: 10 })

    expect(result.map(entry => entry.id)).toEqual(['end', 'start'])
  })

  it('does not guess dates for provider list items that have no timestamp', () => {
    const result = selectBulkConversations([
      item('dated', parseBulkCalendarDate('2026-06-08')!),
      item('unknown'),
    ], { from: '2026-06-08', to: '2026-06-08', limit: 10 })

    expect(result.map(entry => entry.id)).toEqual(['dated'])
  })

  it('uses a provider activity timestamp only when an exact creation date is unavailable', () => {
    const activityTime = parseBulkCalendarDate('2026-06-08')!
    const result = selectBulkConversations([
      { ...item('gemini-activity'), platform: 'gemini', updatedAt: activityTime },
      { ...item('unknown'), platform: 'gemini' },
    ], { from: '2026-06-08', to: '2026-06-08', limit: 10 })

    expect(result.map(entry => entry.id)).toEqual(['gemini-activity'])
  })

  it('applies the requested cap and excludes already archived IDs', () => {
    const result = selectBulkConversations([
      item('one', 1),
      item('two', 2),
      item('three', 3),
    ], { limit: 1, excludedIds: ['three'] })

    expect(result.map(entry => entry.id)).toEqual(['two'])
  })
})
