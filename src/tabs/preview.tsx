/**
 * Preview Page Component
 * Displays exported conversation preview
 */

import React, { useState, useEffect } from 'react'
import type { Conversation, ExportOptions } from '../lib/types'
import { conversationToMarkdown } from '../lib/export-markdown'
import { conversationToHtml } from '../lib/export-pdf'

type PreviewMode = 'markdown' | 'html'

/**
 * Preview page for exported conversations
 */
export default function Preview() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [mode, setMode] = useState<PreviewMode>('markdown')
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const exportOptions: ExportOptions = {
    format: mode === 'markdown' ? 'markdown' : 'pdf',
    includeMetadata: true,
    includeCodeBlocks: true,
    includeImages: true
  }

  // Load conversation from URL params or storage
  useEffect(() => {
    loadConversation()
  }, [])

  // Update content when mode or conversation changes
  useEffect(() => {
    if (conversation) {
      generatePreview()
    }
  }, [conversation, mode])

  /**
   * Load conversation data
   */
  const loadConversation = async () => {
    try {
      // Try to get from URL params
      const params = new URLSearchParams(window.location.search)
      const conversationId = params.get('id')
      
      if (conversationId) {
        const result = await chrome.storage.local.get(`conversation-${conversationId}`)
        const conv = result[`conversation-${conversationId}`]
        if (conv) {
          setConversation(conv)
          setLoading(false)
          return
        }
      }
      
      // Fallback: try to get active conversation
      const allItems = await chrome.storage.local.get(null)
      const conversationKey = Object.keys(allItems).find(k => k.startsWith('conversation-'))
      
      if (conversationKey) {
        setConversation(allItems[conversationKey])
      } else {
        setError('No conversation to preview')
      }
    } catch (err) {
      setError('Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Generate preview content
   */
  const generatePreview = () => {
    if (!conversation) return
    
    if (mode === 'markdown') {
      setContent(conversationToMarkdown(conversation, exportOptions))
    } else {
      setContent(conversationToHtml(conversation, exportOptions))
    }
  }

  /**
   * Copy content to clipboard
   */
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content)
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  /**
   * Download content as file
   */
  const downloadContent = () => {
    const extension = mode === 'markdown' ? 'md' : 'html'
    const mimeType = mode === 'markdown' ? 'text/markdown' : 'text/html'
    const filename = `${conversation?.title || 'conversation'}.${extension}`
    
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="preview-page">
        <div className="loading">Loading preview...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="preview-page">
        <div className="error">{error}</div>
      </div>
    )
  }

  return (
    <div className="preview-page">
      <header className="preview-header">
        <h1>{conversation?.title || 'Preview'}</h1>
        
        <div className="preview-controls">
          <div className="mode-selector">
            <button
              className={mode === 'markdown' ? 'active' : ''}
              onClick={() => setMode('markdown')}
            >
              Markdown
            </button>
            <button
              className={mode === 'html' ? 'active' : ''}
              onClick={() => setMode('html')}
            >
              HTML
            </button>
          </div>
          
          <button className="copy-button" onClick={copyToClipboard}>
            Copy
          </button>
          
          <button className="download-button" onClick={downloadContent}>
            Download
          </button>
        </div>
      </header>

      <main className="preview-content">
        {mode === 'markdown' ? (
          <pre className="markdown-preview">{content}</pre>
        ) : (
          <iframe
            className="html-preview"
            srcDoc={content}
            title="Preview"
          />
        )}
      </main>
    </div>
  )
}
