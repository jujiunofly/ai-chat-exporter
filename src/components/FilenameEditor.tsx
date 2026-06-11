/**
 * FilenameEditor Component
 * Gemini-inspired chip-based variable insertion with live preview
 */

import React, { useState, useEffect } from 'react'
import type { Conversation, FilenameOption } from '../lib/types'
import { FILENAME_OPTIONS } from '../lib/types'
import { generateFilename, getDefaultPattern } from '../lib/filename'

interface FilenameEditorProps {
  value: string
  onChange: (pattern: string) => void
  conversation?: Conversation | null
  disabled?: boolean
}

/** Inline SVG Icon */
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
)

/**
 * Filename pattern editor with chip-based variable insertion and live preview
 */
export function FilenameEditor({
  value,
  onChange,
  conversation,
  disabled = false
}: FilenameEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [preview, setPreview] = useState('')

  // Update preview when pattern or conversation changes
  useEffect(() => {
    if (conversation) {
      const filename = generateFilename(value, conversation, 1)
      setPreview(filename)
    } else {
      // Show a placeholder preview
      const dummyConv: Conversation = {
        id: 'preview',
        title: 'example-conversation',
        url: '',
        messages: [],
        platform: 'chatgpt'
      }
      const filename = generateFilename(value, dummyConv, 1)
      setPreview(filename)
    }
  }, [value, conversation])

  const insertVariable = (key: string) => {
    const newValue = value + `{${key}}`
    onChange(newValue)
  }

  const resetToDefault = () => {
    onChange(getDefaultPattern())
  }

  if (!isEditing) {
    return (
      <div className="flex-col gap-1">
        <span className="text-sm text-muted">Filename:</span>
        <div
          className="input flex justify-between items-center"
          style={{ cursor: 'pointer', background: 'var(--bg-secondary)' }}
          onClick={() => !disabled && setIsEditing(true)}
        >
          <span className="text-sm" style={{ fontFamily: 'monospace' }}>{value}</span>
          <EditIcon />
        </div>
        <span className="text-xs text-muted">Preview: {preview}</span>
      </div>
    )
  }

  return (
    <div className="flex-col gap-2 p-3" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">Edit Pattern</span>
        <button className="btn-icon" onClick={() => setIsEditing(false)}>&times;</button>
      </div>
      <input
        className="input text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={getDefaultPattern()}
        autoFocus
        aria-label="Filename pattern"
      />
      <div>
        <span className="text-xs text-muted">Variables:</span>
        <div className="chip-container">
          {FILENAME_OPTIONS.map((opt: FilenameOption) => (
            <span
              key={opt.key}
              className="chip"
              onClick={() => !disabled && insertVariable(opt.key)}
              title={opt.example}
            >
              {`{${opt.key}}`}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs mt-2 p-2 flex-1" style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
          → {preview}
        </div>
        <button
          className="btn btn-outline mt-2"
          style={{ width: 'auto', padding: '4px 12px', fontSize: '12px' }}
          onClick={resetToDefault}
          disabled={disabled}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export default FilenameEditor
