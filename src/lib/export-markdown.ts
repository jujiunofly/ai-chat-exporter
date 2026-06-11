/**
 * Markdown export functionality for conversations
 */

import type { Conversation, ExportOptions, ChatMessage, CodeBlock } from './types'

/** Platform display name lookup */
const platformLabels: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Google Gemini', claude: 'Claude', deepseek: 'DeepSeek', grok: 'Grok' }

/**
 * Convert a conversation to Markdown format
 * @param conversation - The conversation to convert
 * @param options - Export options
 * @returns Markdown string
 */
export function conversationToMarkdown(
  conversation: Conversation,
  options: ExportOptions
): string {
  const lines: string[] = []
  
  // Add header with metadata if enabled
  if (options.includeMetadata) {
    lines.push(...generateMetadataHeader(conversation))
    lines.push('')
  }
  
  // Process each message
  conversation.messages.forEach((message, index) => {
    lines.push(...formatMessage(message, options, index))
    lines.push('')
  })
  
  // Add footer
  lines.push('---')
  lines.push(`*Exported from ${platformLabels[conversation.platform] || conversation.platform} on ${new Date().toLocaleDateString()}*`)
  lines.push('')
  
  return lines.join('\n')
}

/**
 * Generate the metadata header
 * @param conversation - The conversation
 * @returns Array of header lines
 */
function generateMetadataHeader(conversation: Conversation): string[] {
  const lines: string[] = []
  
  lines.push(`# ${conversation.title || 'Untitled Conversation'}`)
  lines.push('')
  
  // Add metadata section
  lines.push('## Metadata')
  lines.push('')
  lines.push(`- **Platform:** ${platformLabels[conversation.platform] || conversation.platform}`)
  lines.push(`- **URL:** ${conversation.url}`)
  lines.push(`- **Messages:** ${conversation.messages.length}`)
  
  if (conversation.createdAt) {
    const date = new Date(conversation.createdAt)
    lines.push(`- **Created:** ${date.toLocaleString()}`)
  }
  
  lines.push('')
  return lines
}

/**
 * Format a single message
 * @param message - The message to format
 * @param options - Export options
 * @param index - Message index
 * @returns Array of formatted lines
 */
function formatMessage(
  message: ChatMessage,
  options: ExportOptions,
  index: number
): string[] {
  const lines: string[] = []
  
  // Add role header
  const roleLabel = formatRoleLabel(message.role)
  const authorInfo = message.authorName ? ` (${message.authorName})` : ''
  lines.push(`### ${roleLabel}${authorInfo}`)
  lines.push('')
  
  // Add timestamp if available
  if (message.timestamp && options.includeMetadata) {
    const time = new Date(message.timestamp).toLocaleTimeString()
    lines.push(`*${time}*`)
    lines.push('')
  }
  
  // Add main content
  if (message.content) {
    lines.push(...formatContent(message.content))
  }
  
  // Add code blocks if enabled
  if (options.includeCodeBlocks && message.codeBlocks?.length) {
    lines.push('')
    message.codeBlocks.forEach(block => {
      lines.push(...formatCodeBlock(block))
      lines.push('')
    })
  }
  
  // Add images if enabled
  if (options.includeImages && message.attachments?.length) {
    const images = message.attachments.filter(a => a.type === 'image')
    if (images.length > 0) {
      lines.push('')
      images.forEach(img => {
        lines.push(`![${img.name || 'Image'}](${img.url})`)
        lines.push('')
      })
    }
    
    // Add other attachments
    const otherAttachments = message.attachments.filter(a => a.type !== 'image')
    if (otherAttachments.length > 0) {
      lines.push('**Attachments:**')
      otherAttachments.forEach(att => {
        if (att.type === 'link') {
          lines.push(`- [${att.name || att.url}](${att.url})`)
        } else {
          lines.push(`- ${att.name || att.url}`)
        }
      })
    }
  }
  
  return lines
}

/**
 * Format role label for display
 * @param role - The message role
 * @returns Formatted role label
 */
function formatRoleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'user':
      return '👤 User'
    case 'assistant':
      return '🤖 Assistant'
    case 'system':
      return '⚙️ System'
    default:
      return role
  }
}

/**
 * Format message content preserving structure
 * - Preserves code blocks (triple backticks) as-is
 * - Preserves headers (#, ##, etc.)
 * - Preserves lists (-, *, 1.)
 * - Preserves double newlines as paragraph breaks
 * - Preserves single newlines as line breaks
 */
function formatContent(content: string): string[] {
  const lines: string[] = []
  
  // Split into segments: code blocks and regular text
  const segments = splitContentSegments(content)
  
  for (const segment of segments) {
    if (segment.type === 'code') {
      // Preserve code blocks as-is
      lines.push(segment.content)
    } else {
      // Process regular text paragraphs
      const paragraphs = segment.content.split(/\n\n+/)
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].trim()) {
          lines.push(paragraphs[i])
          // Add blank line between paragraphs to preserve paragraph breaks in markdown
          if (i < paragraphs.length - 1) {
            lines.push('')
          }
        }
      }
    }
  }
  
  return lines
}

/**
 * Split content into code block and text segments
 */
function splitContentSegments(content: string): Array<{ type: 'text' | 'code'; content: string }> {
  const segments: Array<{ type: 'text' | 'code'; content: string }> = []
  const codeBlockRegex = /(```[\s\S]*?```)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index)
      if (text.trim()) {
        segments.push({ type: 'text', content: text })
      }
    }
    // Add code block
    segments.push({ type: 'code', content: match[1] })
    lastIndex = match.index + match[1].length
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) {
      segments.push({ type: 'text', content: text })
    }
  }
  
  // If no segments found, treat entire content as text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'text', content })
  }
  
  return segments
}

/**
 * Format a code block
 * @param block - The code block
 * @returns Array of formatted lines
 */
function formatCodeBlock(block: CodeBlock): string[] {
  const lines: string[] = []
  const language = block.language || ''
  
  lines.push(`\`\`\`${language}`)
  lines.push(block.code)
  lines.push('```')
  
  return lines
}

/**
 * Generate a filename for the markdown export
 * @param conversation - The conversation
 * @returns Sanitized filename
 */
export function generateMarkdownFilename(conversation: Conversation): string {
  const title = conversation.title || 'conversation'
  const sanitized = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')  // Remove filesystem-unsafe chars only
    .replace(/\s+/g, '-')                      // Replace spaces with hyphens
    .replace(/-+/g, '-')                       // Collapse multiple hyphens
    .replace(/^-|-$/g, '')                     // Remove leading/trailing hyphens
    .substring(0, 200)                         // Truncate
  
  return sanitized ? `${sanitized}.md` : 'conversation.md'
}
