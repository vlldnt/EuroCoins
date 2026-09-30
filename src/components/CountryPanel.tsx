import { useMemo, useState } from 'react'
import { asset, commemorativeFor, data, relativeDiameter, type CommemorativeCoin, type Country } from '../data'
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
          <h2 id="panel-title">{nameOf(country)}</h2>
          <p className="panel-sub">{t('euroSince', { year: country.euroSince })}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'regular'} onClick={() => setTab('regular')}>
          {t('regularTab')}
          <span className="count">{plural('seriesOne', 'seriesMany', country.series.length)}</span>
        </button>
        <button role="tab" aria-selected={tab === 'commemorative'} onClick={() => setTab('commemorative')}>
          {t('commTab')}
          <span className="count">{commemorative.length}</span>
        </button>
      </div>

      {textsLang !== lang && (
        <p className="texts-note">{t('textsInOtherLanguage', { language: languageName(textsLang) })}</p>
      )}

      {/* key : fondu à chaque changement d'onglet */}
      <div className="tab-body" key={tab}>
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

function RegularSeries({ country, onZoom, bind }: Pick<Props, 'country' | 'onZoom'> & { bind: Bind }) {
  const { t } = useI18n()
  const { denominationLabel, countryDescription, regularDescription, nameOf } = useCoinTexts()

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
          <ul className="coin-grid">
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
                  style={{ '--diameter': relativeDiameter(d.id) } as React.CSSProperties}
                >
                  <button
                    className="coin"
                    {...bind({ image, title: text, text: regularDescription(image) })}
                    onClick={() => onZoom(items, items.findIndex((it) => it.caption === text))}
                  >
                    <img src={asset(image)} alt={text} loading="lazy" />
                  </button>
                  <span className="coin-label">{label}</span>
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
