/**
 * ExportButton Component
 * Gemini-inspired button with spinner and success states
 */

import React from 'react'

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  format: 'pdf' | 'markdown'
  className?: string
  text?: string
  isSuccess?: boolean
}

/** Inline SVG Icons */
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

/**
 * Export button with loading state, success state, and format indicator
 */
export function ExportButton({
  onClick,
  disabled = false,
  loading = false,
  format,
  className = '',
  text,
  isSuccess = false
}: ExportButtonProps) {
  const defaultText = text || `Export as ${format === 'pdf' ? 'PDF' : 'Markdown'}`

  let content: React.ReactNode
  let btnClass = `btn btn-primary ${className}`

  if (loading) {
    content = (
      <>
        <span className="spinner" />
        <span>Exporting...</span>
      </>
    )
  } else if (isSuccess) {
    content = (
      <>
        <CheckIcon />
        <span>Export Successful</span>
      </>
    )
    btnClass += ' success'
  } else {
    content = (
      <>
        <DownloadIcon />
        <span>{defaultText}</span>
      </>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading || isSuccess}
      className={btnClass}
      style={isSuccess ? { backgroundColor: 'var(--success)' } : {}}
      aria-label={`Export as ${format === 'pdf' ? 'PDF' : 'Markdown'}`}
    >
      {content}
    </button>
  )
}

export default ExportButton
