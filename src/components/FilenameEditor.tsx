/**
 * FilenameEditor Component
 * Allows users to configure filename patterns with live preview
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

/**
 * Filename pattern editor with live preview
 */
export function FilenameEditor({
  value,
  onChange,
  conversation,
  disabled = false
}: FilenameEditorProps) {
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

  return (
    <div className="filename-editor">
      <label className="editor-label">Filename Pattern</label>
      
      <div className="pattern-input-wrapper">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={getDefaultPattern()}
          className="pattern-input"
          aria-label="Filename pattern"
        />
        <button
          type="button"
          onClick={resetToDefault}
          disabled={disabled}
          className="reset-button"
          title="Reset to default"
        >
          ↺
        </button>
      </div>

      <div className="variable-chips">
        {FILENAME_OPTIONS.map((opt: FilenameOption) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => insertVariable(opt.key)}
            disabled={disabled}
            className="variable-chip"
            title={opt.example}
          >
            {`{${opt.key}}`}
          </button>
        ))}
      </div>

      <div className="filename-preview">
        <span className="preview-label">Preview:</span>
        <span className="preview-filename">{preview}.md</span>
      </div>
    </div>
  )
}

export default FilenameEditor
