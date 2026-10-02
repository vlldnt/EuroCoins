import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'

export type YearChoice = number | 'all'

// Colonnes de la grille des années (flèches haut/bas = ± une ligne).
const COLUMNS = 4

/** Sélecteur d'année : un bouton qui ouvre une grille d'années (« Toutes » en tête). */
export function YearSelect({
  years,
  value,
  onChange,
}: {
  years: number[]
  value: YearChoice
  onChange: (value: YearChoice) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const choices: YearChoice[] = ['all', ...years]
  const labelOf = (v: YearChoice) => (v === 'all' ? t('allYears') : String(v))

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // À l'ouverture, le focus va sur l'année active.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [open])

  const choose = (v: YearChoice) => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // « Toutes » occupe la première ligne entière : les années commencent à l'index 1.
  const onListKey = (e: React.KeyboardEvent) => {
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const current = options.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => options[Math.max(0, Math.min(options.length - 1, i))]?.focus()
    if (e.key === 'ArrowRight') move(current + 1)
    else if (e.key === 'ArrowLeft') move(current - 1)
    else if (e.key === 'ArrowDown') move(current === 0 ? 1 : current + COLUMNS)
    else if (e.key === 'ArrowUp') move(current <= COLUMNS ? 0 : current - COLUMNS)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(options.length - 1)
    else if (e.key === 'Escape') {
      // Ne ferme que le menu, pas la fenêtre pays.
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
    else return
    e.preventDefault()
  }

  return (
    <div
      className="year-select"
      ref={rootRef}
      // Fermeture quand le focus part ailleurs (recherche rapide ouverte au clavier…).
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        className="year-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t('filterByYear')} : ${labelOf(value)}`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
        <span>{labelOf(value)}</span>
        <span className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          className="year-menu"
          role="listbox"
          aria-label={t('filterByYear')}
          onKeyDown={onListKey}
        >
          {choices.map((v) => (
            <li
              key={v}
              role="option"
              tabIndex={-1}
              aria-selected={v === value}
              className={v === 'all' ? 'is-all' : undefined}
              onClick={() => choose(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  choose(v)
                }
              }}
            >
              {labelOf(v)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
