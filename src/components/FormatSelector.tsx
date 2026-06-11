/**
 * FormatSelector Component
 * Allows users to choose between PDF and Markdown export formats
 */

import React from 'react'
import type { ExportFormat } from '../lib/types'

interface FormatSelectorProps {
  value: ExportFormat
  onChange: (format: ExportFormat) => void
  disabled?: boolean
}

/**
 * Format selector with PDF and Markdown options
 */
export function FormatSelector({
  value,
  onChange,
  disabled = false
}: FormatSelectorProps) {
  return (
    <div className="format-selector">
      <label className="selector-label">Export Format</label>
      <div className="format-options">
        <button
          type="button"
          className={`format-option ${value === 'pdf' ? 'active' : ''}`}
          onClick={() => onChange('pdf')}
          disabled={disabled}
          aria-pressed={value === 'pdf'}
        >
          <span className="icon">📄</span>
          <span className="label">PDF</span>
        </button>
        
        <button
          type="button"
          className={`format-option ${value === 'markdown' ? 'active' : ''}`}
          onClick={() => onChange('markdown')}
          disabled={disabled}
          aria-pressed={value === 'markdown'}
        >
          <span className="icon">📝</span>
          <span className="label">Markdown</span>
        </button>
      </div>
    </div>
  )
}

export default FormatSelector
