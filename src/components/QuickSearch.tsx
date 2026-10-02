import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { asset, commemorativeFor, data } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { search, wordsOf, type PanelTarget, type SearchEntry } from '../search'
import { Flag } from './Flag'
import { CloseIcon } from './CloseIcon'

// Langues dans lesquelles un nom de pays est reconnu, en plus de celle de l'interface.
const NAME_LANGS = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pt']

interface Props {
  onPick: (iso: string, target: PanelTarget) => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Recherche rapide (Ctrl/⌘+K ou « / ») : « série 2 France », « erasmus allemagne », « 2025 »…
 * Sans casse ni accents, mots dans n'importe quel ordre. Un résultat ouvre directement le pays,
 * l'onglet et, pour une commémorative, le carrousel sur la pièce.
 */
export function QuickSearch({ onPick }: Props) {
  const { t, plural, lang, countryName } = useI18n()
  const { nameOf, commTitle } = useCoinTexts()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  // Index construit une fois par langue : noms de pays en plusieurs langues, séries, commémoratives.
  const entries = useMemo<SearchEntry[]>(() => {
    const out: SearchEntry[] = []
    data.countries.forEach((country, ci) => {
      const names = [nameOf(country), country.name, ...NAME_LANGS.map((l) => countryName(country.iso, '', l))]
      out.push({ id: country.iso, iso: country.iso, target: { kind: 'country' }, rank: ci, words: wordsOf(...names, country.iso) })
      for (const s of country.series) {
        out.push({
          id: `${country.iso}-s${s.index}`,
          iso: country.iso,
          target: { kind: 'series', index: s.index },
          rank: 1000 + ci * 10 + s.index,
          words: wordsOf(...names, t('seriesN', { n: s.index }), 'serie series', s.since),
        })
      }
      commemorativeFor(country.iso).forEach((c, i) => {
        out.push({
          id: `${country.iso}-c${c.year}-${i}`,
          iso: country.iso,
          target: { kind: 'comm', coin: c },
          rank: 10000 - c.year * 2 + ci / 100,
          words: wordsOf(...names, c.year, commTitle(c), c.title, t('commemorativeCoin'), c.joint ? t('jointIssue') : null),
        })
      })
    })
    return out
  }, [nameOf, commTitle, countryName, t])

  const results = useMemo(() => search(entries, query), [entries, query])
  const countriesByIso = useMemo(() => new Map(data.countries.map((c) => [c.iso, c])), [])

  // Raccourcis d'ouverture : Ctrl/⌘+K partout, « / » hors champ de saisie.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest('input, textarea, select, [contenteditable="true"]')
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ouverture : focus dans le champ, texte précédent sélectionné ; hauteur visible réelle (clavier
  // virtuel du mobile compris) pour que la liste ne passe jamais sous le clavier.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
    const vv = window.visualViewport
    const fit = () => backdropRef.current?.style.setProperty('--vvh', `${vv?.height ?? window.innerHeight}px`)
    fit()
    vv?.addEventListener('resize', fit)
    return () => vv?.removeEventListener('resize', fit)
  }, [open])

  // Le résultat actif reste visible pendant la navigation au clavier.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const pick = (entry: SearchEntry) => {
    close(false)
    onPick(entry.iso, entry.target)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Ne ferme que la recherche, pas la fenêtre pays.
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') setActive((i) => Math.min(results.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter' && results[active]) pick(results[active])
    else if (e.key === 'Tab') {
      // Fenêtre modale : Tab alterne entre le champ et « Fermer » (la liste se parcourt aux flèches).
      const closeButton = e.currentTarget.querySelector<HTMLElement>('.search-close')
      ;(document.activeElement === inputRef.current ? closeButton : inputRef.current)?.focus()
    } else return
    e.preventDefault()
  }

  const describe = (entry: SearchEntry) => {
    const country = countriesByIso.get(entry.iso)!
    const name = nameOf(country)
    const target = entry.target
    if (target.kind === 'country') {
      const comm = commemorativeFor(country.iso).length
      return {
        thumb: <Flag id={country.iso} />,
        title: name,
        sub: `${plural('seriesOne', 'seriesMany', country.series.length)} · ${plural('commOne', 'commMany', comm)}`,
      }
    }
    if (target.kind === 'series') {
      const s = country.series.find((x) => x.index === target.index)!
      const image = s.coins['2e'] ?? Object.values(s.coins)[0]
      return {
        thumb: image ? <img src={asset(image)} alt="" loading="lazy" /> : <Flag id={country.iso} />,
        title: `${t('seriesN', { n: s.index })} — ${name}`,
        sub: s.note ?? (s.since ? t('sinceYear', { year: s.since }) : t('regularTab')),
      }
    }
    const c = target.coin
    return {
      thumb: c.image ? <img src={asset(c.image)} alt="" loading="lazy" /> : <Flag id={country.iso} />,
      title: commTitle(c) || t('commemorativeCoin'),
      sub: `${name} · ${c.year} · ${t('commTab')}`,
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="search-trigger"
        aria-haspopup="dialog"
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <span className="search-trigger-label">{t('search')}</span>
        <kbd className="search-kbd" aria-hidden="true">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="search-backdrop"
          data-keep-panel
          onPointerDown={(e) => e.target === e.currentTarget && close()}
        >
          <div className="search-dialog" role="dialog" aria-modal="true" aria-label={t('search')} onKeyDown={onKeyDown}>
            <div className="search-field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="go"
                autoComplete="off"
                spellCheck={false}
                lang={lang}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
              />
              <button className="icon-button search-close" onClick={() => close()} aria-label={t('close')}>
                <CloseIcon />
              </button>
            </div>

            {results.length > 0 ? (
              <ul id={listId} ref={listRef} className="search-results" role="listbox" aria-label={t('search')}>
                {results.map((entry, i) => {
                  const d = describe(entry)
                  return (
                    <li
                      key={entry.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick(entry)}
                    >
                      <span className={`search-thumb is-${entry.target.kind}`}>{d.thumb}</span>
                      <span className="search-text">
                        <span className="search-title">{d.title}</span>
                        <span className="search-sub">{d.sub}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="search-empty" role="status">
                {query.trim() ? t('searchNoResults') : t('searchHint')}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
