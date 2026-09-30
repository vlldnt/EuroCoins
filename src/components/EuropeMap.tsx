import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import map from '../data/europe-map.json'
import { asset, commemorativeFor, countriesByIso, latestSeries, type Country } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { useMapZoom, type Rect } from './useMapZoom'

// Tracés précalculés par scripts/build-map.mjs. `focus` = zone euro à montrer en entier,
// `bounds` = zone dessinée autour, utilisée pour remplir l'écran quel que soit son format.
const { focus, bounds, shapes, markers } = map as {
  focus: Rect
  bounds: Rect
  shapes: { iso: string | null; d: string }[]
  markers: { iso: string; x: number; y: number }[]
}

// Élargit la zone `focus` pour qu'elle ait les proportions du conteneur.
function baseViewFor(ratio: number): Rect {
  let { x, y, width, height } = focus
  if (ratio > width / height) {
    const w = height * ratio
    x -= (w - width) / 2
    width = w
  } else {
    const h = width / ratio
    y -= (h - height) / 2
    height = h
  }
  return { x, y, width, height }
}

interface Hover {
  country: Country
}

interface Props {
  selected: string | null
  onSelect: (iso: string, clientX?: number) => void
  /** Côté où la fenêtre pays est ouverte : la fiche de survol se place de l'autre côté. */
  panelSide: 'left' | 'right' | null
}

export function EuropeMap({ selected, onSelect, panelSide }: Props) {
  const { t } = useI18n()
  const { nameOf } = useCoinTexts()
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: focus.width, height: focus.height })
  const [hover, setHover] = useState<Hover | null>(null)
  const [cursor, setCursor] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const base = useMemo(() => baseViewFor(size.width / size.height), [size])
  const zoom = useMapZoom(containerRef, base, bounds)

  // Fiche au survol : souris uniquement (au doigt, un appui ouvre directement le pays).
  const hoverOn = (country: Country) => setHover((h) => (h?.country === country ? h : { country }))

  // Mini-pièces à côté du curseur : à droite/en bas par défaut, de l'autre côté s'il le faut
  // pour ne pas déborder de la carte ni passer sur la fenêtre pays ouverte.
  const followCursor = (clientX: number, clientY: number) => {
    const map = containerRef.current?.getBoundingClientRect()
    if (!map) return
    const panel = document.querySelector('.panel')?.getBoundingClientRect()
    const x = clientX - map.left
    const y = clientY - map.top
    let left = x + CURSOR_GAP
    let top = y + CURSOR_GAP
    const overlapsPanel = (l: number, t: number) =>
      !!panel &&
      map.left + l < panel.right &&
      map.left + l + CURSOR_SIZE.width > panel.left &&
      map.top + t < panel.bottom &&
      map.top + t + CURSOR_SIZE.height > panel.top
    if (left + CURSOR_SIZE.width > map.width || overlapsPanel(left, top)) left = x - CURSOR_GAP - CURSOR_SIZE.width
    if (top + CURSOR_SIZE.height > map.height) top = y - CURSOR_GAP - CURSOR_SIZE.height
    setCursor({ left, top })
  }

  const countryProps = (country: Country) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': nameOf(country),
    'aria-pressed': selected === country.iso,
    onClick: (e: React.MouseEvent) => onSelect(country.iso, e.clientX),
    'data-keep-panel': true,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        onSelect(country.iso, r.left + r.width / 2)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && !zoom.isDragging()) {
        hoverOn(country)
        followCursor(e.clientX, e.clientY)
      } else {
        setHover(null)
        setCursor(null)
      }
    },
    onPointerLeave: () => {
      setHover(null)
      setCursor(null)
    },
    onFocus: (e: React.FocusEvent<SVGElement>) => {
      if (e.currentTarget.matches(':focus-visible')) hoverOn(country)
    },
    onBlur: () => setHover(null),
  })

  // Les pastilles des micro-États gardent une taille lisible quand on zoome.
  const markerRadius = 7 / Math.sqrt(zoom.zoom)

  return (
    <div className={`map${zoom.zoom > 1 ? ' is-zoomed' : ''}`} ref={containerRef}>
      <svg viewBox={zoom.viewBox} role="group" aria-label={t('mapLabel')} {...zoom.handlers}>
        <rect {...bounds} className="map-sea" />
        {shapes.map(({ iso, d }, i) => {
          const country = iso ? countriesByIso.get(iso) : undefined
          return country ? (
            <path
              key={i}
              d={d}
              className={`map-country is-euro${selected === country.iso ? ' is-selected' : ''}${
                hover?.country.iso === country.iso ? ' is-hovered' : ''
              }`}
              {...countryProps(country)}
            />
          ) : (
            <path key={i} d={d} className="map-country" aria-hidden="true" />
          )
        })}
        {markers.map(({ iso, x, y }) => {
          const country = countriesByIso.get(iso)!
          return (
            <circle
              key={iso}
              cx={x}
              cy={y}
              r={markerRadius}
              className={`map-marker${selected === iso ? ' is-selected' : ''}`}
              {...countryProps(country)}
            />
          )
        })}
      </svg>

      {hover && cursor && <CursorCoins country={hover.country} position={cursor} />}

      {hover ? (
        <HoverCard country={hover.country} side={panelSide === 'left' ? 'right' : 'left'} />
      ) : (
        <div className="map-hint">{t('mapHint')}</div>
      )}

      <div className="map-controls" data-keep-panel>
        <button onClick={zoom.zoomIn} aria-label={t('zoomIn')} title={t('zoomIn')}>
          +
        </button>
        <button onClick={zoom.zoomOut} aria-label={t('zoomOut')} title={t('zoomOut')} disabled={zoom.zoom <= 1}>
          −
        </button>
        {zoom.zoom > 1 && (
          <button onClick={zoom.reset} aria-label={t('resetZoom')} title={t('resetZoom')} className="map-reset">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

const CURSOR_GAP = 14
const CURSOR_SIZE = { width: 104, height: 54 }

// Les pièces de la série actuelle en tout petit, au premier plan près du curseur.
function CursorCoins({ country, position }: { country: Country; position: { left: number; top: number } }) {
  const coins = Object.values(latestSeries(country)?.coins ?? {})
  return (
    <div
      key={country.iso}
      className="cursor-coins"
      style={{ left: position.left, top: position.top, width: CURSOR_SIZE.width }}
      aria-hidden="true"
    >
      {coins.map((image) => (
        <img key={image} src={asset(image)} alt="" />
      ))}
    </div>
  )
}

// Fiche du pays survolé, à une place fixe dans un coin de la carte.
function HoverCard({ country, side }: { country: Country; side: 'left' | 'right' }) {
  const { t, plural } = useI18n()
  const { nameOf } = useCoinTexts()
  const series = latestSeries(country)
  const commCount = commemorativeFor(country.iso).length

  return (
    <div key={country.iso} className={`hover-card is-${side}`} aria-hidden="true">
      <div className="hover-card-coins">
        {(['1e', '2e'] as const).map((id) =>
          series?.coins[id] ? <img key={id} src={asset(series.coins[id]!)} alt="" /> : null,
        )}
      </div>
      <strong className="hover-card-name">{nameOf(country)}</strong>
      <span>{t('euroSince', { year: country.euroSince })}</span>
      <span>
        {plural('seriesOne', 'seriesMany', country.series.length)} · {plural('commOne', 'commMany', commCount)}
      </span>
      <span className="hover-card-cta">{t('clickToOpen')}</span>
    </div>
  )
}
