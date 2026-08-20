import type { Conversation, ChatMessage } from './types'
import { isConversationExportable } from './conversation-integrity'

function normalizeConversationId(id: string): string {
  return id.replace(/^c_/, '')
}

/**
 * Bulk export must never turn a failed detail request into a metadata-only
 * document. It also prevents a parser from returning the currently open chat
 * when the user asked for a different conversation.
 */
export function hasUsableConversation(
  conversation: Pick<Conversation, 'id' | 'messages' | 'sourceCompleteness'> | null | undefined,
  requestedId: string
): conversation is Pick<Conversation, 'id' | 'messages' | 'sourceCompleteness'> {
  if (!conversation || normalizeConversationId(conversation.id) !== normalizeConversationId(requestedId)) {
    return false
  }

  return isConversationExportable(conversation as Conversation)
}

/**
 * Combine several already-verified conversations into one document so bulk
 * export can write a single Markdown/PDF file without dropping per-chat titles.
 */
export function mergeConversationsForExport(
  conversations: Conversation[],
  title: string
): Conversation {
  if (conversations.length === 1) return conversations[0]
  const first = conversations[0]
  const messages: ChatMessage[] = conversations.flatMap(conversation => [
    {
      id: `merged-heading-${conversation.id}`,
      role: 'system',
      content: conversation.title || conversation.id,
    },
    ...conversation.messages,
  ])

  return {
    id: `merged-${first.platform}-${conversations.length}`,
    title,
    url: first.url,
    messages,
    createdAt: conversations
      .map(conversation => conversation.createdAt)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .sort((left, right) => left - right)[0],
    modelName: first.modelName,
    platform: first.platform,
    artifacts: conversations.flatMap(conversation => conversation.artifacts || []),
    source: conversations.every(conversation => conversation.source === 'api') ? 'api' : 'mixed',
    sourceCompleteness: conversations.every(conversation => conversation.sourceCompleteness === 'verified')
      ? 'verified'
      : first.sourceCompleteness,
  }
}
