import type { Conversation } from './types'
import { analyzeConversationIntegrity } from './conversation-integrity'

/**
 * Decide whether a DOM-parsed conversation is likely incomplete and should be
 * replaced by an API detail fetch.
 *
 * A common real-world failure is a SPA rendering only the user's message while
 * assistant output lives in a virtualized/artifact tree. Returning that partial
 * DOM result causes exports with one user message and no AI response.
 */
export function shouldUseApiFallback(conversation: Conversation | null | undefined): boolean {
  return analyzeConversationIntegrity(conversation).shouldAttemptFallback
}

export function preferMoreCompleteConversation<T extends Conversation | null | undefined>(
  domConversation: T,
  apiConversation: Conversation | null | undefined
): Conversation | T {
  if (!apiConversation) return domConversation
  if (!domConversation) return apiConversation

  const domIntegrity = analyzeConversationIntegrity(domConversation)
  const apiIntegrity = analyzeConversationIntegrity(apiConversation)
  const domHasAssistant = domIntegrity.assistantCount > 0
  const apiHasAssistant = apiIntegrity.assistantCount > 0

  if (domHasAssistant && !apiHasAssistant) return domConversation
  if (!domHasAssistant && apiHasAssistant) return apiConversation

  // Prefer the result with more usable content, not a branch-expanded result
  // that is merely longer. Assistant/user counts are weighted before raw
  // message count so a user-only DOM cannot beat a complete API response.
  const domScore = domIntegrity.assistantCount * 4 + domIntegrity.userCount * 2 + domIntegrity.nonEmptyContentCount
  const apiScore = apiIntegrity.assistantCount * 4 + apiIntegrity.userCount * 2 + apiIntegrity.nonEmptyContentCount
  if (apiScore !== domScore) return apiScore > domScore ? apiConversation : domConversation

  return apiConversation.messages.length >= domConversation.messages.length ? apiConversation : domConversation
}

/**
 * Preserve rendered image URLs when the API wins for richer Markdown/text.
 *
 * ChatGPT occasionally serializes an assistant image as an internal
 * `iturn…image…` handle in the API payload while the live message DOM has the
 * actual <img> URL. We only merge images from a confidently matched message;
 * this keeps API ordering and content authoritative without inventing media
 * for another turn.
 */
export function mergeRenderedImageAttachments(
  preferred: Conversation | null | undefined,
  rendered: Conversation | null | undefined
): Conversation | null | undefined {
  if (!preferred || !rendered) return preferred

  const usedRenderedIndexes = new Set<number>()
  let changed = false
  const messages = preferred.messages.map((message, preferredIndex) => {
    const preferredText = comparableMessageText(message.content)
    const renderedIndex = rendered.messages.findIndex((candidate, index) => {
      if (usedRenderedIndexes.has(index) || candidate.role !== message.role) return false
      if (candidate.id && message.id && candidate.id === message.id) return true
      // Some provider paths generate a DOM-only id. In that case keep the
      // fallback conservative: require the same role and a meaningful shared
      // content prefix rather than attaching an image by just turn number.
      return messagesLikelyMatch(preferredText, comparableMessageText(candidate.content), preferredIndex, index)
    })
    if (renderedIndex < 0) return message

    usedRenderedIndexes.add(renderedIndex)
    const renderedImages = (rendered.messages[renderedIndex].attachments || [])
      .filter(attachment => attachment.type === 'image' && Boolean(attachment.url))
    if (renderedImages.length === 0) return message

    const existing = message.attachments || []
    const known = new Set(existing.map(attachment => `${attachment.type}\u0000${attachment.url}`))
    const additions = renderedImages.filter(attachment => !known.has(`${attachment.type}\u0000${attachment.url}`))
    const content = mergeInlineRenderedImages(message.content, rendered.messages[renderedIndex].content)
    if (additions.length === 0 && content === message.content) return message

    changed = true
    return { ...message, content, attachments: additions.length > 0 ? [...existing, ...additions] : existing }
  })

  return changed ? { ...preferred, messages } : preferred
}

interface MarkdownBlock {
  start: number
  end: number
  comparable: string
}

interface InlineRenderedImage {
  start: number
  end: number
  markdown: string
  url: string
}

const PROVIDER_IMAGE_HANDLE = /\b(?:i?turn\d+(?:image|video|asset)\d+)\b/gi
const PROVIDER_IMAGE_HANDLE_TEST = /\b(?:i?turn\d+(?:image|video|asset)\d+)\b/i

