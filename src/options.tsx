/**
 * Options Page Component
 * Gemini-inspired settings layout with Export Configuration, Filename Pattern, and About sections
 */

import React, { useState, useEffect, useCallback } from 'react'
import './styles/options.css'
import type { ExtensionSettings, ExportFormat, DownloadFolderOption } from './lib/types'
import { DEFAULT_SETTINGS } from './lib/types'

/** Inline SVG Icon */
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
)

/**
 * Options page component
 */
export default function Options() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  /**
   * Load settings from storage
   */
  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get('settings')
      if (result.settings) {
        // Merge with defaults for any new fields
        setSettings({ ...DEFAULT_SETTINGS, ...result.settings })
      }
    } catch (err) {
      // Use defaults
    }
  }

  /**
   * Save settings to storage
   */
  const saveSettings = useCallback(async (newSettings: ExtensionSettings) => {
    setSettings(newSettings)
    try {
      await chrome.storage.local.set({ settings: newSettings })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      // Handle error
    }
  }, [])

  /**
   * Update a single setting
   */
  const updateSetting = <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    saveSettings({ ...settings, [key]: value })
  }

  const previewFilename = settings.filenamePattern
    .replace(/\{date\}/g, new Date().toISOString().split('T')[0])
    .replace(/\{title\}/g, 'my-chat')
    .replace(/\{platform\}/g, 'chatgpt')
    .replace(/\{index\}/g, '001')
    .replace(/\{msgcount\}/g, '24')
    .replace(/\{datetime\}/g, new Date().toISOString().replace(/[:.]/g, '').split('T').join('T').substring(0, 19))

  return (
    <div className="options-container">
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
        <SettingsIcon /> Settings
      </h1>

      {/* Export Configuration */}
      <div className="options-section">
        <h2>Export Configuration</h2>
        
        <div className="options-row">
          <span className="option-label">Default Format</span>
          <select 
            className="input" 
            style={{ width: '150px' }}
            value={settings.defaultFormat}
            onChange={(e) => updateSetting('defaultFormat', e.target.value as ExportFormat)}
          >
            <option value="pdf">PDF Document</option>
            <option value="markdown">Markdown File</option>
          </select>
        </div>

        <div className="options-row">
          <div>
            <div className="option-label">Include Metadata</div>
            <div className="option-description">Add date, title, and platform at the top of the file</div>
          </div>
          <input 
            type="checkbox" 
            className="toggle" 
            checked={settings.includeMetadata}
            onChange={(e) => updateSetting('includeMetadata', e.target.checked)}
          />
        </div>

        <div className="options-row">
          <div>
            <div className="option-label">Include Code Blocks</div>
            <div className="option-description">Export syntax-highlighted code blocks</div>
          </div>
          <input 
            type="checkbox" 
            className="toggle" 
            checked={settings.includeCodeBlocks}
            onChange={(e) => updateSetting('includeCodeBlocks', e.target.checked)}
          />
        </div>

        <div className="options-row">
          <div>
            <div className="option-label">Include Images</div>
            <div className="option-description">Download and embed images generated in chat</div>
          </div>
          <input 
            type="checkbox" 
            className="toggle" 
            checked={settings.includeImages}
            onChange={(e) => updateSetting('includeImages', e.target.checked)}
          />
        </div>

        <div className="options-row">
          <div>
            <div className="option-label">Download Folder</div>
            <div className="option-description">Organize exports into subfolders</div>
          </div>
          <select 
            className="input" 
            style={{ width: '150px' }}
            value={settings.downloadFolder}
            onChange={(e) => updateSetting('downloadFolder', e.target.value as DownloadFolderOption)}
          >
            <option value="default">Default (no folder)</option>
            <option value="by-platform">By Platform</option>
            <option value="custom">Custom Folder</option>
          </select>
        </div>

        {settings.downloadFolder === 'custom' && (
          <div className="options-row">
            <div>
              <div className="option-label">Custom Folder Name</div>
              <div className="option-description">Name of the folder for exports</div>
            </div>
            <input 
              className="input" 
              style={{ width: '150px' }}
              value={settings.customFolderName}
              onChange={(e) => updateSetting('customFolderName', e.target.value)}
              placeholder="AI Chat Exports"
            />
          </div>
        )}
      </div>

      {/* Filename Pattern */}
      <div className="options-section">
        <h2>Filename Pattern</h2>
        <div className="flex-col gap-4">
          <div className="flex items-center gap-4">
            <input 
              className="input flex-1" 
              value={settings.filenamePattern}
              onChange={(e) => updateSetting('filenamePattern', e.target.value)}
              placeholder="{date}-{title}"
            />
            <button 
              className="btn btn-outline" 
              style={{ width: 'auto', whiteSpace: 'nowrap' }}
              onClick={() => updateSetting('filenamePattern', '{date}-{title}')}
            >
              Reset Default
            </button>
          </div>
          <div className="text-sm p-3" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace' }}>
            Preview: {previewFilename}.{settings.defaultFormat === 'pdf' ? 'pdf' : 'md'}
          </div>
        </div>
      </div>

      {/* About */}
      <div className="options-section">
        <h2>About</h2>
        <div className="flex-col gap-2 text-sm">
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>AI Chat Exporter v1.0.0</div>
          <div style={{ color: 'var(--text-secondary)' }}>MIT License &bull; Open Source</div>
          <div style={{ color: 'var(--text-secondary)' }}>GitHub: pinguarmy/ai-chat-exporter</div>
        </div>
      </div>

      {saved && (
        <div className="save-notification">
          Settings saved!
        </div>
      )}
    </div>
  )
}
