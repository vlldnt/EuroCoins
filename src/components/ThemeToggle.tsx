import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

export type Theme = 'system' | 'light' | 'dark'

// Même clé que le script anti-flash de index.html.
const STORAGE_KEY = 'eurocoins.theme'

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // stockage indisponible
  }
  return 'system'
}

// « system » = on suit le réglage du système (prefers-color-scheme) : pas d'attribut data-theme.
function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

const ICONS: Record<Theme, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  ),
}

export function ThemeToggle() {
  const { t } = useI18n()
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignoré
    }
  }, [theme])

  const labels: Record<Theme, string> = {
    system: t('themeSystem'),
    light: t('themeLight'),
    dark: t('themeDark'),
  }

  return (
    <div className="theme-toggle" role="group" aria-label={t('theme')}>
      {(['system', 'light', 'dark'] as const).map((value) => (
        <button
          key={value}
          aria-pressed={theme === value}
          aria-label={labels[value]}
          title={labels[value]}
          onClick={() => setTheme(value)}
        >
          {ICONS[value]}
        </button>
      ))}
    </div>
  )
}
