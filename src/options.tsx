/**
 * Options Page Component
 * Extension settings and configuration
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ExtensionSettings, ExportFormat } from './lib/types'

const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultFormat: 'markdown',
  includeMetadata: true,
  includeCodeBlocks: true,
  includeImages: true,
  theme: 'light',
  filenamePattern: '{date}-{title}'
}

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
        setSettings(result.settings)
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

  return (
    <div className="options-page">
      <header className="options-header">
        <h1>AI Chat Exporter Settings</h1>
      </header>

      <main className="options-content">
        <section className="settings-section">
          <h2>Export Settings</h2>
          
          <div className="setting-group">
            <label htmlFor="defaultFormat">Default Export Format</label>
            <select
              id="defaultFormat"
              value={settings.defaultFormat}
              onChange={(e) => updateSetting('defaultFormat', e.target.value as ExportFormat)}
            >
              <option value="markdown">Markdown</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="includeMetadata">
              <input
                type="checkbox"
                id="includeMetadata"
                checked={settings.includeMetadata}
                onChange={(e) => updateSetting('includeMetadata', e.target.checked)}
              />
              Include Metadata
            </label>
            <p className="setting-description">
              Add title, timestamp, and other information to exports
            </p>
          </div>

          <div className="setting-group">
            <label htmlFor="includeCodeBlocks">
              <input
                type="checkbox"
                id="includeCodeBlocks"
                checked={settings.includeCodeBlocks}
                onChange={(e) => updateSetting('includeCodeBlocks', e.target.checked)}
              />
              Include Code Blocks
            </label>
            <p className="setting-description">
              Preserve formatted code blocks with syntax highlighting
            </p>
          </div>

          <div className="setting-group">
            <label htmlFor="includeImages">
              <input
                type="checkbox"
                id="includeImages"
                checked={settings.includeImages}
                onChange={(e) => updateSetting('includeImages', e.target.checked)}
              />
              Include Images
            </label>
            <p className="setting-description">
              Embed or reference images from conversations
            </p>
          </div>
        </section>

        <section className="settings-section">
          <h2>Appearance</h2>
          
          <div className="setting-group">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) => updateSetting('theme', e.target.value as 'light' | 'dark')}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </section>

        <section className="settings-section about">
          <h2>About</h2>
          <p className="version">Version 1.0.0</p>
          <p className="description">
            AI Chat Exporter helps you save and archive conversations from
            ChatGPT and Google Gemini. Export to PDF or Markdown format.
          </p>
          <p className="license">
            Licensed under the MIT License
          </p>
          <p className="disclaimer">
            This extension is not affiliated with or endorsed by OpenAI or Google.
            Users are responsible for complying with the terms of service of
            these platforms.
          </p>
        </section>
      </main>

      {saved && (
        <div className="save-notification">
          Settings saved!
        </div>
      )}
    </div>
  )
}
