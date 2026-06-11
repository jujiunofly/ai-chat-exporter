/**
 * ConversationList Component
 * Gemini-inspired conversation list with selected state (indigo left border)
 */

import React from 'react'
import type { ConversationListItem } from '../lib/types'

interface ConversationListProps {
  conversations: ConversationListItem[]
  selectedIds: string[]
  onSelect: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onExport: () => void
  loading?: boolean
}

/**
 * List of conversations with selection checkboxes and Gemini-style selected state
 */
export function ConversationList({
  conversations,
  selectedIds,
  onSelect,
  onSelectAll,
  onDeselectAll,
  onExport,
  loading = false
}: ConversationListProps) {
  const allSelected = conversations.length > 0 && 
                     selectedIds.length === conversations.length

  return (
    <div className="flex-col gap-2">
      <div className="conv-list">
        {conversations.map(conv => (
          <label
            key={conv.id}
            className={`conv-item ${selectedIds.includes(conv.id) ? 'selected' : ''}`}
          >
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                className="checkbox"
                checked={selectedIds.includes(conv.id)}
                onChange={() => onSelect(conv.id)}
              />
            </div>
            <div className="flex-col flex-1 overflow-hidden">
              <span
                className="text-sm font-medium"
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {conv.title || 'Untitled'}
              </span>
              <span className="text-xs text-muted">
                {conv.platform === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                {conv.messageCount ? ` · ${conv.messageCount} messages` : ''}
              </span>
            </div>
          </label>
        ))}
      </div>
      
      {conversations.length === 0 && (
        <div className="text-sm text-muted" style={{ textAlign: 'center', padding: '24px' }}>
          No conversations found. Click Refresh to load.
        </div>
      )}
    </div>
  )
}

export default ConversationList
