import { useEffect } from 'react'
import type { ExtensionSettings, ThemePreference } from './types'

export function prefersDarkColorScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve a stored preference to the actual light/dark tokens applied to the DOM. */
export function resolveTheme(theme?: ThemePreference): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme
  return prefersDarkColorScheme() ? 'dark' : 'light'
}

export function nextTheme(theme: ThemePreference | undefined): ThemePreference {
  if (theme === 'light') return 'dark'
  if (theme === 'dark') return 'system'
  return 'light'
}

/**
 * Keep the root `data-theme` attribute in sync with the configured theme.
 * `system` (and an unset preference) follow the OS color scheme, including
 * live changes while the popup/options page stays open.
 */
export function useThemeSync(theme?: ExtensionSettings['theme']) {
  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(theme))
    }
    apply()
    if (theme && theme !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
