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
export function hasAssistantContent(conversation: Conversation | null | undefined): boolean {
  return analyzeConversationIntegrity(conversation).assistantCount > 0
}

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
