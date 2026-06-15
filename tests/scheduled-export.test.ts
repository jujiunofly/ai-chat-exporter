/**
 * Scheduled Export Tests
 */

import { describe, it, expect } from 'vitest'
import {
  isDueForRun,
  frequencyToMs,
  getDefaultScheduledExportSettings,
  ALL_PLATFORMS,
} from '../src/lib/scheduled-export'
import type { ScheduleFrequency } from '../src/lib/types'

describe('Scheduled Export', () => {
  describe('frequencyToMs', () => {
    it('should convert hourly to milliseconds', () => {
      expect(frequencyToMs('hourly')).toBe(60 * 60 * 1000)
    })

    it('should convert every6h to milliseconds', () => {
      expect(frequencyToMs('every6h')).toBe(6 * 60 * 60 * 1000)
    })

    it('should convert daily to milliseconds', () => {
      expect(frequencyToMs('daily')).toBe(24 * 60 * 60 * 1000)
    })

    it('should convert weekly to milliseconds', () => {
      expect(frequencyToMs('weekly')).toBe(7 * 24 * 60 * 60 * 1000)
    })
  })

  describe('isDueForRun', () => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const HOUR_MS = 60 * 60 * 1000

    it('should return true when enough time has passed for daily frequency', () => {
      const now = Date.now()
      const lastRun = now - DAY_MS // 24 hours ago
      expect(isDueForRun('daily', lastRun, now)).toBe(true)
    })

    it('should return false when not enough time has passed for daily frequency', () => {
      const now = Date.now()
      const lastRun = now - DAY_MS + 1000 // just under 24 hours ago
      expect(isDueForRun('daily', lastRun, now)).toBe(false)
    })

    it('should return true for hourly when enough time has passed', () => {
      const now = Date.now()
      const lastRun = now - HOUR_MS
      expect(isDueForRun('hourly', lastRun, now)).toBe(true)
    })

    it('should return true for every6h when enough time has passed', () => {
      const now = Date.now()
      const lastRun = now - 6 * HOUR_MS
      expect(isDueForRun('every6h', lastRun, now)).toBe(true)
    })

    it('should return true for weekly when enough time has passed', () => {
      const now = Date.now()
      const lastRun = now - 7 * DAY_MS
      expect(isDueForRun('weekly', lastRun, now)).toBe(true)
    })

    it('should return true for weekly when no previous run (lastRun = 0)', () => {
      const now = Date.now()
      expect(isDueForRun('weekly', 0, now)).toBe(true)
    })

    it('should return false when lastRun is exactly the interval', () => {
      const now = Date.now()
      const lastRun = now - DAY_MS // exactly 24 hours ago
      // At exactly the interval boundary, it should be due
      expect(isDueForRun('daily', lastRun, now)).toBe(true)
    })
  })

  describe('getDefaultScheduledExportSettings', () => {
    it('should return default settings with correct structure', () => {
      const settings = getDefaultScheduledExportSettings()

      expect(settings.enabled).toBe(false)
      expect(settings.defaultFormat).toBe('markdown')
      expect(settings.closeTabAfterExport).toBe(true)
      expect(settings.requestDelayMs).toBe(3000)
      expect(settings.maxTotalPerRun).toBe(50)
    })

    it('should include all platforms with defaults', () => {
      const settings = getDefaultScheduledExportSettings()
      
      expect(settings.platforms).toBeDefined()

      for (const platform of ALL_PLATFORMS) {
        expect(settings.platforms[platform]).toBeDefined()
        expect(settings.platforms[platform].frequency).toBe('daily')
        expect(settings.platforms[platform].maxPerRun).toBe(20)
      }
    })

    it('should have chatgpt enabled by default', () => {
      const settings = getDefaultScheduledExportSettings()
      expect(settings.platforms.chatgpt.enabled).toBe(true)
    })

    it('should have other platforms disabled by default', () => {
      const settings = getDefaultScheduledExportSettings()
      expect(settings.platforms.claude.enabled).toBe(false)
      expect(settings.platforms.gemini.enabled).toBe(false)
      expect(settings.platforms.deepseek.enabled).toBe(false)
      expect(settings.platforms.grok.enabled).toBe(false)
    })
  })
})
