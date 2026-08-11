import type { ConversationListItem } from './types'

export type BulkSelectionOrder = 'newest' | 'oldest'

export interface BulkSelectionCriteria {
  /** Inclusive local calendar day, formatted as YYYY-MM-DD. */
  from?: string
  /** Inclusive local calendar day, formatted as YYYY-MM-DD. */
  to?: string
  /** Maximum items to select after date filtering. */
  limit: number
  order?: BulkSelectionOrder
  /** IDs recorded as already exported; used only when the user opts in. */
  excludedIds?: Iterable<string>
}

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

/** Parse a date input as local midnight, avoiding the UTC shift from `new Date('YYYY-MM-DD')`. */
export function parseBulkCalendarDate(value: string | undefined, endOfDay = false): number | null {
  if (!value || !DATE_INPUT.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  // Date normalizes overflow (for example, 2026-02-30) instead of rejecting
  // it, which would silently turn the user's requested date range into another
  // one. Validate the calendar fields after construction.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date.getTime()
}

export function normalizeBulkSelectionLimit(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(500, Math.max(1, Math.floor(value)))
}

/**
 * Select a bounded, date-filtered subset. When a date range is supplied, an
 * item without a provider timestamp is deliberately excluded rather than
 * guessed: silently assigning it today's date would violate the filter. When
 * a provider exposes only activity metadata, use it transparently after an
 * exact creation date when available.
 */
export function selectBulkConversations(
  conversations: readonly ConversationListItem[],
  criteria: BulkSelectionCriteria
): ConversationListItem[] {
  const from = parseBulkCalendarDate(criteria.from)
  const to = parseBulkCalendarDate(criteria.to, true)
  const hasDateFilter = from !== null || to !== null
  const excluded = new Set(criteria.excludedIds ?? [])
  const direction = criteria.order === 'oldest' ? 1 : -1

  return conversations
    .filter(item => {
      if (excluded.has(item.id)) return false
      if (!hasDateFilter) return true
      const timestamp = Number.isFinite(item.createdAt)
        ? item.createdAt as number
        : Number.isFinite(item.updatedAt)
          ? item.updatedAt as number
          : undefined
      if (timestamp === undefined) return false
      return (from === null || timestamp >= from) && (to === null || timestamp <= to)
    })
    .slice()
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.createdAt) ? left.createdAt as number
        : Number.isFinite(left.updatedAt) ? left.updatedAt as number : 0
      const rightTime = Number.isFinite(right.createdAt) ? right.createdAt as number
        : Number.isFinite(right.updatedAt) ? right.updatedAt as number : 0
      return (leftTime - rightTime) * direction
    })
    .slice(0, normalizeBulkSelectionLimit(criteria.limit))
}
