import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import {
  AD, AT, BE, BG, CN, CY, DE, EE, ES, FI, FR, GR, HR, IE, IN, IT, JP, LT, LU, LV, MC, MT, NL, PT, SI, SK, SM, VA,
} from 'country-flag-icons/react/3x2'
import { LOCALES, useI18n, type Locale } from '../i18n'

// Imports explicites : seuls ces drapeaux finissent dans le bundle.
const FLAGS: Record<string, ComponentType<{ className?: string; title?: string }>> = {
  ad: AD, at: AT, be: BE, bg: BG, cn: CN, cy: CY, de: DE, ee: EE, es: ES, fi: FI, fr: FR, gr: GR, hr: HR, ie: IE,
  in: IN, it: IT, jp: JP, lt: LT, lu: LU, lv: LV, mc: MC, mt: MT, nl: NL, pt: PT, si: SI, sk: SK, sm: SM, va: VA,
}

function Flag({ id }: { id: string }) {
  const Component = FLAGS[id]
  return Component ? <Component className="flag" /> : null
}

export function LanguageSelect() {
  const { locale, setLocale, t, lang, languageName, countryName } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  // Chaque choix est affiché dans sa propre langue (« Vlaams · België », « 日本語 · 日本 »).
  const labelOf = (l: Locale) => l.label ?? languageName(l.lang, l.lang)
  const countryOf = (l: Locale) => l.country ?? countryName(l.id, l.id.toUpperCase(), l.lang)

  const euro = LOCALES.filter((l) => l.euro).sort((a, b) =>
    countryName(a.id, a.id).localeCompare(countryName(b.id, b.id), lang),
  )
  const others = LOCALES.filter((l) => !l.euro)

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // À l'ouverture, on place le focus sur le choix actif.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [open])

  const choose = (id: string) => {
    setLocale(id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onListKey = (e: React.KeyboardEvent) => {
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const current = options.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => options[(i + options.length) % options.length]?.focus()
    if (e.key === 'ArrowDown') move(current + 1)
    else if (e.key === 'ArrowUp') move(current - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(options.length - 1)
    else if (e.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
    else return
    e.preventDefault()
  }

  const option = (l: Locale) => (
    <li
      key={l.id}
      role="option"
      tabIndex={-1}
      lang={l.lang}
      aria-selected={l.id === locale.id}
      onClick={() => choose(l.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          choose(l.id)
        }
      }}
    >
      <Flag id={l.id} />
      <span className="language-name">{labelOf(l)}</span>
      <span className="language-country">{countryOf(l)}</span>
    </li>
  )

  return (
    <div className="language-select" ref={rootRef}>
      <button
        ref={triggerRef}
        className="language-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t('language')} : ${labelOf(locale)}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Flag id={locale.id} />
        <span className="language-trigger-label">{labelOf(locale)}</span>
        <span className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul id={listId} ref={listRef} className="language-menu" role="listbox" aria-label={t('language')} onKeyDown={onListKey}>
          {euro.map(option)}
          <li role="separator" className="language-separator" />
          {others.map(option)}
        </ul>
      )}
    </div>
  )
}
