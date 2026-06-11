/**
 * Preview Page Component
 * Gemini-inspired preview with chat bubbles and print-friendly CSS
 */

import React, { useState, useEffect } from 'react'
import '../styles/print.css'
import type { Conversation, ExportOptions } from '../lib/types'
import { conversationToMarkdown } from '../lib/export-markdown'
import { conversationToHtml } from '../lib/export-pdf'

type PreviewMode = 'markdown' | 'html'

/** Inline SVG Icons */
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

/**
 * Preview page for exported conversations with Gemini-style layout
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
      const allItems = await chrome.storage.local.get(null) as unknown as Record<string, unknown>
      const conversationKey = Object.keys(allItems).find(k => k.startsWith('conversation-'))
      
      if (conversationKey) {
        setConversation(allItems[conversationKey] as Conversation)
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
      <div className="preview-container">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading preview...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="preview-container">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)' }}>
          {error}
        </div>
      </div>
    )
  }

  const platformName = conversation?.platform === 'chatgpt' ? 'ChatGPT' : conversation?.platform === 'gemini' ? 'Gemini' : conversation?.platform === 'claude' ? 'Claude' : conversation?.platform === 'deepseek' ? 'DeepSeek' : conversation?.platform === 'grok' ? 'Grok' : 'Unknown'
  const createdDate = conversation?.createdAt 
    ? new Date(conversation.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="preview-container">
      {/* Header with title, metadata, and download buttons */}
      <div className="preview-header flex justify-between items-center">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {conversation?.title || 'Preview'}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span>{createdDate}</span>
            <span>&bull;</span>
            <span>{platformName}</span>
            <span>&bull;</span>
            <span>{conversation?.messages.length || 0} messages</span>
          </div>
        </div>
        <div className="flex gap-2 preview-actions">
          <button className="btn btn-outline flex items-center gap-2" onClick={copyToClipboard}>
            Copy
          </button>
          <button className="btn btn-primary flex items-center gap-2" style={{ width: 'auto' }} onClick={downloadContent}>
            <DownloadIcon /> Download
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 p-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <button
          className={`tab ${mode === 'markdown' ? 'active' : ''}`}
          onClick={() => setMode('markdown')}
          style={{ flex: 'none', padding: '4px 12px' }}
        >
          Markdown
        </button>
        <button
          className={`tab ${mode === 'html' ? 'active' : ''}`}
          onClick={() => setMode('html')}
          style={{ flex: 'none', padding: '4px 12px' }}
        >
          HTML
        </button>
      </div>

      {/* Content */}
      <div className="preview-body">
        {mode === 'markdown' ? (
          <div style={{ 
            fontFamily: 'monospace', 
            fontSize: '13px', 
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-primary)'
          }}>
            {content}
          </div>
        ) : (
          <div className="chat-bubble ai" style={{ maxWidth: '100%' }}>
            <div className="role-label">HTML Preview</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Use Download to save as HTML file
            </div>
          </div>
        )}

        {/* Show chat bubble preview for markdown mode */}
        {mode === 'markdown' && conversation && conversation.messages.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid var(--border-light)', margin: '16px 0' }} />
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Chat Preview:
            </div>
            {conversation.messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}
              >
                <div className="role-label">
                  {msg.role === 'user' ? 'You' : platformName}
                </div>
                <p>{msg.content}</p>
                {msg.codeBlocks && msg.codeBlocks.map((block, i) => (
                  <pre key={i}><code>{block.code}</code></pre>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
