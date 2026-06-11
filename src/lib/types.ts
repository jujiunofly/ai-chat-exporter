/**
 * Shared TypeScript interfaces for AI Chat Exporter
 */

/**
 * Represents a single message in a conversation
 */
export interface ChatMessage {
  /** Unique identifier for the message */
  id: string
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system'
  /** Text content of the message */
  content: string
  /** Optional author name */
  authorName?: string
  /** Optional timestamp (Unix milliseconds) */
  timestamp?: number
  /** Optional attachments (images, files, links) */
  attachments?: Attachment[]
  /** Optional code blocks extracted from the message */
  codeBlocks?: CodeBlock[]
}

/**
 * Represents an attachment in a message
 */
export interface Attachment {
  /** Type of attachment */
  type: 'image' | 'file' | 'link'
  /** URL of the attachment */
  url: string
  /** Optional display name */
  name?: string
}

/**
 * Represents a code block in a message
 */
export interface CodeBlock {
  /** Programming language (if detected) */
  language?: string
  /** The actual code content */
  code: string
}

/**
 * Represents a complete conversation
 */
export interface Conversation {
  /** Unique identifier for the conversation */
  id: string
  /** Title of the conversation */
  title: string
  /** URL of the conversation page */
  url: string
  /** Array of messages in order */
  messages: ChatMessage[]
  /** Optional creation timestamp */
  createdAt?: number
  /** Platform where the conversation originates */
  platform: 'chatgpt' | 'gemini'
}

/**
 * Supported export formats
 */
export type ExportFormat = 'pdf' | 'markdown'

/**
 * Options for exporting a conversation
 */
export interface ExportOptions {
  /** Export format (PDF or Markdown) */
  format: ExportFormat
  /** Whether to include metadata (title, timestamp, etc.) */
  includeMetadata: boolean
  /** Whether to preserve code blocks */
  includeCodeBlocks: boolean
  /** Whether to include images */
  includeImages: boolean
}

/**
 * Platform parser interface
 */
export interface PlatformParser {
  /** The platform this parser handles */
  platform: 'chatgpt' | 'gemini'
  
  /**
   * Parse the current conversation from the DOM
   * @returns Promise resolving to the parsed conversation or null
   */
  parseCurrentConversation(): Promise<Conversation | null>
  
  /**
   * Check if the current page is a conversation page
   */
  isConversationPage(): boolean
  
  /**
   * Get the title of the current conversation
   */
  getConversationTitle(): string
}

/**
 * Extension settings stored in chrome.storage
 */
export interface ExtensionSettings {
  /** Default export format */
  defaultFormat: ExportFormat
  /** Whether to include metadata by default */
  includeMetadata: boolean
  /** Whether to include code blocks by default */
  includeCodeBlocks: boolean
  /** Whether to include images by default */
  includeImages: boolean
  /** UI theme */
  theme: 'light' | 'dark'
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultFormat: 'markdown',
  includeMetadata: true,
  includeCodeBlocks: true,
  includeImages: true,
  theme: 'light'
}

/**
 * Message types for communication between components
 */
export type MessageType = 
  | 'PARSE_CONVERSATION'
  | 'CONVERSATION_PARSED'
  | 'EXPORT_REQUEST'
  | 'EXPORT_COMPLETE'
  | 'GET_SETTINGS'
  | 'SETTINGS_UPDATED'
  | 'DETECT_PLATFORM'
  | 'PLATFORM_DETECTED'

/**
 * Message payload interface
 */
export interface MessagePayload<T = unknown> {
  type: MessageType
  data?: T
  error?: string
}
