/**
 * Background Service Worker
 * Handles messages between popup and content scripts
 */

import type { MessagePayload, Conversation, ExtensionSettings, BulkExportProgress } from './lib/types'

// Default settings
const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultFormat: 'markdown',
  includeMetadata: true,
  includeCodeBlocks: true,
  includeImages: true,
  theme: 'light',
  filenamePattern: '{date}-{title}'
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS })
  }
})

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener(
  (message: MessagePayload, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }))
    
    return true // Keep message channel open for async response
  }
)

/**
 * Handle incoming messages
 */
async function handleMessage(
  message: MessagePayload,
  sender: chrome.runtime.MessageSender
): Promise<{ data?: unknown; error?: string }> {
  switch (message.type) {
    case 'GET_SETTINGS':
      return handleGetSettings()
    
    case 'SETTINGS_UPDATED':
      return handleSettingsUpdated(message.data as ExtensionSettings)
    
    case 'EXPORT_REQUEST':
      return handleExportRequest(message.data, sender)
    
    case 'DETECT_PLATFORM':
      return handleDetectPlatform(sender)
    
    case 'FETCH_CONVERSATION_LIST':
      return handleFetchConversationList(sender)
    
    case 'BULK_EXPORT':
      return handleBulkExport(message.data, sender)
    
    default:
      return { error: `Unknown message type: ${message.type}` }
  }
}

/**
 * Get extension settings
 */
async function handleGetSettings(): Promise<{ data: ExtensionSettings }> {
  try {
    const result = await chrome.storage.local.get('settings')
    return { data: result.settings || DEFAULT_SETTINGS }
  } catch (error) {
    return { data: DEFAULT_SETTINGS }
  }
}

/**
 * Handle settings update
 */
async function handleSettingsUpdated(
  settings: ExtensionSettings
): Promise<{ data: boolean }> {
  try {
    await chrome.storage.local.set({ settings })
    return { data: true }
  } catch (error) {
    return { data: false }
  }
}

/**
 * Handle export request from popup
 */
async function handleExportRequest(
  data: { conversation: Conversation; format: string },
  sender: chrome.runtime.MessageSender
): Promise<{ data?: string; error?: string }> {
  try {
    if (!data.conversation) {
      return { error: 'No conversation data provided' }
    }
    
    // Store conversation for download
    const conversationId = data.conversation.id
    await chrome.storage.local.set({
      [`export-${conversationId}`]: data.conversation
    })
    
    return { data: conversationId }
  } catch (error) {
    return { error: 'Failed to process export request' }
  }
}

/**
 * Detect platform from sender tab
 */
async function handleDetectPlatform(
  sender: chrome.runtime.MessageSender
): Promise<{ data?: { platform: string; url: string }; error?: string }> {
  try {
    if (!sender.tab?.url) {
      return { error: 'No tab URL available' }
    }
    
    const url = new URL(sender.tab.url)
    let platform = 'unknown'
    
    if (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') {
      platform = 'chatgpt'
    } else if (url.hostname === 'gemini.google.com') {
      platform = 'gemini'
    }
    
    return {
      data: {
        platform,
        url: sender.tab.url
      }
    }
  } catch (error) {
    return { error: 'Failed to detect platform' }
  }
}

/**
 * Handle fetching conversation list from content script
 */
async function handleFetchConversationList(
  sender: chrome.runtime.MessageSender
): Promise<{ data?: unknown[]; error?: string }> {
  try {
    if (!sender.tab?.id) {
      return { error: 'No tab ID available' }
    }
    
    // Forward request to content script
    const response = await chrome.tabs.sendMessage(sender.tab.id, {
      type: 'FETCH_CONVERSATION_LIST'
    })
    
    return response
  } catch (error) {
    return { error: 'Failed to fetch conversation list' }
  }
}

/**
 * Handle bulk export request
 */
async function handleBulkExport(
  data: { items: Array<{ id: string; title: string; url: string; platform: string }>; options: { format: string; includeMetadata: boolean; includeCodeBlocks: boolean; includeImages: boolean; filenamePattern?: string } },
  sender: chrome.runtime.MessageSender
): Promise<{ data?: BulkExportProgress; error?: string }> {
  try {
    if (!data.items || data.items.length === 0) {
      return { error: 'No items to export' }
    }
    
    const progress: BulkExportProgress = {
      total: data.items.length,
      completed: 0,
      failed: 0,
      current: '',
      status: 'exporting'
    }
    
    // Store progress for tracking
    await chrome.storage.local.set({ bulkExportProgress: progress })
    
    // Broadcast progress updates
    chrome.runtime.sendMessage({
      type: 'BULK_EXPORT_PROGRESS',
      data: progress
    })
    
    return { data: progress }
  } catch (error) {
    return { error: 'Failed to start bulk export' }
  }
}

// Handle download requests
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Let the extension handle the filename
  suggest()
})

// Clean up old exports periodically
setInterval(async () => {
  try {
    const items = await chrome.storage.local.get(null)
    const now = Date.now()
    
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('export-') && typeof value === 'object' && value !== null) {
        // Clean up exports older than 1 hour
        const exportData = value as { timestamp?: number }
        if (exportData.timestamp && now - exportData.timestamp > 3600000) {
          await chrome.storage.local.remove(key)
        }
      }
    }
  } catch (error) {
    // Silently handle cleanup errors
  }
}, 3600000) // Run every hour
