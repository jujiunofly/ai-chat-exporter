/**
 * Preview Page Component
 * Polished document preview with rendered chat bubbles and raw markdown view
 */

import React, { useState, useEffect } from 'react'
import '../styles/popup.css'
import '../styles/print.css'
import type { Conversation, ChatMessage } from '../lib/types'
import { conversationToMarkdown } from '../lib/export-markdown'
import { t, type Locale } from '../lib/i18n'

type PreviewMode = 'rendered' | 'markdown'

/** Inline SVG Icons */
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

/** Sun icon (light mode) */
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
  </svg>
)

/** Moon icon (dark mode) */
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
)

/**
 * Render a single message as a chat bubble
 */
function MessageBubble({ msg, platformName }: { msg: ChatMessage; platformName: string }) {
  const isUser = msg.role === 'user'
  const content = msg.content

  // Split content into paragraphs on double newlines
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())

  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'ai'}`}>
      <div className="role-label">
        {isUser ? 'You' : platformName}
      </div>

      {/* Text paragraphs */}
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: '8px 0' }}>
          {p}
        </p>
      ))}

      {/* Code blocks */}
      {msg.codeBlocks?.map((block, i) => (
        <pre key={`code-${i}`}>
          <code>{block.code}</code>
        </pre>
      ))}

      {/* Image attachments */}
      {msg.attachments
        ?.filter(a => a.type === 'image')
        .map((att, i) => (
          <img
            key={`img-${i}`}
            src={att.url}
            alt={att.name || 'Image'}
            style={{
              maxWidth: '100%',
              borderRadius: '8px',
              marginTop: '8px',
              display: 'block'
            }}
          />
        ))}
    </div>
  )
}

/**
 * Preview page for exported conversations with polished document layout
 */
export default function Preview() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [mode, setMode] = useState<PreviewMode>('rendered')
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [locale, setLocale] = useState<Locale>('en')
  const [feedback, setFeedback] = useState<string | null>(null)

  const T = (key: string) => t(key, locale)

  // Load settings (theme + locale) from storage
  useEffect(() => {
    chrome.storage.local.get('settings').then(result => {
      const s = result.settings as { theme?: 'light' | 'dark'; locale?: Locale } | undefined
      if (s?.theme) {
        setTheme(s.theme)
        document.documentElement.setAttribute('data-theme', s.theme)
      }
      if (s?.locale) setLocale(s.locale)
    }).catch(() => {})
  }, [])

  // Load conversation from URL params or storage
  useEffect(() => {
    loadConversation()
  }, [])

  // Regenerate markdown content when conversation changes
  useEffect(() => {
    if (conversation) {
      generateMarkdown()
    }
  }, [conversation])

  /**
   * Load conversation data
   */
  const loadConversation = async () => {
    try {
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
    } catch (_err) {
      setError('Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Generate markdown content (used by both modes for copy/download)
   */
  const generateMarkdown = () => {
    if (!conversation) return
    setMarkdownContent(
      conversationToMarkdown(conversation, {
        format: 'markdown',
        includeMetadata: true,
        includeCodeBlocks: true,
        includeImages: true
      })
    )
  }

  /**
   * Copy markdown content to clipboard
   */
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent)
      setFeedback('Copied!')
      setTimeout(() => setFeedback(null), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = markdownContent
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setFeedback('Copied!')
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  /**
   * Download markdown content as file
   */
  const downloadContent = () => {
    const filename = `${conversation?.title || 'conversation'}.md`
    const blob = new Blob([markdownContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setFeedback('Downloaded!')
    setTimeout(() => setFeedback(null), 2000)
  }

  if (loading) {
    return (
      <div className="preview-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
          <span className="spinner" style={{ borderTopColor: 'var(--primary)', width: '24px', height: '24px' }}></span>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{T('Loading preview...')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="preview-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style={{ fontWeight: 600, color: 'var(--error)' }}>{error}</p>
        </div>
      </div>
    )
  }

  const platformName = conversation?.platform === 'chatgpt'
    ? 'ChatGPT'
    : conversation?.platform === 'gemini'
    ? 'Gemini'
    : conversation?.platform === 'claude'
    ? 'Claude'
    : conversation?.platform === 'deepseek'
    ? 'DeepSeek'
    : conversation?.platform === 'grok'
    ? 'Grok'
    : 'Unknown'

  const createdDate = conversation?.createdAt
    ? new Date(conversation.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="preview-container">
      {/* Header with title, metadata, and action buttons */}
      <div className="preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conversation?.title || T('Preview')}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span>{createdDate}</span>
            <span>&bull;</span>
            <span style={{ fontWeight: 600 }}>{platformName}</span>
            <span>&bull;</span>
            <span>{t('{0} messages', locale, conversation?.messages.length || 0)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }} className="preview-actions">
          <button
            className="btn btn-icon"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              setTheme(next)
              document.documentElement.setAttribute('data-theme', next)
            }}
            title={T('Toggle Theme')}
            aria-label={T('Toggle Theme')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px' }}
            onClick={copyToClipboard}
          >
            {T('Copy')}
          </button>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px' }}
            onClick={downloadContent}
          >
            <DownloadIcon /> {T('Download')}
          </button>
        </div>
      </div>

      {/* Mode tab bar */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div className="tabs" style={{ display: 'inline-flex' }}>
          <button
            className={`tab ${mode === 'rendered' ? 'active' : ''}`}
            onClick={() => setMode('rendered')}
            style={{ padding: '8px 24px', flex: 'none' }}
          >
            {T('Rendered')}
          </button>
          <button
            className={`tab ${mode === 'markdown' ? 'active' : ''}`}
            onClick={() => setMode('markdown')}
            style={{ padding: '8px 24px', flex: 'none' }}
          >
            {T('Markdown')}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="preview-body">
        {mode === 'rendered' && conversation && (
          <div className="preview-message-list">
            {conversation.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} platformName={platformName} />
            ))}
          </div>
        )}

        {mode === 'markdown' && (
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            overflow: 'auto',
            maxHeight: '60vh',
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-primary)'
          }}>
            {markdownContent}
          </div>
        )}
      </div>

      {feedback && (
        <div className="save-notification" role="status" aria-live="polite">
          {T(feedback)}
        </div>
      )}
    </div>
  )
}
