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
  filenamePattern: '{date}-{title}',
  downloadFolder: 'default',
  customFolderName: 'AI Chat Exports',
  exportArtifacts: true,
  includeUploadedFiles: true
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
      return handleExportRequest(message.data as { conversation: Conversation; format: string }, sender)
    
    case 'DETECT_PLATFORM':
      return handleDetectPlatform(sender)
    
    case 'FETCH_CONVERSATION_LIST':
      return handleFetchConversationList(sender)

    case 'FETCH_ALL_CONVERSATIONS':
      return handleFetchAllConversations(sender)
    
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
    // Merge with defaults for any new fields
    return { data: { ...DEFAULT_SETTINGS, ...(result.settings || {}) } }
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
    } else if (url.hostname === 'claude.ai') {
      platform = 'claude'
    } else if (url.hostname === 'deepseek.com' || url.hostname === 'chat.deepseek.com') {
      platform = 'deepseek'
    } else if (url.hostname === 'grok.com' || url.hostname === 'www.grok.com') {
      platform = 'grok'
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
 * Handle fetching conversation list from content script (DOM-based)
 */
async function handleFetchConversationList(
  sender: chrome.runtime.MessageSender
): Promise<{ data?: unknown[]; error?: string }> {
  try {
    if (!sender.tab?.id) {
      return { error: 'No tab ID available' }
    }
    
    const response = await chrome.tabs.sendMessage(sender.tab.id, {
      type: 'FETCH_CONVERSATION_LIST'
    })
    
    return response
  } catch (error) {
    return { error: 'Failed to fetch conversation list' }
  }
}

/**
 * Handle fetching ALL conversations via API (forwarded to content script)
 */
async function handleFetchAllConversations(
  sender: chrome.runtime.MessageSender
): Promise<{ data?: unknown[]; error?: string }> {
  try {
    if (!sender.tab?.id) {
      return { error: 'No tab ID available' }
    }
    
    const response = await chrome.tabs.sendMessage(sender.tab.id, {
      type: 'FETCH_ALL_CONVERSATIONS'
    })
    
    return response
  } catch (error) {
    return { error: 'Failed to fetch all conversations' }
  }
}
// Clean up old exports via chrome.alarms (MV3 compatible)
chrome.alarms.create('cleanup-exports', { periodInMinutes: 60 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cleanup-exports') return
  try {
    const items = await chrome.storage.local.get(null) as unknown as Record<string, unknown>
    const now = Date.now()
    
    for (const [key, value] of Object.entries(items)) {
      if ((key.startsWith('export-') || key.startsWith('conversation-')) && typeof value === 'object' && value !== null) {
        const data = value as { timestamp?: number }
        if (data.timestamp && now - data.timestamp > 3600000) {
          await chrome.storage.local.remove(key)
        }
      }
    }
  } catch (error) {
    // Silently handle cleanup errors
  }
})
