/**
 * Popup Component
 * Gemini-designed UI with tab switcher, platform badge, and conversation list
 */

import React, { useState, useEffect, useCallback } from 'react'
import './styles/popup.css'
import { ExportButton } from './components/ExportButton'
import { FormatSelector } from './components/FormatSelector'
import { ConversationList } from './components/ConversationList'
import { FilenameEditor } from './components/FilenameEditor'
import { conversationToMarkdown, generateMarkdownFilename } from './lib/export-markdown'
import { exportToPdf } from './lib/export-pdf'
import { generateFilename } from './lib/filename'
import type { 
  Conversation, ExportFormat, ExtensionSettings, ConversationListItem, 
  BulkExportProgress, DownloadFolderOption 
} from './lib/types'

/** Tab mode type */
type TabMode = 'current' | 'bulk'

/** Inline SVG Icons */
const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
)

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
)

const AiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
)

/**
 * Detect platform from URL
 */
function detectPlatformFromUrl(url: string): 'chatgpt' | 'gemini' | 'claude' | 'deepseek' | 'grok' | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com') {
      return 'chatgpt'
    }
    if (parsed.hostname === 'gemini.google.com') {
      return 'gemini'
    }
    if (parsed.hostname === 'claude.ai') {
      return 'claude'
    }
    if (parsed.hostname === 'deepseek.com' || parsed.hostname === 'chat.deepseek.com') {
      return 'deepseek'
    }
    if (parsed.hostname === 'grok.com' || parsed.hostname === 'www.grok.com') {
      return 'grok'
    }
  } catch {}
  return null
}

/**
 * Build download filename with folder prefix based on settings
 */
