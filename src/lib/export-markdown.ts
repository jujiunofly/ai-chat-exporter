/**
 * Markdown export functionality for conversations
 */

import type { Conversation, ExportOptions, ChatMessage, CodeBlock } from './types'

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
  lines.push(`*Exported from ${conversation.platform === 'chatgpt' ? 'ChatGPT' : 'Google Gemini'} on ${new Date().toLocaleDateString()}*`)
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
  lines.push(`- **Platform:** ${conversation.platform === 'chatgpt' ? 'ChatGPT' : 'Google Gemini'}`)
  lines.push(`- **URL:** ${conversation.url}`)
  lines.push(`- **Messages:** ${conversation.messages.length}`)
  
  if (conversation.createdAt) {
    const date = new Date(conversation.createdAt)
    lines.push(`- **Created:** ${date.toLocaleString()}`)
  }
  
  return lines.push('') && lines
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
 * Format message content
 * @param content - The message content
 * @returns Array of formatted lines
 */
function formatContent(content: string): string[] {
  // Split by double newlines to preserve paragraphs
  const paragraphs = content.split(/\n\n+/)
  
  return paragraphs.map(para => {
    // Handle single newlines within paragraphs
    return para.replace(/\n/g, '  \n')
  })
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
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100)
  
  return `${sanitized}.md`
}
