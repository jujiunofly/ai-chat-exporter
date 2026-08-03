/**
 * Scheduled export utility functions
 * Pure functions for scheduling logic — no Chrome API dependencies
 */

import type {
  ExportablePlatform,
  ScheduleFrequency,
  ScheduledExportSettings,
} from './types'

export interface ScheduledRunSummary {
  attempted: number
  exported: number
  failed: number
  skipped: number
  listComplete: boolean
  systemError?: boolean
}

export type ScheduledRunStatus = 'success' | 'partial' | 'failed' | 'skipped'

/** Classify a run without conflating "some files downloaded" with success. */
export function classifyScheduledRun(summary: ScheduledRunSummary): ScheduledRunStatus {
  if (summary.systemError || !summary.listComplete) return 'failed'
  if (summary.attempted === 0 && summary.skipped > 0) return 'skipped'
  if (summary.failed > 0) return summary.exported > 0 ? 'partial' : 'failed'
  return 'success'
}

/** `lastRun` advances only after a complete scan and zero export failures. */
export function shouldAdvanceScheduledLastRun(summary: ScheduledRunSummary): boolean {
  return classifyScheduledRun(summary) === 'success' || classifyScheduledRun(summary) === 'skipped'
}

/** Frequency-to-millisecond mapping */
const FREQUENCY_INTERVALS: Record<ScheduleFrequency, number> = {
  hourly: 60 * 60 * 1000,
  every6h: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

/** Platform URL mappings for opening tabs */
export const PLATFORM_URLS: Record<ExportablePlatform, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/',
  deepseek: 'https://chat.deepseek.com/',
  grok: 'https://grok.com/',
}

/**
 * Convert a ScheduleFrequency to milliseconds
 */
export function frequencyToMs(freq: ScheduleFrequency): number {
  return FREQUENCY_INTERVALS[freq]
}

/**
 * Check if a platform is due for a scheduled export run
 * @param frequency - How often the export should run
 * @param lastRun - Timestamp of the last run (Unix ms)
 * @param now - Current timestamp (Unix ms)
 * @returns true if the platform is due for a run
 */
export function isDueForRun(
  frequency: ScheduleFrequency,
  lastRun: number,
  now: number
): boolean {
  const interval = FREQUENCY_INTERVALS[frequency]
  return now - lastRun >= interval
}

/**
 * Get the default scheduled export settings
 */
export function getDefaultScheduledExportSettings(): ScheduledExportSettings {
  return {
    enabled: false,
    platforms: {
      chatgpt:  { enabled: true, frequency: 'daily', maxPerRun: 20 },
      claude:   { enabled: false, frequency: 'daily', maxPerRun: 20 },
      gemini:   { enabled: false, frequency: 'daily', maxPerRun: 20 },
      deepseek: { enabled: false, frequency: 'daily', maxPerRun: 20 },
      grok:     { enabled: false, frequency: 'daily', maxPerRun: 20 },
    },
    defaultFormat: 'markdown',
    closeTabAfterExport: true,
    requestDelayMs: 3000,
    maxTotalPerRun: 50,
  }
}

/**
 * Create a delay promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** All exportable platform names */
export const ALL_PLATFORMS: ExportablePlatform[] = [
  'chatgpt', 'claude', 'gemini', 'deepseek', 'grok',
]
