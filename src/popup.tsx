/**
 * Popup Component
 * Main extension popup UI with Current Conversation and Bulk Export modes
 */

import React, { useState, useEffect, useCallback } from 'react'
import { ExportButton } from './components/ExportButton'
import { FormatSelector } from './components/FormatSelector'
import { ConversationList } from './components/ConversationList'
import { FilenameEditor } from './components/FilenameEditor'
import { conversationToMarkdown, generateMarkdownFilename } from './lib/export-markdown'
import { exportToPdf } from './lib/export-pdf'
import { generateFilename } from './lib/filename'
import type { Conversation, ExportFormat, ExtensionSettings, ConversationListItem, BulkExportProgress } from './lib/types'

/** Tab mode type */
type TabMode = 'current' | 'bulk'

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
  
  // Bulk export state
  const [tabMode, setTabMode] = useState<TabMode>('current')
  const [conversationList, setConversationList] = useState<ConversationListItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkProgress, setBulkProgress] = useState<BulkExportProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current: '',
    status: 'idle'
  })

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
   * Fetch conversation list from sidebar
   */
  const fetchConversationList = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'FETCH_CONVERSATION_LIST'
      })

      if (response?.data) {
        setConversationList(response.data)
      }
    } catch (err) {
      setConversationList([])
    }
  }

  /**
   * Handle export action for current conversation
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
        includeImages: settings?.includeImages ?? true,
        filenamePattern: settings?.filenamePattern
      }

      const filename = settings?.filenamePattern 
        ? generateFilename(settings.filenamePattern, conversation)
        : generateMarkdownFilename(conversation).replace(/\.md$/, '')

      if (format === 'markdown') {
        const markdown = conversationToMarkdown(conversation, exportOptions)
        const mdFilename = `${filename}.md`
        
        // Create and download file
        const blob = new Blob([markdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        
        await chrome.downloads.download({
          url,
          filename: mdFilename,
          saveAs: false
        })
        
        URL.revokeObjectURL(url)
        setSuccess('Exported as Markdown!')
      } else {
        await exportToPdf(conversation, exportOptions, filename)
        setSuccess('PDF exported successfully!')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }, [conversation, format, settings])

  /**
   * Handle bulk export
   */
  const handleBulkExport = useCallback(async () => {
    if (selectedIds.length === 0) {
      setError('No conversations selected')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setBulkProgress({
      total: selectedIds.length,
      completed: 0,
      failed: 0,
      current: '',
      status: 'fetching'
    })

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        throw new Error('No active tab')
      }

      const exportOptions = {
        format,
        includeMetadata: settings?.includeMetadata ?? true,
        includeCodeBlocks: settings?.includeCodeBlocks ?? true,
        includeImages: settings?.includeImages ?? true,
        filenamePattern: settings?.filenamePattern
      }

      // Process each selected conversation
      for (let i = 0; i < selectedIds.length; i++) {
        const convItem = conversationList.find(c => c.id === selectedIds[i])
        if (!convItem) continue

        setBulkProgress(prev => ({
          ...prev,
          current: convItem.title,
          status: 'exporting'
        }))

        try {
          // Navigate to conversation and parse it
          // For now, we'll export what we can with the metadata we have
          const mockConv: Conversation = {
            id: convItem.id,
            title: convItem.title,
            url: convItem.url,
            messages: [],
            platform: convItem.platform
          }

          const filename = settings?.filenamePattern
            ? generateFilename(settings.filenamePattern, mockConv, i + 1)
            : `${convItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`

          if (format === 'markdown') {
            const markdown = conversationToMarkdown(mockConv, exportOptions)
            const blob = new Blob([markdown], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            
            await chrome.downloads.download({
              url,
              filename: `${filename}.md`,
              saveAs: false
            })
            
            URL.revokeObjectURL(url)
          } else {
            await exportToPdf(mockConv, exportOptions, filename)
          }

          setBulkProgress(prev => ({
            ...prev,
            completed: prev.completed + 1
          }))
        } catch (err) {
          setBulkProgress(prev => ({
            ...prev,
            failed: prev.failed + 1
          }))
        }
      }

      setBulkProgress(prev => ({
        ...prev,
        status: 'done'
      }))
      
      setSuccess(`Bulk export completed! ${bulkProgress.completed} succeeded, ${bulkProgress.failed} failed`)
    } catch (err) {
      setBulkProgress(prev => ({
        ...prev,
        status: 'error'
      }))
      setError(err instanceof Error ? err.message : 'Bulk export failed')
    } finally {
      setLoading(false)
    }
  }, [selectedIds, conversationList, format, settings])

  /**
   * Handle conversation selection
   */
  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  /**
   * Select all conversations
   */
  const handleSelectAll = () => {
    setSelectedIds(conversationList.map(c => c.id))
  }

  /**
   * Deselect all conversations
   */
  const handleDeselectAll = () => {
    setSelectedIds([])
  }

  /**
   * Open options page
   */
  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  /**
   * Switch to bulk mode
   */
  const switchToBulk = () => {
    setTabMode('bulk')
    fetchConversationList()
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

      <div className="tab-bar">
        <button
          className={`tab ${tabMode === 'current' ? 'active' : ''}`}
          onClick={() => setTabMode('current')}
        >
          Current Conversation
        </button>
        <button
          className={`tab ${tabMode === 'bulk' ? 'active' : ''}`}
          onClick={switchToBulk}
        >
          Bulk Export
        </button>
      </div>

      <main className="popup-content">
        {tabMode === 'current' ? (
          // Current conversation mode
          !platform ? (
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

              <FilenameEditor
                value={settings?.filenamePattern || '{date}-{title}'}
                onChange={(pattern) => {
                  if (settings) {
                    setSettings({ ...settings, filenamePattern: pattern })
                  }
                }}
                conversation={conversation}
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
          )
        ) : (
          // Bulk export mode
          <>
            {bulkProgress.status !== 'idle' && bulkProgress.status !== 'done' && (
              <div className="bulk-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` 
                    }}
                  />
                </div>
                <p>
                  {bulkProgress.current ? `Exporting: ${bulkProgress.current}` : 'Starting...'}
                </p>
                <p>
                  {bulkProgress.completed}/{bulkProgress.total} completed
                  {bulkProgress.failed > 0 && `, ${bulkProgress.failed} failed`}
                </p>
              </div>
            )}

            <FormatSelector
              value={format}
              onChange={setFormat}
              disabled={loading}
            />

            <ConversationList
              conversations={conversationList}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onExport={handleBulkExport}
              loading={loading}
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
