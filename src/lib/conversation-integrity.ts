import type { Conversation } from './types'

export type ConversationIntegrityStatus = 'complete' | 'suspicious' | 'incomplete' | 'empty'

export interface ConversationIntegrityResult {
  status: ConversationIntegrityStatus
  messageCount: number
  userCount: number
  assistantCount: number
  nonEmptyContentCount: number
  reasons: string[]
  shouldAttemptFallback: boolean
}

/**
 * Inspect a parsed conversation before it reaches an export renderer.
 *
 * The distinction between suspicious and incomplete is intentional: a user
 * only DOM result may be recoverable through a provider detail endpoint, but
 * it must never be treated as a successful export by itself.
 */
export function analyzeConversationIntegrity(
  conversation: Conversation | null | undefined
): ConversationIntegrityResult {
  if (!conversation) {
    return {
      status: 'empty',
      messageCount: 0,
      userCount: 0,
      assistantCount: 0,
      nonEmptyContentCount: 0,
      reasons: ['conversation_missing'],
      shouldAttemptFallback: true,
    }
  }

  const messages = Array.isArray(conversation.messages) ? conversation.messages : []
  const nonEmpty = messages.filter(message => typeof message.content === 'string' && message.content.trim())
  const userCount = nonEmpty.filter(message => message.role === 'user').length
  const assistantCount = nonEmpty.filter(message => message.role === 'assistant').length
  const reasons: string[] = []

  if (messages.length === 0) reasons.push('no_messages')
  if (nonEmpty.length === 0 && messages.length > 0) reasons.push('no_non_empty_content')
  if (userCount > 0 && assistantCount === 0) reasons.push('assistant_messages_missing')
  if (assistantCount > 0 && userCount === 0) reasons.push('user_messages_missing')
  if (userCount === 0 && assistantCount === 0 && messages.length > 0) reasons.push('roles_unrecognized')

  let status: ConversationIntegrityStatus
  if (messages.length === 0 || nonEmpty.length === 0) {
    status = messages.length === 0 ? 'empty' : 'incomplete'
  } else if (userCount === 0 || assistantCount === 0) {
    status = 'suspicious'
  } else {
    status = 'complete'
  }

  return {
    status,
    messageCount: messages.length,
    userCount,
    assistantCount,
    nonEmptyContentCount: nonEmpty.length,
    reasons,
    shouldAttemptFallback: status !== 'complete',
  }
}

/** A strict gate for export paths: both sides of a chat must be present. */
export function isConversationComplete(
  conversation: Conversation | null | undefined
): conversation is Conversation {
  return analyzeConversationIntegrity(conversation).status === 'complete'
}

export function conversationIntegrityError(result: ConversationIntegrityResult): string {
  if (result.status === 'empty') return 'Conversation is empty or unavailable.'
  if (result.reasons.includes('assistant_messages_missing')) {
    return 'Conversation appears incomplete: no assistant responses were detected.'
  }
  if (result.reasons.includes('user_messages_missing')) {
    return 'Conversation appears incomplete: no user messages were detected.'
  }
  return 'Conversation appears incomplete and cannot be exported safely.'
}