function buildDownloadFilename(
  baseFilename: string, 
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek' | 'grok',
  extension: string,
  downloadFolder: DownloadFolderOption,
  customFolderName: string
): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  const filename = baseFilename.endsWith(ext) ? baseFilename : `${baseFilename}${ext}`
  
  switch (downloadFolder) {
    case 'by-platform': {
      const folderMap: Record<string, string> = {
        chatgpt: 'ChatGPT',
        gemini: 'Gemini',
        claude: 'Claude',
        deepseek: 'DeepSeek',
        grok: 'Grok'
      }
      const folder = folderMap[platform] || platform
      return `${folder}/${filename}`
    }
    case 'custom': {
      const safeFolder = customFolderName
        .replace(/[\\:*?"<>|]/g, '_')
        .replace(/^\\.\\./, '')
        .replace(/^-|-$/g, '')
        .substring(0, 100) || 'AI Chat Exports'
      return `${safeFolder}/${filename}`
    }
    default:
      return filename
  }
}

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
  const [bulkLoading, setBulkLoading] = useState(false)
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

  // Detect platform and conversation when tab changes (debounced)
  useEffect(() => {
    detectPlatformAndConversation()
    
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleTabUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => detectPlatformAndConversation(), 300)
    }
    
    chrome.tabs.onUpdated.addListener(handleTabUpdate)
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      chrome.tabs.onUpdated.removeListener(handleTabUpdate)
    }
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

      const detected = detectPlatformFromUrl(tab.url)
      setPlatform(detected)
      
      if (!detected) return

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
   * Fetch conversation list via API (all conversations, not just sidebar)
   */
  const fetchConversationList = async () => {
    setBulkLoading(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return

      // Try FETCH_ALL_CONVERSATIONS first (API-based, gets all)
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'FETCH_ALL_CONVERSATIONS'
        })
        if (response?.data && response.data.length > 0) {
          setConversationList(response.data)
          setBulkLoading(false)
          return
        }
      } catch (e) {
        // Fall back to DOM-based list
      }

      // Fallback: DOM-based sidebar list
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'FETCH_CONVERSATION_LIST'
      })

      if (response?.data) {
        setConversationList(response.data)
      }
    } catch (err) {
      setConversationList([])
    } finally {
      setBulkLoading(false)
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

      const baseFilename = settings?.filenamePattern 
        ? generateFilename(settings.filenamePattern, conversation)
        : generateMarkdownFilename(conversation).replace(/\.md$/, '')

      const downloadFolder = settings?.downloadFolder ?? 'default'
      const customFolderName = settings?.customFolderName ?? 'AI Chat Exports'

      const clearSuccess = () => setTimeout(() => setSuccess(null), 3000)

      if (format === 'markdown') {
        const markdown = conversationToMarkdown(conversation, exportOptions)
        const filename = buildDownloadFilename(baseFilename, conversation.platform, '.md', downloadFolder, customFolderName)
        
        // Create and download file
        const blob = new Blob([markdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        
        await chrome.downloads.download({
          url,
          filename,
          saveAs: false
        })
        
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setSuccess('Exported as Markdown!')
        clearSuccess()
      } else {
        const filename = buildDownloadFilename(baseFilename, conversation.platform, '.pdf', downloadFolder, customFolderName)
        await exportToPdf(conversation, exportOptions, filename)
        setSuccess('PDF exported successfully!')
        clearSuccess()
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

      const downloadFolder = settings?.downloadFolder ?? 'default'
      const customFolderName = settings?.customFolderName ?? 'AI Chat Exports'

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
          // Fetch real conversation data from the API
          let conv: Conversation | null = null
          try {
            const response = await chrome.tabs.sendMessage(tab.id, {
              type: 'FETCH_CONVERSATION_DETAIL',
              data: { id: convItem.id }
            })
            conv = response?.data || null
          } catch {
            // If fetch fails, create a minimal conversation with metadata
          }

          // Fallback: if we couldn't fetch details, use list item data
          if (!conv) {
            conv = {
              id: convItem.id,
              title: convItem.title,
              url: convItem.url,
              messages: [],
              platform: convItem.platform,
              createdAt: convItem.createdAt
            }
          }

          const baseFilename = settings?.filenamePattern
            ? generateFilename(settings.filenamePattern, conv, i + 1)
            : `${conv.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`

          if (format === 'markdown') {
            const markdown = conversationToMarkdown(conv, exportOptions)
            const filename = buildDownloadFilename(baseFilename, convItem.platform, '.md', downloadFolder, customFolderName)
            const blob = new Blob([markdown], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            
            await chrome.downloads.download({
              url,
              filename,
              saveAs: false
            })
            
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          } else {
            const filename = buildDownloadFilename(baseFilename, convItem.platform, '.pdf', downloadFolder, customFolderName)
            await exportToPdf(conv, exportOptions, filename)
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
      
      setSuccess(`Bulk export completed!`)
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
   * Select all / deselect all
   */
  const handleToggleAll = () => {
    if (selectedIds.length === conversationList.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(conversationList.map(c => c.id))
    }
  }

  /**
   * Open options page
   */
  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  /**
   * Switch to bulk mode and fetch conversations
   */
  const switchToBulk = () => {
    setTabMode('bulk')
    if (conversationList.length === 0) {
      fetchConversationList()
    }
  }

  const platformLabel = platform === 'chatgpt' ? 'ChatGPT' : platform === 'gemini' ? 'Gemini' : platform === 'claude' ? 'Claude' : platform === 'deepseek' ? 'DeepSeek' : platform === 'grok' ? 'Grok' : null
  const allSelected = conversationList.length > 0 && selectedIds.length === conversationList.length

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <h1>AI Chat Exporter</h1>
        <button className="btn-icon" onClick={openOptions} title="Settings">
          <SettingsIcon />
        </button>
      </div>
      
      {/* Body */}
      <div className="popup-body">
        {/* Tabs */}
        <div className="tabs">
          <div 
            className={`tab ${tabMode === 'current' ? 'active' : ''}`} 
            onClick={() => setTabMode('current')}
          >
            Current
          </div>
          <div 
            className={`tab ${tabMode === 'bulk' ? 'active' : ''}`} 
            onClick={switchToBulk}
          >
            Bulk
          </div>
        </div>

        {/* Current Tab */}
        {tabMode === 'current' && (
          <div className="tab-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!platform ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                <p>Navigate to ChatGPT, Gemini, Claude, DeepSeek, or Grok to export conversations.</p>
              </div>
            ) : !conversation ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                <p>No conversation detected on this page.</p>
                <p className="text-xs" style={{ marginTop: '8px', color: 'var(--text-tertiary)' }}>
                  Make sure you're viewing a conversation.
                </p>
              </div>
            ) : (
              <>
                {/* Platform badge + Title + Message count */}
                <div className="conversation-info">
                  <div className={`badge ${platform}`}>
                    <AiIcon /> {platformLabel}
                  </div>
                  <h2>{conversation.title || 'Untitled Conversation'}</h2>
                  <span className="msg-count">{conversation.messages.length} messages</span>
                </div>

                {/* Format Selector */}
                <div className="flex-col gap-2">
                  <span className="section-label">Export Format</span>
                  <FormatSelector value={format} onChange={setFormat} disabled={loading} />
                </div>

                {/* Filename Editor */}
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

                {/* Export Button + Status */}
                <div style={{ marginTop: 'auto' }}>
                  {error && (
                    <div className="message error" role="alert" style={{ marginBottom: '8px' }}>
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="message success" style={{ marginBottom: '8px' }}>
                      {success}
                    </div>
                  )}
                  <ExportButton
                    onClick={handleExport}
                    disabled={!conversation}
                    loading={loading}
                    format={format}
                    isSuccess={!!success}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Bulk Tab */}
        {tabMode === 'bulk' && (
          <div className="tab-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Platform badge + Refresh */}
            <div className="flex justify-between items-center">
              <div className={`badge ${platform || ''}`}>
                <AiIcon /> {platformLabel || 'Unknown'}
              </div>
              <button 
                className="btn-icon flex items-center gap-1" 
                onClick={fetchConversationList}
                disabled={bulkLoading}
              >
                <RefreshIcon /> 
                <span className="text-xs">Refresh</span>
              </button>
            </div>
            
            {/* Conversation count */}
            <span className="text-xs text-muted">
              {bulkLoading ? 'Loading...' : `${conversationList.length} conversations found`}
            </span>

            {/* Bulk progress */}
            {bulkProgress.status !== 'idle' && bulkProgress.status !== 'done' && (
              <div className="flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span>Exporting {bulkProgress.current}...</span>
                  <span>{Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%</span>
                </div>
                <div className="progress-bg">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Select All */}
            {conversationList.length > 0 && (
              <label className="checkbox-wrapper p-2" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                <input 
                  type="checkbox" 
                  className="checkbox" 
                  checked={allSelected} 
                  onChange={handleToggleAll} 
                />
                <span className="text-sm font-medium">Select All / Deselect</span>
              </label>
            )}

            {/* Conversation List */}
            <ConversationList
              conversations={conversationList}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleToggleAll}
              onDeselectAll={() => setSelectedIds([])}
              onExport={handleBulkExport}
              loading={loading}
            />

            {/* Selected count + Format + Export */}
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Format:</span>
                <select 
                  className="select"
                  value={format} 
                  onChange={e => setFormat(e.target.value as ExportFormat)}
                >
                  <option value="pdf">PDF</option>
                  <option value="markdown">MD</option>
                </select>
              </div>
            </div>

            {/* Export Button */}
            <div style={{ marginTop: 'auto' }}>
              {error && (
                <div className="message error" role="alert" style={{ marginBottom: '8px' }}>
                  {error}
                </div>
              )}
              {success && (
                <div className="message success" style={{ marginBottom: '8px' }}>
                  {success}
                </div>
              )}
              <ExportButton
                onClick={handleBulkExport}
                disabled={selectedIds.length === 0}
                loading={loading}
                format={format}
                text={`Export ${selectedIds.length} Selected`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