/**
 * API payloads often retain stronger Markdown than the live DOM, but may omit
 * an image position entirely. The DOM parser records `![alt](url)` at the
 * actual node position, so use its neighbouring text blocks as conservative
 * anchors and insert the image into the equivalent API paragraph.
 */
function mergeInlineRenderedImages(preferred: string, rendered: string): string {
  if (!preferred || !rendered || PROVIDER_IMAGE_HANDLE_TEST.test(preferred)) return preferred

  const images = inlineRenderedImages(rendered)
  if (images.length === 0) return preferred

  let merged = preferred
  // Work from the last image back so positions calculated from the API text
  // remain valid when a message contains more than one rendered image.
  for (const image of [...images].reverse()) {
    if (merged.includes(image.url)) continue
    const placement = findInlineImagePlacement(merged, rendered, image)
    if (placement === null) continue
    merged = `${merged.slice(0, placement)}\n\n${image.markdown}\n\n${merged.slice(placement)}`
  }
  return merged
}

function inlineRenderedImages(content: string): InlineRenderedImage[] {
  const images: InlineRenderedImage[] = []
  for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = String(match[1] || '').trim()
    if (!url) continue
    images.push({
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      markdown: match[0],
      url
    })
  }
  return images
}

function findInlineImagePlacement(
  preferred: string,
  rendered: string,
  image: InlineRenderedImage
): number | null {
  const blocks = markdownBlocks(preferred)
  const before = lastMarkdownBlock(rendered.slice(0, image.start))
  const after = firstMarkdownBlock(rendered.slice(image.end))

  const beforeMatch = before ? bestMatchingBlock(blocks, before.comparable) : null
  if (beforeMatch) return beforeMatch.end

  const afterMatch = after ? bestMatchingBlock(blocks, after.comparable) : null
  if (afterMatch) return afterMatch.start

  return null
}

function markdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const matcher = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g
  for (const match of content.matchAll(matcher)) {
    const text = match[0]
    const comparable = comparableBlockText(text)
    if (!comparable) continue
    blocks.push({ start: match.index || 0, end: (match.index || 0) + text.length, comparable })
  }
  return blocks
}

function lastMarkdownBlock(content: string): MarkdownBlock | null {
  const blocks = markdownBlocks(content)
  return blocks.at(-1) || null
}

function firstMarkdownBlock(content: string): MarkdownBlock | null {
  return markdownBlocks(content)[0] || null
}

function bestMatchingBlock(blocks: MarkdownBlock[], anchor: string): MarkdownBlock | null {
  if (anchor.length < 8) return null
  let best: MarkdownBlock | null = null
  let bestScore = 0
  for (const block of blocks) {
    const score = comparableBlockScore(anchor, block.comparable)
    if (score > bestScore) {
      best = block
      bestScore = score
    }
  }
  return bestScore >= 0.78 ? best : null
}

function comparableBlockScore(left: string, right: string): number {
  if (left === right) return 1
  const shortest = Math.min(left.length, right.length)
  const longest = Math.max(left.length, right.length)
  if (shortest < 8) return 0
  if (left.includes(right) || right.includes(left)) return shortest / longest

  const prefix = sharedPrefixLength(left, right)
  const suffix = sharedSuffixLength(left, right)
  return Math.max(prefix, suffix) / shortest
}

function sharedPrefixLength(left: string, right: string): number {
  let length = 0
  while (length < left.length && length < right.length && left[length] === right[length]) length++
  return length
}

function sharedSuffixLength(left: string, right: string): number {
  let length = 0
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) length++
  return length
}

function comparableBlockText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(PROVIDER_IMAGE_HANDLE, '')
    .replace(/[`*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function comparableMessageText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\b(?:i?turn\d+(?:image|video|asset)\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function messagesLikelyMatch(
  preferred: string,
  rendered: string,
  preferredIndex: number,
  renderedIndex: number
): boolean {
  if (!preferred || !rendered) return false
  const overlap = Math.min(80, preferred.length, rendered.length)
  if (overlap < 12 || preferred.slice(0, overlap) !== rendered.slice(0, overlap)) return false
  // Equal turn positions are a useful extra guard when the message text starts
  // with common boilerplate such as "Here is".
  return preferredIndex === renderedIndex || overlap >= 40
}
