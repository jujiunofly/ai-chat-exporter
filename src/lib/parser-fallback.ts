import type { Conversation } from './types'

/**
 * Decide whether a DOM-parsed conversation is likely incomplete and should be
 * replaced by an API detail fetch.
 *
 * A common real-world failure is a SPA rendering only the user's message while
 * assistant output lives in a virtualized/artifact tree. Returning that partial
 * DOM result causes exports with one user message and no AI response.
 */
function hasAssistantContent(conversation: Conversation | null | undefined): boolean {
  if (!conversation || !Array.isArray(conversation.messages)) return false
  return conversation.messages.some(
    message => message.role === 'assistant' && message.content.trim().length > 0
  )
}

export function shouldUseApiFallback(conversation: Conversation | null | undefined): boolean {
  if (!conversation) return true
  if (!Array.isArray(conversation.messages) || conversation.messages.length === 0) return true

  return !hasAssistantContent(conversation)
}

export function preferMoreCompleteConversation<T extends Conversation | null | undefined>(
  domConversation: T,
  apiConversation: Conversation | null | undefined
): Conversation | T {
  if (!apiConversation) return domConversation
  if (!domConversation) return apiConversation

  const domHasAssistant = hasAssistantContent(domConversation)
  const apiHasAssistant = hasAssistantContent(apiConversation)

  if (domHasAssistant && !apiHasAssistant) return domConversation
  if (!domHasAssistant && apiHasAssistant) return apiConversation

  return apiConversation.messages.length >= domConversation.messages.length
    ? apiConversation
    : domConversation
}
