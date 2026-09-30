import { useEffect, useId, useRef, useState } from 'react'
import { useI18n, type Messages } from '../i18n'
import {
  PALETTES,
  TEXT_SIZES,
  applyPalette,
  applyTextSize,
  applyTheme,
  readPalette,
  readTextSize,
  readTheme,
  type Palette,
  type TextSize,
  type Theme,
} from '../settings'

const THEME_LABELS: Record<Theme, keyof Messages> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
}

const PALETTE_LABELS: Record<Palette, keyof Messages> = {
  standard: 'paletteStandard',
  protan: 'paletteProtan',
  deutan: 'paletteDeutan',
  tritan: 'paletteTritan',
  achroma: 'paletteAchroma',
  contrast: 'paletteContrast',
}

const THEME_ICONS: Record<Theme, React.ReactNode> = {
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

// Menu « Affichage » : thème, palette de la carte (dont palettes pour daltoniens), taille du texte.
// Groupes de vrais boutons radio : navigation aux flèches et annonce correcte par les lecteurs d'écran.
export function DisplaySettings() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [palette, setPalette] = useState<Palette>(readPalette)
  const [textSize, setTextSize] = useState<TextSize>(readTextSize)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => applyPalette(palette), [palette])
  useEffect(() => applyTextSize(textSize), [textSize])

  // Fermeture : clic à l'extérieur ou Échap (le focus revient sur le bouton).
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    // À l'ouverture, focus sur le premier choix coché.
    panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const sizeIndex = TEXT_SIZES.indexOf(textSize)

  return (
    <div className="display-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        className="display-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
        <span className="display-trigger-label">{t('display')}</span>
      </button>

      {open && (
        <div id={id} ref={panelRef} className="display-menu" role="group" aria-label={t('display')}>
          <fieldset>
            <legend>{t('theme')}</legend>
            <div className="segmented">
              {(['system', 'light', 'dark'] as const).map((value) => (
                <label key={value} title={t(THEME_LABELS[value])}>
                  <input
                    type="radio"
                    name={`${id}-theme`}
                    value={value}
                    checked={theme === value}
                    onChange={() => setTheme(value)}
                  />
                  {THEME_ICONS[value]}
                  <span>{t(THEME_LABELS[value])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('mapColors')}</legend>
            <div className="palette-list">
              {PALETTES.map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`${id}-palette`}
                    value={value}
                    checked={palette === value}
                    onChange={() => setPalette(value)}
                  />
                  {/* Aperçu : les variables de la palette s'appliquent grâce à data-palette. */}
                  <span className="palette-swatch" data-palette={value} aria-hidden="true">
                    <span style={{ background: 'var(--map-land)' }} />
                    <span style={{ background: 'var(--map-euro)' }} />
                    <span style={{ background: 'var(--map-selected)', outline: '2px solid var(--map-selected-stroke)' }} />
                  </span>
                  <span>{t(PALETTE_LABELS[value])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('textSize')}</legend>
            <div className="text-size">
              <button
                onClick={() => setTextSize((s) => TEXT_SIZES[Math.max(0, TEXT_SIZES.indexOf(s) - 1)])}
                disabled={sizeIndex === 0}
                aria-label={t('textSmaller')}
              >
                A−
              </button>
              <output aria-live="polite">{textSize} %</output>
              <button
                onClick={() => setTextSize((s) => TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, TEXT_SIZES.indexOf(s) + 1)])}
                disabled={sizeIndex === TEXT_SIZES.length - 1}
                aria-label={t('textLarger')}
              >
                A+
              </button>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  )
}
