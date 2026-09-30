import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  asset,
  commemorativeFor,
  data,
  relativeDiameter,
  type CommemorativeCoin,
  type Country,
  type DenominationId,
} from '../data'
import { COIN_LAYOUTS, readCoinLayout, saveCoinLayout, type CoinLayout } from '../settings'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import type { ZoomItem } from './Lightbox'
import { useCoinPreview, type PreviewContent } from './useCoinPreview'

type Tab = 'regular' | 'commemorative'

type Bind = (content: PreviewContent) => Record<string, unknown>

interface Props {
  country: Country
  /** Côté de la carte où s'ouvre la fenêtre (ordinateur, tablette). */
  side: 'left' | 'right'
  onClose: () => void
  // Ouvre le carrousel sur items[index] ; les flèches permettent ensuite de parcourir items.
  onZoom: (items: ZoomItem[], index: number) => void
}

export function CountryPanel({ country, side, onClose, onZoom }: Props) {
  const { t, plural, lang, textsLang, languageName } = useI18n()
  const { nameOf } = useCoinTexts()
  const [tab, setTab] = useState<Tab>('regular')
  const commemorative = useMemo(() => commemorativeFor(country.iso), [country.iso])
  const preview = useCoinPreview()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const tabsId = useId()
  const tabs: Tab[] = ['regular', 'commemorative']

  // À l'ouverture, le focus va sur le titre : le lecteur d'écran annonce le pays et la suite se lit.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  // Onglets ARIA : flèches gauche/droite, Début/Fin ; seul l'onglet actif est dans l'ordre de Tab.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
      : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
      : e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    setTab(next)
    document.getElementById(`${tabsId}-${next}`)?.focus()
  }
  // L'aperçu se ferme dès que le panneau défile ou que le carrousel s'ouvre.
  const zoom: Props['onZoom'] = (items, index) => {
    preview.hide()
    onZoom(items, index)
  }

  return (
    <section
      className={`panel is-${side}`}
      role="dialog"
      aria-labelledby="panel-title"
      data-keep-panel
      onScroll={preview.hide}
    >
      <header className="panel-header">
        <div>
          <h2 id="panel-title" ref={titleRef} tabIndex={-1}>
            {nameOf(country)}
          </h2>
          <p className="panel-sub">{t('euroSince', { year: country.euroSince })}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </header>

      <div className="tabs" role="tablist" aria-labelledby="panel-title" onKeyDown={onTabKey}>
        {tabs.map((value) => (
          <button
            key={value}
            id={`${tabsId}-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
          >
            {value === 'regular' ? t('regularTab') : t('commTab')}
            <span className="count">
              {value === 'regular'
                ? plural('seriesOne', 'seriesMany', country.series.length)
                : commemorative.length}
            </span>
          </button>
        ))}
      </div>

      {textsLang !== lang && (
        <p className="texts-note">{t('textsInOtherLanguage', { language: languageName(textsLang) })}</p>
      )}

      {/* key : fondu à chaque changement d'onglet */}
      <div
        className="tab-body"
        key={tab}
        id={`${tabsId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${tab}`}
      >
        {tab === 'regular' ? (
          <RegularSeries country={country} onZoom={zoom} bind={preview.bind} />
        ) : (
          <Commemoratives key={country.iso} coins={commemorative} country={country} onZoom={zoom} bind={preview.bind} />
        )}
      </div>
      {preview.node}
    </section>
  )
}

// Position (centre, en fraction du cadre carré) et taille de chaque pièce pour les dispositions
// « cercle » (2 € au centre, les 7 autres en couronne) et « arc » (8 pièces en arc, année au centre).
// La taille suit le diamètre réel de chaque pièce.
type Placement = { x: number; y: number; size: number }

function placements(layout: 'circle' | 'arc'): Record<DenominationId, Placement> {
  const ids = data.denominations.map((d) => d.id)
  const at = (angleDeg: number, radius: number) => ({
    x: 0.5 + radius * Math.cos((angleDeg * Math.PI) / 180),
    y: 0.5 + radius * Math.sin((angleDeg * Math.PI) / 180),
  })
  const out = {} as Record<DenominationId, Placement>
  if (layout === 'circle') {
    const ring = ids.filter((id) => id !== '2e')
    ring.forEach((id, i) => (out[id] = { ...at(-90 + (i * 360) / ring.length, 0.31), size: 0.28 * relativeDiameter(id) }))
    out['2e'] = { x: 0.5, y: 0.5, size: 0.28 }
  } else {
    // De bas-gauche à bas en passant par le haut (sens horaire), comme un coffret.
    ids.forEach((id, i) => (out[id] = { ...at(135 + i * 45, 0.37), size: 0.235 * relativeDiameter(id) }))
  }
  return out
}

const LAYOUT_LABELS = { circle: 'layoutCircle', arc: 'layoutArc', grid: 'layoutGrid' } as const

const LAYOUT_ICONS: Record<CoinLayout, React.ReactNode> = {
  circle: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="19" cy="9" r="2" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="5" cy="9" r="2" />
    </svg>
  ),
  arc: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="17" r="2" />
      <circle cx="4" cy="10" r="2" />
      <circle cx="8" cy="5" r="2" />
      <circle cx="15" cy="4.5" r="2" />
      <circle cx="20" cy="9" r="2" />
      <circle cx="19" cy="16" r="2" />
      <circle cx="12" cy="20" r="2" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <circle cx="9" cy="18" r="2.2" />
      <circle cx="15" cy="18" r="2.2" />
    </svg>
  ),
}

function RegularSeries({ country, onZoom, bind }: Pick<Props, 'country' | 'onZoom'> & { bind: Bind }) {
  const { t } = useI18n()
  const { denominationLabel, countryDescription, regularDescription, nameOf } = useCoinTexts()
  const [layout, setLayout] = useState<CoinLayout>(readCoinLayout)
  const layoutName = useId()
  const place = layout === 'grid' ? null : placements(layout)

  const chooseLayout = (value: CoinLayout) => {
    setLayout(value)
    saveCoinLayout(value)
  }

  const caption = (label: string, index: number) =>
    `${nameOf(country)} — ${label} (${t('seriesN', { n: index })})`

  const items = country.series.flatMap((s) =>
    data.denominations.flatMap((d) => {
      const image = s.coins[d.id]
      return image
        ? [{ image, caption: caption(denominationLabel(d.id), s.index), text: regularDescription(image) }]
        : []
    }),
  )
  const description = countryDescription(country)

  return (
    <>
      {/* Choix de la disposition (mémorisé) : boutons radio natifs, navigables aux flèches. */}
      <fieldset className="layout-picker">
        <legend className="visually-hidden">{t('coinLayout')}</legend>
        {COIN_LAYOUTS.map((value) => (
          <label key={value} title={t(LAYOUT_LABELS[value])}>
            <input
              type="radio"
              name={layoutName}
              checked={layout === value}
              onChange={() => chooseLayout(value)}
            />
            {LAYOUT_ICONS[value]}
            <span className="visually-hidden">{t(LAYOUT_LABELS[value])}</span>
          </label>
        ))}
      </fieldset>

      {country.series.map((s) => (
        <div className="series" key={s.index}>
          <h3>
            {country.series.length > 1 ? t('seriesN', { n: s.index }) : t('currentSeries')}
            {s.note ? (
              <span className="tag">{s.note}</span>
            ) : (
              s.since && <span className="tag">{t('sinceYear', { year: s.since })}</span>
            )}
          </h3>
          <ul className={place ? `coin-ring is-${layout}` : 'coin-grid'}>
            {layout === 'arc' && (
              <li className="coin-ring-year" aria-hidden="true">
                {s.note ?? s.since}
              </li>
            )}
            {data.denominations.map((d) => {
              const image = s.coins[d.id]
              if (!image) return null
              const isNew = s.index > 1 && s.changed.includes(d.id)
              const label = denominationLabel(d.id)
              const text = caption(label, s.index)
              return (
                <li
                  key={d.id}
                  data-denomination={d.id}
                  className={s.index > 1 && !isNew ? 'is-unchanged' : undefined}
                  style={
                    (place
                      ? { '--x': place[d.id].x, '--y': place[d.id].y, '--size': place[d.id].size }
                      : { '--diameter': relativeDiameter(d.id) }) as unknown as React.CSSProperties
                  }
                >
                  <button
                    className="coin"
                    {...bind({ image, title: text, text: regularDescription(image) })}
                    onClick={() => onZoom(items, items.findIndex((it) => it.caption === text))}
                  >
                    <img src={asset(image)} alt={text} loading="lazy" />
                  </button>
                  {s.index > 1 && !isNew && <span className="coin-note">{t('unchanged')}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {description.length > 0 && (
        <details className="about">
          <summary>{t('aboutDesigns')}</summary>
          {description
            .flatMap((block) => block.split('\n'))
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </details>
      )}
    </>
  )
}

function Commemoratives({
  coins,
  country,
  onZoom,
  bind,
}: {
  coins: CommemorativeCoin[]
  country: Country
  onZoom: Props['onZoom']
  bind: Bind
}) {
  const { t } = useI18n()
  const { commTitle, commDesign, nameOf } = useCoinTexts()
  const years = useMemo(() => [...new Set(coins.map((c) => c.year))].sort((a, b) => b - a), [coins])
  const [year, setYear] = useState<number | 'all'>('all')

  if (coins.length === 0) {
    return <p className="empty">{t('noCommemorative')}</p>
  }

  const visibleYears = year === 'all' ? years : [year]
  const zoomable = coins.filter((c) => visibleYears.includes(c.year) && c.image).sort((a, b) => b.year - a.year)
  const items = zoomable.map((c) => ({
    image: c.image!,
    caption: `${nameOf(country)} ${c.year} — ${commTitle(c)}`,
    text: commDesign(c),
  }))

  return (
    <>
      <div className="year-filter" role="group" aria-label={t('filterByYear')}>
        <button aria-pressed={year === 'all'} onClick={() => setYear('all')}>
          {t('allYears')}
        </button>
        {years.map((y) => (
          <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>

      {/* Pièces seules avec leur année ; le détail est dans l'aperçu (survol) et le carrousel (clic). */}
      <ul className="comm-grid">
        {coins
          .filter((c) => visibleYears.includes(c.year))
          .sort((a, b) => b.year - a.year)
          .map((c, i) => {
            const title = commTitle(c) || t('commemorativeCoin')
            const heading = `${c.year} — ${title}${c.joint ? ` (${t('jointIssue')})` : ''}`
            return (
              <li key={`${c.year}-${i}`}>
                {c.image ? (
                  <button
                    className="coin"
                    aria-label={heading}
                    {...bind({ image: c.image, title: heading, text: commDesign(c) })}
                    onClick={() => onZoom(items, zoomable.indexOf(c))}
                  >
                    <img src={asset(c.image)} alt="" loading="lazy" />
                  </button>
                ) : (
                  <div className="coin coin-placeholder" title={heading}>
                    {t('comingSoon')}
                  </div>
                )}
                <span className="coin-label">{c.year}</span>
              </li>
            )
          })}
      </ul>
    </>
  )
}
