/**
 * FormatSelector Component
 * Archive Desk segmented control — archival Markdown first, PDF second.
 */

import type { ExportFormat } from '../lib/types'

interface FormatSelectorProps {
  value: ExportFormat
  onChange: (format: ExportFormat) => void
  disabled?: boolean
}

/** Inline SVG Icons */
const MarkdownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <path d="M9 15l2-2 2 2"></path>
    <path d="M13 11l-2 2-2-2"></path>
  </svg>
)

const PdfIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <path d="M9 15v-4"></path>
    <path d="M12 15v-4"></path>
    <path d="M15 15v-4"></path>
  </svg>
)

/**
 * Segmented format choice: Markdown (.md) or PDF.
 */
export function FormatSelector({
  value,
  onChange,
  disabled = false
}: FormatSelectorProps) {
  return (
    <div className="format-selector" role="group" aria-label="Export format">
      <button
        type="button"
        className={`format-btn ${value === 'markdown' ? 'active' : ''}`}
        onClick={() => onChange('markdown')}
        disabled={disabled}
        aria-pressed={value === 'markdown'}
      >
        <span className="icon"><MarkdownIcon /></span>
        Markdown
      </button>

      <button
        type="button"
        className={`format-btn ${value === 'pdf' ? 'active' : ''}`}
        onClick={() => onChange('pdf')}
        disabled={disabled}
        aria-pressed={value === 'pdf'}
      >
        <span className="icon"><PdfIcon /></span>
        PDF
      </button>
    </div>
  )
}
