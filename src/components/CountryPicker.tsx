import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { data, type Country } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { Flag } from './Flag'

interface Props {
  selected: string | null
  onSelect: (iso: string | null) => void
}

// Pays groupés par année d'entrée dans l'euro (puis par nom), de la plus ancienne à la plus récente.
function useCountriesByYear() {
  const { lang } = useI18n()
  const { nameOf } = useCoinTexts()
  const groups = new Map<number, Country[]>()
  for (const c of [...data.countries].sort(
    (a, b) => a.euroSince - b.euroSince || nameOf(a).localeCompare(nameOf(b), lang),
  )) {
    if (!groups.has(c.euroSince)) groups.set(c.euroSince, [])
    groups.get(c.euroSince)!.push(c)
  }
  return [...groups.entries()]
}

// Liste des pays posée sur la carte : colonne de drapeaux à gauche (ordinateur, tablette) ou rangée
// en bas (mobile), sur fond transparent ; le nom apparaît en fondu au survol / focus et reste affiché
// pour le pays ouvert (sauf en mobile, où la fenêtre pays l'affiche déjà).
export function CountryList({ selected, onSelect }: Props) {
  const { t } = useI18n()
  const { nameOf } = useCoinTexts()
  const groups = useCountriesByYear()
  let index = 0 // rang d'apparition, pour l'entrée en cascade

  // Mobile (rangée qui défile) : indicateurs « il reste des drapeaux » à gauche et à droite.
  const navRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const updateEdges = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const start = nav.scrollLeft <= 4
    const end = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
  }, [])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(nav)
    // Filet de sécurité : nouvelle mesure une fois la page affichée et à chaque redimensionnement.
    const timer = window.setTimeout(updateEdges, 400)
    window.addEventListener('resize', updateEdges)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateEdges)
    }
  }, [updateEdges])

  const scrollBy = (direction: 1 | -1) =>
    navRef.current?.scrollBy({ left: direction * navRef.current.clientWidth * 0.7, behavior: 'smooth' })

  return (
    <nav
      id="countries-list"
      ref={navRef}
      className="country-list"
      aria-label={t('countries')}
      tabIndex={-1}
      data-keep-panel
      onScroll={updateEdges}
    >
      {/* Indicateurs visuels seulement (les drapeaux restent accessibles au clavier) : aria-hidden. */}
      <button
        className={`scroll-hint is-left${edges.start ? '' : ' is-visible'}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => scrollBy(-1)}
      >
        ‹
      </button>
      {groups.map(([year, countries]) => (
        <section key={year} className="country-list-group" aria-label={String(year)}>
          <h2 className="country-list-year" aria-hidden="true">
            {year}
          </h2>
          <ul>
            {countries.map((c) => (
              <li key={c.iso} style={{ '--i': index++ } as React.CSSProperties}>
                <button aria-pressed={selected === c.iso} onClick={() => onSelect(c.iso)}>
                  <Flag id={c.iso} />
                  <span className="country-list-name">{nameOf(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button
        className={`scroll-hint is-right${edges.end ? '' : ' is-visible'}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => scrollBy(1)}
      >
        ›
      </button>
    </nav>
  )
}
