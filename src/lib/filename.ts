/**
 * Filename generation utility for exports
 */

import type { Conversation } from './types'

/**
 * Sanitize a string for use as a filename
 * Removes or replaces characters not allowed in filenames
 */
function sanitizeFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, '-')         // Replace spaces with hyphens
    .replace(/-+/g, '-')          // Collapse multiple hyphens
    .replace(/^-|-$/g, '')        // Remove leading/trailing hyphens
    .substring(0, 100)            // Truncate to reasonable length
}

/**
 * Get the current date as YYYY-MM-DD
 */
function getDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Get the current date and time as YYYY-MM-DDTHHmmss
 */
function getDateTimeStr(): string {
  return new Date().toISOString().replace(/[:.]/g, '').split('T').join('T')
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
    title: sanitizeFilename(conversation.title || 'untitled'),
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
  title: (conv) => sanitizeFilename(conv.title || 'untitled'),
  platform: (conv) => conv.platform,
  index: () => '001',
  msgcount: (conv) => String(conv.messages.length),
}
