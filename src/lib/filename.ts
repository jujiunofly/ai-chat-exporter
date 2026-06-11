/**
 * Filename generation utility for exports
 */

import type { Conversation } from './types'

/**
 * Sanitize a string for use as a filename
 * Removes or replaces characters not allowed in filenames
 * Preserves Unicode characters (Chinese, Japanese, Korean, Arabic, etc.)
 */
function sanitizeFilename(text: string): string {
  return text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')  // Remove filesystem-unsafe chars only
    .replace(/\s+/g, '-')                      // Replace spaces with hyphens
    .replace(/-+/g, '-')                       // Collapse multiple hyphens
    .replace(/^-|-$/g, '')                     // Remove leading/trailing hyphens
    .substring(0, 200)                         // Truncate to reasonable length
}

/**
 * Get a date string as YYYY-MM-DD from a Date or timestamp
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get a date and time string as YYYY-MM-DDTHHmmss from a Date or timestamp
 * Uses 'T' separator which gets lowercased in filenames to 't'
 */
function formatDateTime(date: Date): string {
  const iso = date.toISOString()
  // Extract YYYY-MM-DDTHHmmss from ISO string, dropping milliseconds and timezone
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  if (match) {
    return match[1] + 'T' + match[2].replace(/:/g, '')
  }
  return iso.replace(/[:.]/g, '').split('T').join('T').substring(0, 19)
}

/**
 * Get the current date as YYYY-MM-DD
 */
function getDateStr(): string {
  return formatDate(new Date())
}

/**
 * Get the current date and time as YYYY-MM-DDTHHmmss
 */
function getDateTimeStr(): string {
  return formatDateTime(new Date())
}

/**
 * Get a conversation date string from createdAt timestamp
 * Falls back to current date if createdAt is not available
 */
function getConvDateStr(conversation: Conversation): string {
  if (conversation.createdAt) {
    return formatDate(new Date(conversation.createdAt))
  }
  return getDateStr()
}

/**
 * Get a conversation date and time string from createdAt timestamp
 * Falls back to current date/time if createdAt is not available
 */
function getConvDateTimeStr(conversation: Conversation): string {
  if (conversation.createdAt) {
    return formatDateTime(new Date(conversation.createdAt))
  }
  return getDateTimeStr()
}

/**
 * Generate a filename from a pattern and conversation
 * @param pattern - The filename pattern (e.g., '{date}-{platform}-{title}')
 * @param conversation - The conversation data
 * @param index - Optional index for bulk exports (padded to 3 digits)
 * @returns Sanitized filename with extension
 */
export function generateFilename(
  pattern: string,
  conversation: Conversation,
  index?: number
): string {
  const vars: Record<string, string> = {
    date: getDateStr(),
    datetime: getDateTimeStr(),
    end_date: getDateStr(),
    conv_date: getConvDateStr(conversation),
    conv_datetime: getConvDateTimeStr(conversation),
    title: sanitizeFilename(
      conversation.title && conversation.title !== 'Untitled Conversation'
        ? conversation.title
        : (conversation.messages.length > 0
            ? conversation.messages[0].content.substring(0, 80)
            : 'untitled')
    ),
    platform: conversation.platform,
    index: index !== undefined ? String(index).padStart(3, '0') : '000',
    msgcount: String(conversation.messages.length),
  }

  let filename = pattern.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match
  })

  // Final sanitization
  filename = sanitizeFilename(filename)

  // Ensure non-empty filename
  if (!filename || filename.length < 1) {
    filename = 'export'
  }

  return filename
}

/**
 * Get the default filename pattern
 */
export function getDefaultPattern(): string {
  return '{date}-{title}'
}

/**
 * Preview variables for the filename editor
 */
export const FILENAME_PREVIEW_VARS: Record<string, (conv: Conversation) => string> = {
  date: () => getDateStr(),
  datetime: () => getDateTimeStr(),
  end_date: () => getDateStr(),
  conv_date: (conv) => getConvDateStr(conv),
  conv_datetime: (conv) => getConvDateTimeStr(conv),
  title: (conv) => sanitizeFilename(conv.title || 'untitled'),
  platform: (conv) => conv.platform,
  index: () => '001',
  msgcount: (conv) => String(conv.messages.length),
}
