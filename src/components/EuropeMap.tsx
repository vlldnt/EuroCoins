import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import map from '../data/europe-map.json'
import { asset, commemorativeFor, countriesByIso, latestSeries, type Country, type DenominationId } from '../data'
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

// Micro-États : c'est leur pastille qui reçoit le focus clavier (un seul arrêt par pays).
const MARKER_ISOS = new Set(markers.map((m) => m.iso))

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

// Pays survolé (souris) ou focalisé (clavier), avec le point d'ancrage de la fiche, en px client.
interface Hover {
  country: Country
  clientX: number
  clientY: number
}

interface Props {
  selected: string | null
  onSelect: (iso: string, clientX?: number) => void
}

const KEY_PAN = 80 // px par appui sur une flèche

export function EuropeMap({ selected, onSelect }: Props) {
  const { t, lang } = useI18n()
  const { nameOf } = useCoinTexts()
  const containerRef = useRef<HTMLDivElement>(null)
  const helpId = useId()
  const [size, setSize] = useState({ width: focus.width, height: focus.height })
  const [hover, setHover] = useState<Hover | null>(null)

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

  // Pays de la zone euro dessinés par ordre alphabétique : l'ordre de tabulation est logique.
  const orderedShapes = useMemo(() => {
    const others = shapes.filter((s) => !s.iso)
    const euro = shapes
      .filter((s) => s.iso)
      .sort((a, b) =>
        nameOf(countriesByIso.get(a.iso!)!).localeCompare(nameOf(countriesByIso.get(b.iso!)!), lang),
      )
    return [...others, ...euro]
  }, [nameOf, lang])

  const countryProps = (country: Country, focusable: boolean) => ({
    role: 'button',
    tabIndex: focusable ? 0 : -1,
    'aria-label': `${nameOf(country)}, ${t('euroSince', { year: country.euroSince })}`,
    'aria-pressed': selected === country.iso,
    'data-keep-panel': true,
    onClick: (e: React.MouseEvent) => onSelect(country.iso, e.clientX),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        onSelect(country.iso, r.left + r.width / 2)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && !zoom.isDragging()) setHover({ country, clientX: e.clientX, clientY: e.clientY })
      else setHover(null)
    },
    onPointerLeave: () => setHover(null),
    // Au clavier, la fiche s'affiche à côté du pays qui a le focus.
    onFocus: (e: React.FocusEvent<SVGElement>) => {
      if (!e.currentTarget.matches(':focus-visible')) return
      const r = e.currentTarget.getBoundingClientRect()
      setHover({ country, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
    },
    onBlur: () => setHover(null),
  })

  // Raccourcis clavier de la carte : + / − zoom, 0 vue d'ensemble, flèches déplacement.
  const onMapKey = (e: React.KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      '+': zoom.zoomIn,
      '=': zoom.zoomIn,
      '-': zoom.zoomOut,
      '−': zoom.zoomOut,
      '0': zoom.reset,
      ArrowLeft: () => zoom.panBy(KEY_PAN, 0),
      ArrowRight: () => zoom.panBy(-KEY_PAN, 0),
      ArrowUp: () => zoom.panBy(0, KEY_PAN),
      ArrowDown: () => zoom.panBy(0, -KEY_PAN),
    }
    const action = actions[e.key]
    if (!action || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    setHover(null)
    action()
  }

  // Les pastilles des micro-États gardent une taille lisible quand on zoome.
  const markerRadius = 7 / Math.sqrt(zoom.zoom)

  return (
    <div
      id="map"
      className={`map${zoom.zoom > 1 ? ' is-zoomed' : ''}`}
      ref={containerRef}
      onKeyDown={onMapKey}
      tabIndex={-1}
    >
      <p id={helpId} className="visually-hidden">
        {t('mapKeyboardHelp')}
      </p>
      <svg viewBox={zoom.viewBox} role="group" aria-label={t('mapLabel')} aria-describedby={helpId} {...zoom.handlers}>
        <rect {...bounds} className="map-sea" />
        {orderedShapes.map(({ iso, d }, i) => {
          const country = iso ? countriesByIso.get(iso) : undefined
          return country ? (
            <path
              key={iso}
              d={d}
              className={`map-country is-euro${selected === country.iso ? ' is-selected' : ''}${
                hover?.country.iso === country.iso ? ' is-hovered' : ''
              }`}
              {...countryProps(country, !MARKER_ISOS.has(country.iso))}
            />
          ) : (
            <path key={`land-${i}`} d={d} className="map-country" aria-hidden="true" />
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
              {...countryProps(country, true)}
            />
          )
        })}
      </svg>

      {hover ? <HoverCard hover={hover} mapRef={containerRef} /> : <div className="map-hint">{t('mapHint')}</div>}

      <div className="map-controls" data-keep-panel>
        <button onClick={zoom.zoomIn} aria-label={t('zoomIn')} title={t('zoomIn')}>
          +
        </button>
        <button onClick={zoom.zoomOut} aria-label={t('zoomOut')} title={t('zoomOut')} disabled={zoom.zoom <= 1}>
          −
        </button>
        {zoom.zoom > 1 && (
          <button onClick={zoom.reset} aria-label={t('resetZoom')} title={t('resetZoom')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

const GAP = 16
const EDGE = 8

// Fiche du pays survolé, près du curseur (ou du pays focalisé au clavier). Elle mesure sa taille
// réelle et passe de l'autre côté si elle sortirait de la carte ou recouvrirait la fenêtre pays.
function HoverCard({ hover, mapRef }: { hover: Hover; mapRef: React.RefObject<HTMLDivElement | null> }) {
  const { t, plural } = useI18n()
  const { nameOf, denominationLabel } = useCoinTexts()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const { country } = hover
  const series = latestSeries(country)
  const commCount = commemorativeFor(country.iso).length

  useLayoutEffect(() => {
    const el = ref.current
    const mapBox = mapRef.current?.getBoundingClientRect()
    if (!el || !mapBox) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const panel = document.querySelector('.panel')?.getBoundingClientRect()
    const x = hover.clientX - mapBox.left
    const y = hover.clientY - mapBox.top
    const overlapsPanel = (l: number, tp: number) =>
      !!panel &&
      mapBox.left + l < panel.right &&
      mapBox.left + l + w > panel.left &&
      mapBox.top + tp < panel.bottom &&
      mapBox.top + tp + h > panel.top

    let left = x + GAP
    if (left + w > mapBox.width - EDGE || overlapsPanel(left, y - h / 2)) left = x - GAP - w
    const top = Math.min(Math.max(EDGE, y - h / 2), mapBox.height - h - EDGE)
    left = Math.min(Math.max(EDGE, left), mapBox.width - w - EDGE)
    setPos({ left, top })
  }, [hover, mapRef])

  return (
    <div
      ref={ref}
      className="hover-card"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      aria-hidden="true"
    >
      <strong className="hover-card-name">{nameOf(country)}</strong>
      <span>{t('euroSince', { year: country.euroSince })}</span>
      <span>
        {plural('seriesOne', 'seriesMany', country.series.length)} · {plural('commOne', 'commMany', commCount)}
      </span>
      <div className="hover-card-coins" key={country.iso}>
        {Object.entries(series?.coins ?? {}).map(([id, image]) => (
          <img key={id} src={asset(image!)} alt="" title={denominationLabel(id as DenominationId)} />
        ))}
      </div>
      <span className="hover-card-cta">{t('clickToOpen')}</span>
    </div>
  )
}
