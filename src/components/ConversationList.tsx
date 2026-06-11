/**
 * ConversationList Component
 * Displays a list of conversations for batch export
 */

import React from 'react'
import type { Conversation } from '../lib/types'

interface ConversationListProps {
  conversations: Conversation[]
  selectedIds: string[]
  onSelect: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

/**
 * List of conversations with selection checkboxes
 */
export function ConversationList({
  conversations,
  selectedIds,
  onSelect,
  onSelectAll,
  onDeselectAll
}: ConversationListProps) {
  const allSelected = conversations.length > 0 && 
                     selectedIds.length === conversations.length
  
  return (
    <div className="conversation-list">
      <div className="list-header">
        <label className="select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => allSelected ? onDeselectAll() : onSelectAll()}
          />
          <span>Select All ({conversations.length})</span>
        </label>
      </div>
      
      <ul className="conversation-items">
        {conversations.map(conv => (
          <li
            key={conv.id}
            className={`conversation-item ${selectedIds.includes(conv.id) ? 'selected' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={selectedIds.includes(conv.id)}
                onChange={() => onSelect(conv.id)}
              />
              <div className="conversation-info">
                <span className="title">{conv.title || 'Untitled'}</span>
                <span className="meta">
                  {conv.messages.length} messages • {conv.platform}
                </span>
              </div>
            </label>
          </li>
        ))}
      </ul>
      
      {conversations.length === 0 && (
        <div className="empty-state">
          No conversations detected on this page.
        </div>
      )}
    </div>
  )
}

export default ConversationList
