/**
 * Popup Component
 * Main extension popup UI
 */

import React, { useState, useEffect, useCallback } from 'react'
import { ExportButton } from './components/ExportButton'
import { FormatSelector } from './components/FormatSelector'
import { conversationToMarkdown, generateMarkdownFilename } from './lib/export-markdown'
import { exportToPdf } from './lib/export-pdf'
import type { Conversation, ExportFormat, ExtensionSettings, DEFAULT_SETTINGS } from './lib/types'

/**
 * Main Popup component
 */
export default function Popup() {
  const [platform, setPlatform] = useState<string | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  // Detect platform and conversation when tab changes
  useEffect(() => {
    detectPlatformAndConversation()
    
    // Listen for tab updates
    const handleTabUpdate = () => {
      detectPlatformAndConversation()
    }
    
    chrome.tabs.onUpdated.addListener(handleTabUpdate)
    return () => chrome.tabs.onUpdated.removeListener(handleTabUpdate)
  }, [])

  /**
   * Load extension settings
   */
  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get('settings')
      if (result.settings) {
        setSettings(result.settings)
        setFormat(result.settings.defaultFormat)
      }
    } catch (err) {
      // Use defaults
    }
  }

  /**
   * Detect current platform and parse conversation
   */
  const detectPlatformAndConversation = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url) return

      const url = new URL(tab.url)
      
      // Determine platform from URL
      if (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') {
        setPlatform('chatgpt')
      } else if (url.hostname === 'gemini.google.com') {
        setPlatform('gemini')
      } else {
        setPlatform(null)
        return
      }

      // Request conversation data from content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'PARSE_CONVERSATION'
      })

      if (response?.data) {
        setConversation(response.data)
        setError(null)
      } else {
        setConversation(null)
      }
    } catch (err) {
      setPlatform(null)
      setConversation(null)
    }
  }

  /**
   * Handle export action
   */
  const handleExport = useCallback(async () => {
    if (!conversation) {
      setError('No conversation to export')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const exportOptions = {
        format,
        includeMetadata: settings?.includeMetadata ?? true,
        includeCodeBlocks: settings?.includeCodeBlocks ?? true,
        includeImages: settings?.includeImages ?? true
      }

      if (format === 'markdown') {
        const markdown = conversationToMarkdown(conversation, exportOptions)
        const filename = generateMarkdownFilename(conversation)
        
        // Create and download file
        const blob = new Blob([markdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        
        await chrome.downloads.download({
          url,
          filename,
          saveAs: true
        })
        
        URL.revokeObjectURL(url)
        setSuccess('Exported as Markdown!')
      } else {
        await exportToPdf(conversation, exportOptions)
        setSuccess('PDF export opened in new tab')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }, [conversation, format, settings])

  /**
   * Open options page
   */
  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <h1>AI Chat Exporter</h1>
        {platform && (
          <span className={`platform-badge ${platform}`}>
            {platform === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
          </span>
        )}
      </header>

      <main className="popup-content">
        {!platform ? (
          <div className="empty-state">
            <p>Navigate to ChatGPT or Gemini to export conversations.</p>
          </div>
        ) : !conversation ? (
          <div className="empty-state">
            <p>No conversation detected on this page.</p>
            <p className="hint">Make sure you're viewing a conversation.</p>
          </div>
        ) : (
          <>
            <div className="conversation-info">
              <h2>{conversation.title || 'Untitled Conversation'}</h2>
              <p>{conversation.messages.length} messages</p>
            </div>

            <FormatSelector
              value={format}
              onChange={setFormat}
              disabled={loading}
            />

            <ExportButton
              onClick={handleExport}
              disabled={!conversation}
              loading={loading}
              format={format}
            />

            {error && (
              <div className="message error" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="message success">
                {success}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="popup-footer">
        <button 
          className="options-button"
          onClick={openOptions}
          aria-label="Open settings"
        >
          ⚙️ Settings
        </button>
      </footer>
    </div>
  )
}
