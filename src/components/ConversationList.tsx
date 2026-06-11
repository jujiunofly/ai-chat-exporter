/**
 * ConversationList Component
 * Displays a list of conversations from sidebar for bulk export
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
 * List of conversations with selection checkboxes
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
        <span className="selected-count">
          {selectedIds.length} selected
        </span>
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
                  {conv.platform === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                </span>
              </div>
            </label>
          </li>
        ))}
      </ul>
      
      {conversations.length === 0 && (
        <div className="empty-state">
          No conversations found in sidebar.
        </div>
      )}
      
      <div className="list-footer">
        <button
          className="export-button"
          onClick={onExport}
          disabled={selectedIds.length === 0 || loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              <span>Exporting...</span>
            </>
          ) : (
            <span>Export Selected ({selectedIds.length})</span>
          )}
        </button>
      </div>
    </div>
  )
}

export default ConversationList
