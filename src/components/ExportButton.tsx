/**
 * ExportButton Component
 * Reusable button for exporting conversations
 */

import React from 'react'

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  format: 'pdf' | 'markdown'
  className?: string
}

/**
 * Export button with loading state and format indicator
 */
export function ExportButton({
  onClick,
  disabled = false,
  loading = false,
  format,
  className = ''
}: ExportButtonProps) {
  const formatLabel = format === 'pdf' ? 'PDF' : 'Markdown'
  const icon = format === 'pdf' ? '📄' : '📝'
  
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`export-button ${className} ${loading ? 'loading' : ''}`}
      aria-label={`Export as ${formatLabel}`}
    >
      {loading ? (
        <>
          <span className="spinner" />
          <span>Exporting...</span>
        </>
      ) : (
        <>
          <span className="icon">{icon}</span>
          <span>Export as {formatLabel}</span>
        </>
      )}
    </button>
  )
}

export default ExportButton
