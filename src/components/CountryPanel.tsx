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
import {
  COIN_LAYOUTS,
  COMM_LAYOUTS,
  readCoinLayout,
  readCommLayout,
  saveCoinLayout,
  saveCommLayout,
  type CoinLayout,
  type CommLayout,
} from '../settings'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import type { ZoomItem } from './Lightbox'
import { useCoinPreview, type PreviewContent } from './useCoinPreview'
import { CountryHeading } from './CountryHeading'
import { CloseIcon } from './CloseIcon'
import { MintageTable } from './MintageTable'
import { useUntilFound } from './useUntilFound'
import { LayoutPicker } from './LayoutPicker'
import { YearSelect, type YearChoice } from './YearSelect'
import type { PanelTarget } from '../search'

type Tab = 'regular' | 'commemorative'

type Bind = (content: PreviewContent) => Record<string, unknown>

interface Props {
  country: Country
  /** Animation de fermeture en cours. */
  leaving?: boolean
  /** Destination choisie dans la recherche rapide. */
  target?: PanelTarget | null
  onClose: () => void
  // Ouvre le carrousel sur items[index] ; les flèches permettent ensuite de parcourir items.
  onZoom: (items: ZoomItem[], index: number) => void
}

export function CountryPanel({ country, leaving = false, target = null, onClose, onZoom }: Props) {
  const { t, plural, lang, textsLang, languageName } = useI18n()
  const tabFor = (to: PanelTarget | null): Tab | null =>
    !to || to.kind === 'country' ? null : to.kind === 'series' ? 'regular' : 'commemorative'
  const [tab, setTab] = useState<Tab>(() => tabFor(target) ?? 'regular')
  // Nouvelle destination de la recherche rapide : on bascule d'onglet pendant le rendu.
  const [seenTarget, setSeenTarget] = useState(target)
  if (target !== seenTarget) {
    setSeenTarget(target)
    const next = tabFor(target)
    if (next) setTab(next)
  }
  const commemorative = useMemo(() => commemorativeFor(country.iso), [country.iso])
  const preview = useCoinPreview()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const tabsId = useId()
  const tabs: Tab[] = ['regular', 'commemorative']
  // Relance le fondu des commémoratives à chaque ouverture par l'onglet (pas par Ctrl+F : le
  // nœud trouvé doit rester en place pour que le navigateur puisse y défiler).
  const [commRun, setCommRun] = useState(0)
  const chooseTab = (value: Tab) => {
    if (value === tab) return
    setTab(value)
    if (value === 'commemorative') setCommRun((n) => n + 1)
  }
  // Commémoratives toujours présentes dans la page, masquées « until-found » : Ctrl+F les trouve
  // depuis l'onglet des séries courantes et bascule alors sur leur onglet.
  const commRef = useUntilFound<HTMLDivElement>(tab !== 'commemorative', () => setTab('commemorative'))

  // Recherche rapide : la série visée défile et s'illumine (la pièce commémorative est gérée
  // par Commemoratives).
  useEffect(() => {
    if (target?.kind !== 'series') return
    const frame = requestAnimationFrame(() =>
      highlight(document.querySelector(`.panel [data-series="${target.index}"]`)),
    )
    return () => cancelAnimationFrame(frame)
  }, [target])

  // Dispositions mémorisées ; le sélecteur est dans la barre d'onglets et suit l'onglet actif.
  const [coinLayout, setCoinLayout] = useState<CoinLayout>(readCoinLayout)
  const [commLayout, setCommLayout] = useState<CommLayout>(readCommLayout)
  const chooseCoinLayout = (value: CoinLayout) => {
    setCoinLayout(value)
    saveCoinLayout(value)
  }
  const chooseCommLayout = (value: CommLayout) => {
    setCommLayout(value)
    saveCommLayout(value)
  }

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
    chooseTab(next)
    document.getElementById(`${tabsId}-${next}`)?.focus()
  }
  // L'aperçu se ferme dès que le panneau défile ou que le carrousel s'ouvre.
  const zoom: Props['onZoom'] = (items, index) => {
    preview.hide()
    onZoom(items, index)
  }

  return (
    <section
      className={`panel${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-labelledby="panel-title"
      data-keep-panel
      onScroll={preview.hide}
    >
      <header className="panel-header">
        <CountryHeading country={country} variant="panel" titleId="panel-title" titleRef={titleRef} />
        <button className="icon-button panel-close" onClick={onClose} aria-label={t('close')}>
          <CloseIcon />
        </button>
      </header>

      <div className="tabs-bar">
        <div className="tabs" role="tablist" aria-labelledby="panel-title" onKeyDown={onTabKey}>
          {tabs.map((value) => (
            <button
              key={value}
              id={`${tabsId}-${value}`}
              role="tab"
              aria-selected={tab === value}
              aria-controls={`${tabsId}-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => chooseTab(value)}
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
        {tab === 'regular' ? (
          <LayoutPicker key="regular" options={COIN_LAYOUTS} value={coinLayout} onChange={chooseCoinLayout} />
        ) : (
          commemorative.length > 0 && (
            <LayoutPicker key="comm" options={COMM_LAYOUTS} value={commLayout} onChange={chooseCommLayout} />
          )
        )}
      </div>

      {textsLang !== lang && (
        <p className="texts-note">{t('textsInOtherLanguage', { language: languageName(textsLang) })}</p>
      )}

      {tab === 'regular' && (
        <div
          className="tab-body"
          id={`${tabsId}-panel-regular`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-regular`}
        >
          <RegularSeries country={country} layout={coinLayout} onZoom={zoom} bind={preview.bind} />
        </div>
      )}
      <div
        className="tab-body"
        key={commRun}
        ref={commRef}
        id={`${tabsId}-panel-commemorative`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-commemorative`}
      >
        <Commemoratives
          key={country.iso}
          coins={commemorative}
          country={country}
          layout={commLayout}
          target={target?.kind === 'comm' ? target : null}
          onZoom={zoom}
          bind={preview.bind}
        />
      </div>
      {preview.node}
    </section>
  )
}

// Disposition « cercle » : la 2 € au centre, les 7 autres en couronne. Position (centre, en fraction
// du cadre carré) et taille de chaque pièce, qui suit son diamètre réel.
type Placement = { x: number; y: number; size: number }

function circlePlacements(): Record<DenominationId, Placement> {
  const at = (angleDeg: number, radius: number) => ({
    x: 0.5 + radius * Math.cos((angleDeg * Math.PI) / 180),
    y: 0.5 + radius * Math.sin((angleDeg * Math.PI) / 180),
  })
  const out = {} as Record<DenominationId, Placement>
  const ring = data.denominations.map((d) => d.id).filter((id) => id !== '2e')
  ring.forEach((id, i) => (out[id] = { ...at(-90 + (i * 360) / ring.length, 0.335), size: 0.3 * relativeDiameter(id) }))
  out['2e'] = { x: 0.5, y: 0.5, size: 0.3 }
  return out
}

function RegularSeries({
  country,
  layout,
  onZoom,
  bind,
}: Pick<Props, 'country' | 'onZoom'> & { layout: CoinLayout; bind: Bind }) {
  const { t } = useI18n()
  const { denominationLabel, countryDescription, regularDescription, nameOf } = useCoinTexts()
  const place = layout === 'circle' ? circlePlacements() : null

  const caption = (label: string, index: number) =>
    `${nameOf(country)} — ${label} (${t('seriesN', { n: index })})`

  // Série la plus récente en premier (affichage et carrousel).
  const seriesNewestFirst = [...country.series].reverse()

  const items = seriesNewestFirst.flatMap((s) =>
    data.denominations.flatMap((d) => {
      const image = s.coins[d.id]
      return image
        ? [
            {
              image,
              caption: caption(denominationLabel(d.id), s.index),
              text: regularDescription(image),
              iso: country.iso,
            },
          ]
        : []
    }),
  )
  const description = countryDescription(country)

  return (
    <>
      {seriesNewestFirst.map((s) => (
        <div className="series" key={s.index} data-series={s.index}>
          <h3>
            {country.series.length > 1 ? t('seriesN', { n: s.index }) : t('currentSeries')}
            {s.note ? (
              <span className="tag">{s.note}</span>
            ) : (
              s.since && <span className="tag">{t('sinceYear', { year: s.since })}</span>
            )}
          </h3>
          <ul className={layout === 'circle' ? 'coin-ring' : layout === 'row' ? 'coin-row' : 'coin-grid'}>
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
                    {...bind({ image, title: text, text: regularDescription(image), iso: country.iso })}
                    onClick={() => onZoom(items, items.findIndex((it) => it.caption === text))}
                  >
                    <img src={asset(image)} alt={text} loading="lazy" />
                  </button>
                  {/* Pièce inchangée : astérisque, expliqué par la légende sous la série. */}
                  {s.index > 1 && !isNew && (
                    <span className="coin-note" title={t('unchangedNote')}>
                      <span aria-hidden="true">*</span>
                      <span className="visually-hidden">{t('unchanged')}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {s.index > 1 && data.denominations.some((d) => s.coins[d.id] && !s.changed.includes(d.id)) && (
            <p className="coin-legend" aria-hidden="true">
              * {t('unchangedNote')}
            </p>
          )}
        </div>
      ))}
      <MintageTable country={country} />
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
  layout,
  target,
  onZoom,
  bind,
}: {
  coins: CommemorativeCoin[]
  country: Country
  layout: CommLayout
  target: Extract<PanelTarget, { kind: 'comm' }> | null
  onZoom: Props['onZoom']
  bind: Bind
}) {
  const { t } = useI18n()
  const { commTitle, commDesign, nameOf, mintageText } = useCoinTexts()
  // Texte de l'aperçu et du carrousel : tirage, puis description du graphisme.
  const details = (c: CommemorativeCoin) => [mintageText(c), commDesign(c)].filter(Boolean).join('\n')
  const years = useMemo(() => [...new Set(coins.map((c) => c.year))].sort((a, b) => b - a), [coins])
  const sorted = useMemo(() => [...coins].sort((a, b) => b.year - a.year), [coins])
  const [year, setYear] = useState<YearChoice>('all')
  const listRef = useRef<HTMLDivElement>(null)
  // Recherche rapide : toutes les années redeviennent visibles…
  const [seenTarget, setSeenTarget] = useState(target)
  if (target !== seenTarget) {
    setSeenTarget(target)
    if (target) setYear('all')
  }

  // … puis la pièce défile et s'illumine, et le carrousel s'ouvre dessus.
  useEffect(() => {
    if (!target) return
    const coin = target.coin
    const frame = requestAnimationFrame(() => {
      highlight(listRef.current?.querySelector(`[data-coin="${sorted.indexOf(coin)}"]`) ?? null)
      const all = sorted.filter((c) => c.image)
      if (coin.image) onZoom(all.map((c) => zoomItem(c)), all.indexOf(coin))
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  if (coins.length === 0) {
    return <p className="empty">{t('noCommemorative')}</p>
  }

  function zoomItem(c: CommemorativeCoin): ZoomItem {
    return {
      image: c.image!,
      caption: `${nameOf(country)} ${c.year} — ${commTitle(c)}`,
      iso: country.iso,
      text: details(c),
    }
  }
  const isVisible = (y: number) => year === 'all' || y === year
  const zoomable = sorted.filter((c) => isVisible(c.year) && c.image)
  const items = zoomable.map((c) => zoomItem(c))
  const showAll = () => setYear('all')

  const item = (c: CommemorativeCoin, i: number, hidden: boolean, showYear: boolean) => (
    <CommItem
      key={`${c.year}-${i}`}
      index={i}
      coin={c}
      hidden={hidden}
      showYear={showYear}
      onFound={showAll}
      details={details(c)}
      bind={bind}
      onZoom={() => onZoom(items, zoomable.indexOf(c))}
    />
  )

  // Les pièces des autres années restent dans la page, masquées « until-found » : Ctrl+F les
  // trouve et réaffiche alors toutes les années.
  return (
    <>
      <div className="comm-toolbar">
        <YearSelect years={years} value={year} onChange={setYear} />
      </div>

      <div ref={listRef}>
        {layout === 'mosaic' ? (
          <ul className="comm-grid">{sorted.map((c, i) => item(c, i, !isVisible(c.year), true))}</ul>
        ) : (
          years.map((y) => (
            <YearGroup key={y} year={y} hidden={!isVisible(y)} onFound={showAll}>
              {sorted.map((c, i) => (c.year === y ? item(c, i, false, false) : null))}
            </YearGroup>
          ))
        )}
      </div>
    </>
  )
}

// Disposition « une ligne par année » : l'année en titre, ses pièces à la suite.
function YearGroup({
  year,
  hidden,
  onFound,
  children,
}: {
  year: number
  hidden: boolean
  onFound: () => void
  children: React.ReactNode
}) {
  const ref = useUntilFound<HTMLElement>(hidden, onFound)
  return (
    <section className="comm-year" ref={ref}>
      <h3>{year}</h3>
      <ul className="comm-grid">{children}</ul>
    </section>
  )
}

function CommItem({
  coin: c,
  index,
  hidden,
  showYear,
  onFound,
  details,
  bind,
  onZoom,
}: {
  coin: CommemorativeCoin
  index: number
  hidden: boolean
  showYear: boolean
  onFound: () => void
  details: string
  bind: Bind
  onZoom: () => void
}) {
  const { t } = useI18n()
  const { commTitle, mintageText } = useCoinTexts()
  const ref = useUntilFound<HTMLLIElement>(hidden, onFound)
  const title = commTitle(c) || t('commemorativeCoin')
  const heading = `${c.year} — ${title}${c.joint ? ` (${t('jointIssue')})` : ''}`

  return (
    <li ref={ref} data-coin={index}>
      {c.image ? (
        <button
          className="coin"
          aria-label={[heading, mintageText(c)].filter(Boolean).join('. ')}
          {...bind({ image: c.image, title: heading, text: details, iso: c.country })}
          onClick={onZoom}
        >
          <img src={asset(c.image)} alt="" loading="lazy" />
        </button>
      ) : (
        <div className="coin coin-placeholder" title={heading}>
          {t('comingSoon')}
        </div>
      )}
      {showYear && <span className="coin-label">{c.year}</span>}
      {/* Titre visible (et donc trouvable par Ctrl+F), tronqué ; complet au survol. */}
      <span className="coin-title" title={title} aria-hidden="true">
        {title}
      </span>
    </li>
  )
}

// Défile jusqu'à l'élément visé par la recherche rapide et le fait briller un instant.
function highlight(el: Element | null) {
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('is-found')
  void (el as HTMLElement).offsetWidth
  el.classList.add('is-found')
}
