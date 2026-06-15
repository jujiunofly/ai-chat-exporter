/**
 * Options Page Component
 * Gemini-inspired settings layout with Export Configuration, Filename Pattern,
 * Scheduled Export, and About sections
 */

import React, { useState, useEffect, useCallback } from 'react'
import './styles/options.css'
import type {
  ExtensionSettings,
  ExportFormat,
  DownloadFolderOption,
  ScheduledExportSettings,
  ScheduledExportStatus,
  ExportablePlatform,
  ScheduleFrequency,
} from './lib/types'
import { DEFAULT_SETTINGS } from './lib/types'
import { getDefaultScheduledExportSettings } from './lib/scheduled-export'

/** Platform display names */
const PLATFORM_LABELS: Record<ExportablePlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  grok: 'Grok',
}

/** Frequency display labels */
const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  hourly: 'Hourly',
  every6h: 'Every 6 Hours',
  daily: 'Daily',
  weekly: 'Weekly',
}

/** Inline SVG Icon */
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0 1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
)

/**
 * Options page component
 */
export default function Options() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [scheduleSettings, setScheduleSettings] = useState<ScheduledExportSettings>(
    getDefaultScheduledExportSettings()
  )
  const [scheduleStatus, setScheduleStatus] = useState<ScheduledExportStatus | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
    loadScheduleSettings()
  }, [])

  // Poll status periodically
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await chrome.storage.local.get('scheduledExportStatus')
        setScheduleStatus(result.scheduledExportStatus || null)
      } catch {}
    }
    loadStatus()
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
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
   * Load scheduled export settings from storage
   */
  const loadScheduleSettings = async () => {
    try {
      const result = await chrome.storage.local.get('settings')
      if (result.settings?.scheduledExport) {
        setScheduleSettings(result.settings.scheduledExport)
      }
    } catch {}
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
   * Save scheduled export settings
   */
  const saveScheduleSettings = useCallback(async (newSchedule: ScheduledExportSettings) => {
    setScheduleSettings(newSchedule)
    const updated = { ...settings, scheduledExport: newSchedule }
    setSettings(updated)
    try {
      await chrome.storage.local.set({ settings: updated })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      // Handle error
    }
  }, [settings])

  /**
   * Update a single setting
   */
  const updateSetting = <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    saveSettings({ ...settings, [key]: value })
  }

  /**
   * Trigger manual scheduled export run
   */
  const triggerScheduledExport = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SCHEDULED_EXPORT_RUN' })
    } catch (err) {
      console.error('Failed to trigger scheduled export:', err)
    }
  }

  /**
   * Clear all exported history
   */
  const clearExportHistory = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SCHEDULED_EXPORT_CLEAR_HISTORY' })
    } catch (err) {
      console.error('Failed to clear export history:', err)
    }
  }

  const now = new Date()
  const previewFilename = settings.filenamePattern
    .replace(/\{date\}/g, now.toISOString().split('T')[0])
    .replace(/\{title\}/g, 'my-chat')
    .replace(/\{platform\}/g, 'chatgpt')
    .replace(/\{index\}/g, '001')
    .replace(/\{msgcount\}/g, '24')
    .replace(/\{datetime\}/g, now.toISOString().replace(/[:.]/g, '').split('T').join('T').substring(0, 19))
    .replace(/\{conv_date\}/g, '2026-06-08')
    .replace(/\{conv_datetime\}/g, '2026-06-08T093000')
    .replace(/\{end_date\}/g, now.toISOString().split('T')[0])

  const platformKeys = Object.keys(scheduleSettings.platforms) as ExportablePlatform[]

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

        <div className="options-row">
          <div>
            <div className="option-label">Export Artifacts</div>
            <div className="option-description">Save code artifacts and documents as separate files</div>
          </div>
          <input 
            type="checkbox" 
            className="toggle" 
            checked={settings.exportArtifacts}
            onChange={(e) => updateSetting('exportArtifacts', e.target.checked)}
          />
        </div>

        <div className="options-row">
          <div>
            <div className="option-label">Include Uploaded Files</div>
            <div className="option-description">Include references to uploaded files in exports</div>
          </div>
          <input 
            type="checkbox" 
            className="toggle" 
            checked={settings.includeUploadedFiles}
            onChange={(e) => updateSetting('includeUploadedFiles', e.target.checked)}
          />
        </div>
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

      {/* ────────────────────────────────────────────────────────────── */}
      {/* Scheduled Export */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="options-section">
        <h2>Scheduled Export</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Automatically export new conversations from configured platforms. Exports are Markdown-only.
        </p>

        {/* Global toggle */}
        <div className="options-row">
          <div>
            <div className="option-label">Enable Scheduled Export</div>
            <div className="option-description">Periodically check platforms and export new conversations</div>
          </div>
          <input
            type="checkbox"
            className="toggle"
            checked={scheduleSettings.enabled}
            onChange={(e) =>
              saveScheduleSettings({ ...scheduleSettings, enabled: e.target.checked })
            }
          />
        </div>

        {/* Global settings (shown when enabled) */}
        {scheduleSettings.enabled && (
          <>
            {/* Request delay */}
            <div className="options-row">
              <div>
                <div className="option-label">Request Delay</div>
                <div className="option-description">
                  Delay between conversation exports ({(scheduleSettings.requestDelayMs / 1000).toFixed(0)}s)
                </div>
              </div>
              <input
                type="range"
                min={1000}
                max={10000}
                step={1000}
                value={scheduleSettings.requestDelayMs}
                onChange={(e) =>
                  saveScheduleSettings({
                    ...scheduleSettings,
                    requestDelayMs: Number(e.target.value),
                  })
                }
                style={{ width: '150px' }}
              />
            </div>

            {/* Max total per run */}
            <div className="options-row">
              <div>
                <div className="option-label">Max Total Per Run</div>
                <div className="option-description">Max conversations across all platforms (1–200)</div>
              </div>
              <input
                type="number"
                className="input"
                style={{ width: '80px' }}
                min={1}
                max={200}
                value={scheduleSettings.maxTotalPerRun}
                onChange={(e) =>
                  saveScheduleSettings({
                    ...scheduleSettings,
                    maxTotalPerRun: Math.min(200, Math.max(1, Number(e.target.value))),
                  })
                }
              />
            </div>

            {/* Close tab after export */}
            <div className="options-row">
              <div>
                <div className="option-label">Close Tab After Export</div>
                <div className="option-description">Close background tab when export finishes</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={scheduleSettings.closeTabAfterExport}
                onChange={(e) =>
                  saveScheduleSettings({
                    ...scheduleSettings,
                    closeTabAfterExport: e.target.checked,
                  })
                }
              />
            </div>

            {/* Per-platform cards */}
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                Platform Schedules
              </h3>
              {platformKeys.map((platform) => {
                const pConfig = scheduleSettings.platforms[platform]
                return (
                  <div
                    key={platform}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginBottom: '8px',
                      opacity: pConfig.enabled ? 1 : 0.6,
                    }}
                  >
                    {/* Enable toggle */}
                    <div className="options-row" style={{ marginBottom: 0 }}>
                      <span className="option-label" style={{ fontWeight: 600 }}>
                        {PLATFORM_LABELS[platform]}
                      </span>
                      <input
                        type="checkbox"
                        className="toggle"
                        checked={pConfig.enabled}
                        onChange={(e) => {
                          const newPlatforms = {
                            ...scheduleSettings.platforms,
                            [platform]: { ...pConfig, enabled: e.target.checked },
                          }
                          saveScheduleSettings({ ...scheduleSettings, platforms: newPlatforms })
                        }}
                      />
                    </div>

                    {pConfig.enabled && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                        {/* Frequency */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Frequency:</span>
                          <select
                            className="input"
                            style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }}
                            value={pConfig.frequency}
                            onChange={(e) => {
                              const newPlatforms = {
                                ...scheduleSettings.platforms,
                                [platform]: { ...pConfig, frequency: e.target.value as ScheduleFrequency },
                              }
                              saveScheduleSettings({ ...scheduleSettings, platforms: newPlatforms })
                            }}
                          >
                            {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Max per run */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max:</span>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '60px', padding: '4px 8px', fontSize: '12px' }}
                            min={1}
                            max={100}
                            value={pConfig.maxPerRun}
                            onChange={(e) => {
                              const newPlatforms = {
                                ...scheduleSettings.platforms,
                                [platform]: {
                                  ...pConfig,
                                  maxPerRun: Math.min(100, Math.max(1, Number(e.target.value))),
                                },
                              }
                              saveScheduleSettings({ ...scheduleSettings, platforms: newPlatforms })
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Status display */}
        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Export Status
          </div>

          {scheduleStatus?.isRunning ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--accent, #4285f4)', fontWeight: 600 }}>⟳ Running...</span>
              {scheduleStatus.currentPlatform && (
                <span> — {PLATFORM_LABELS[scheduleStatus.currentPlatform]}</span>
              )}
            </div>
          ) : scheduleStatus?.lastRunAt ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Last run: {new Date(scheduleStatus.lastRunAt).toLocaleString()}
              {scheduleStatus.lastRunExported > 0 && (
                <span> — Exported {scheduleStatus.lastRunExported}</span>
              )}
              {scheduleStatus.lastRunFailed > 0 && (
                <span>, {scheduleStatus.lastRunFailed} failed</span>
              )}
              {scheduleStatus.lastRunError && (
                <div style={{ color: 'var(--error, #ea4335)', marginTop: '4px' }}>
                  Error: {scheduleStatus.lastRunError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              No exports yet
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', fontSize: '12px', padding: '6px 12px' }}
              onClick={triggerScheduledExport}
              disabled={scheduleStatus?.isRunning}
            >
              Run Now
            </button>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', fontSize: '12px', padding: '6px 12px' }}
              onClick={clearExportHistory}
            >
              Clear History
            </button>
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
