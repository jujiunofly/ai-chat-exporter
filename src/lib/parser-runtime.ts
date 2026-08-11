/**
 * Shared content-script runtime for the platform parsers.
 *
 * Each contents/*-parser.ts used to end with a verbatim copy of the page-load
 * main() routine and the popup message listener (PARSE_CONVERSATION,
 * DETECT_PLATFORM, FETCH_CONVERSATION_LIST, FETCH_ALL_CONVERSATIONS,
 * FETCH_CONVERSATION_DETAIL). This module hosts that shared pipeline; a parser
 * only supplies its platform name, parser instance, URL conversation-ID
 * extractor, and — where its flow genuinely differs (e.g. Gemini) — branch
 * handler overrides.
 */
import type { Conversation, ConversationListItem } from './types'
import { mergeRenderedImageAttachments, preferMoreCompleteConversation } from './parser-fallback'
import { isProviderRateLimitError } from './provider-rate-limit'

/** Subset of parser methods the shared runtime depends on. */
export interface ParserRuntimeParser {
  isConversationPage(): boolean
  parseCurrentConversation(): Promise<Conversation | null>
  getConversationTitle(): string | null
  getConversationList(): ConversationListItem[]
  /** Absent on parsers that override FETCH_ALL_CONVERSATIONS (e.g. Gemini). */
  fetchAllConversations?: () => Promise<ConversationListItem[]>
  fetchConversationDetail(id: string): Promise<Conversation | null>
  isAuthenticationRequired(): boolean
}

type SendResponse = (response?: any) => void

/**
 * Custom message-branch handler. Return true to keep the message channel open
 * for an asynchronous sendResponse.
 */
type BranchHandler = (message: any, sendResponse: SendResponse) => boolean | void

export interface ParserRuntimeConfig {
  platform: string
  parser: ParserRuntimeParser
  /**
   * Extract the current conversation ID from the page URL so PARSE_CONVERSATION
   * can merge the richer API detail into the DOM parse.
   */
  extractConversationId?: (url: string) => string | null | undefined
  /** Optional error loggers (Claude logs API/parse failures to the console). */
  logApiError?: (error: unknown) => void
  logParseError?: (error: unknown) => void
  /** Branch overrides for platforms whose flow differs from the standard pipeline. */
  handleParseConversation?: BranchHandler
  handleFetchAllConversations?: BranchHandler
  handleFetchConversationDetail?: BranchHandler
}

/**
 * Page-load routine: parse the currently open conversation and cache it in
 * chrome.storage so the popup can render it without re-parsing.
 */
export async function runParserMain(
  parser: Pick<ParserRuntimeParser, 'isConversationPage' | 'parseCurrentConversation'>
): Promise<void> {
  if (parser.isConversationPage()) {
    const conversation = await parser.parseCurrentConversation()
    if (conversation) {
      chrome.storage.local.set({
        [`conversation-${conversation.id}`]: { ...conversation, timestamp: Date.now() }
      })
    }
  }
}

/** Register the shared popup-message listener for a platform parser. */
export function registerParserMessageHandler(config: ParserRuntimeConfig): void {
  const { platform, parser } = config
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PARSE_CONVERSATION') {
      if (config.handleParseConversation) return config.handleParseConversation(message, sendResponse)
      parser.parseCurrentConversation().then(conversation => {
        // API detail is preferred when available because it preserves markdown,
        // artifacts, and message structure better than DOM text extraction.
        const id = config.extractConversationId?.(window.location.href)
        if (id) {
          parser.fetchConversationDetail(id).then(apiConv => {
            const preferred = preferMoreCompleteConversation(conversation, apiConv)
            const renderedFallback = preferred === apiConv ? conversation : apiConv
            // The API preserves Markdown and ordering; the live DOM can still
            // carry image URLs that the API represents only as internal handles.
            sendResponse({ data: mergeRenderedImageAttachments(preferred, renderedFallback) })
          }).catch(error => {
            config.logApiError?.(error)
            sendResponse({ data: conversation })
          })
        } else {
          sendResponse({ data: conversation })
        }
      }).catch(error => {
        config.logParseError?.(error)
        sendResponse({ error: error.message })
      })
      return true // Keep message channel open
    }

    if (message.type === 'DETECT_PLATFORM') {
      sendResponse({
        data: {
          platform,
          isConversationPage: parser.isConversationPage(),
          title: parser.getConversationTitle()
        }
      })
    }

    if (message.type === 'FETCH_CONVERSATION_LIST') {
      try {
        const list = parser.getConversationList()
        sendResponse({ data: list })
      } catch (error) {
        sendResponse({ error: (error as Error).message })
      }
    }

    if (message.type === 'FETCH_ALL_CONVERSATIONS') {
      if (config.handleFetchAllConversations) return config.handleFetchAllConversations(message, sendResponse)
      parser.fetchAllConversations().then(list => {
        sendResponse({ data: list, meta: { authRequired: parser.isAuthenticationRequired() } })
      }).catch(error => {
        if (isProviderRateLimitError(error)) {
          sendResponse({ error: error.message, meta: { authRequired: parser.isAuthenticationRequired() } })
          return
        }
        // Fall back to DOM-based list
        try {
          const fallbackList = parser.getConversationList()
          sendResponse({ data: fallbackList, meta: { authRequired: parser.isAuthenticationRequired() } })
        } catch {
          sendResponse({ error: (error as Error).message, meta: { authRequired: parser.isAuthenticationRequired() } })
        }
      })
      return true
    }

    if (message.type === 'FETCH_CONVERSATION_DETAIL') {
      if (config.handleFetchConversationDetail) return config.handleFetchConversationDetail(message, sendResponse)
      parser.fetchConversationDetail(message.data?.id).then(conversation => {
        sendResponse({ data: conversation })
      }).catch(error => {
        sendResponse({ error: error.message })
      })
      return true
    }
  })
}
