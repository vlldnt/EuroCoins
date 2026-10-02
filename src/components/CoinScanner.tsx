import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { detectCircle, toGray, type Circle } from '../coinDetect'
import { coinOfImage, type CoinRef } from '../coinLookup'
import type { MatchRequest, MatchResponse } from '../coinMatch.worker'
import { asset, countriesByIso, data } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import type { PanelTarget } from '../search'
import { readScanMode, saveScanMode, type ScanMode } from '../settings'
import { sharpness } from '../sharpness'
import { CloseIcon } from './CloseIcon'

// Largeur de l'image analysée : assez pour repérer une petite pièce, assez légère pour ~15 analyses/s.
const WORK_WIDTH = 240
// Intervalle minimal entre deux analyses (ms).
const ANALYSIS_INTERVAL = 60
// Analyses consécutives où la pièce reste immobile avant la prise de vue automatique.
const STABLE_FRAMES = 10
// Analyses sans pièce tolérées avant de perdre la pièce suivie (reflet, flou passager).
const MAX_MISSES = 3
// Rayon du cercle-guide, en fraction du plus petit côté de l'écran.
const GUIDE_RADIUS = 0.3
// Netteté minimale (voir sharpness.ts) : en dessous, l'image est jugée floue.
const SHARP_ENOUGH = 0.5
// Taille de l'image de la pièce pour mesurer la netteté.
const SHARP_SIZE = 160
// Rayon minimal de la pièce dans le flux vidéo (px) pour une reconnaissance fiable.
const MIN_COIN_RADIUS = 110
// Taille maximale de la photo gardée (px) et marge autour de la pièce.
const PHOTO_MAX = 720
const PHOTO_MARGIN = 1.12
// Score en dessous duquel un résultat est signalé « peu sûr ».
const SURE_SCORE = 0.45
// Concordance affichée (%) : score ramené sur l'échelle observée aux essais (≤ 0,3 : pièces
// différentes ; ≥ 0,7 : même pièce sans doute possible).
const concordance = (score: number) => Math.max(0, Math.min(1, (score - 0.3) / 0.4))

type Phase = 'starting' | 'scanning' | 'matching' | 'results' | 'error'

// Pièce photographiée : image recadrée (pièce au centre) et cercle dans cette image (px).
interface Shot {
  canvas: HTMLCanvasElement
  circle: { x: number; y: number; r: number }
  sharp: number
  time: number
}

interface Result {
  ref: CoinRef
  score: number
}

// Même pièce d'une analyse à l'autre : centre et rayon proches (en fraction de la largeur).
const sameCoin = (a: Circle, b: Circle) => Math.hypot(a.x - b.x, a.y - b.y) < 0.06 && Math.abs(a.r / b.r - 1) < 0.12
// Pièce immobile : toujours à moins de 3 % de sa position de départ (tremblement de la main toléré).
const stillSince = (anchor: Circle, c: Circle) =>
  Math.hypot(anchor.x - c.x, anchor.y - c.y) < 0.03 && Math.abs(anchor.r / c.r - 1) < 0.06

const lerp = (a: Circle, b: Circle, k: number): Circle => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  r: a.r + (b.r - a.r) * k,
  score: b.score,
})

// Recadre la pièce (cercle en fraction de la largeur du flux) dans un carré, avec une marge.
function cropCoin(video: HTMLVideoElement, c: Circle, maxSize: number): Shot {
  const vw = video.videoWidth
  const half = c.r * vw * PHOTO_MARGIN
  const size = Math.max(32, Math.min(maxSize, Math.round(half * 2)))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d')!.drawImage(video, c.x * vw - half, c.y * vw - half, half * 2, half * 2, 0, 0, size, size)
  return { canvas, circle: { x: size / 2, y: size / 2, r: size / 2 / PHOTO_MARGIN }, sharp: 0, time: performance.now() }
}

function grayOfCanvas(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return toGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
}

// Réglages de mise au point (Chrome Android) : absents ailleurs, sans effet alors.
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[]; pointsOfInterest?: unknown }

function focusOn(track: MediaStreamTrack | null, x: number, y: number) {
  const caps = track?.getCapabilities?.() as FocusCapabilities | undefined
  if (!track || !caps) return
  const wanted: Record<string, unknown> = {}
  if (caps.pointsOfInterest) wanted.pointsOfInterest = [{ x, y }]
  if (caps.focusMode?.includes('single-shot')) wanted.focusMode = 'single-shot'
  else if (caps.focusMode?.includes('continuous')) wanted.focusMode = 'continuous'
  if (Object.keys(wanted).length) {
    track.applyConstraints({ advanced: [wanted] } as unknown as MediaTrackConstraints).catch(() => {})
  }
}

/**
 * Photographier une pièce : vue caméra plein écran, la pièce est repérée en direct (cercle), la mise
 * au point se fait sur elle et la plus nette des images récentes est gardée. En mode automatique,
 * la photo part quand la pièce est immobile et nette ; en manuel, au déclencheur. La photo est
 * ensuite comparée aux pièces connues et les plus ressemblantes sont proposées.
 */
export function CoinScanner({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (iso: string, target: PanelTarget) => void
}) {
  const { t, lang } = useI18n()
  const percent = new Intl.NumberFormat(lang, { style: 'percent' })
  const { commTitle, nameOf, denominationLabel } = useCoinTexts()
  const [phase, setPhase] = useState<Phase>('starting')
  const [mode, setMode] = useState<ScanMode>(readScanMode)
  const [circle, setCircle] = useState<Circle | null>(null)
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState<'scanHint' | 'scanHold' | 'scanCloser' | 'scanBlurry' | 'scanTapShutter'>('scanHint')
  const [photo, setPhoto] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; key: number } | null>(null)
  // Taille affichée de la vidéo (w, h) et taille réelle du flux (vw, vh).
  const [box, setBox] = useState({ w: 0, h: 0, vw: 1, vh: 1 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const modeRef = useRef(mode)
  // Suivi : cercle lissé affiché, position de départ de l'immobilité, meilleure image de la série.
  const track = useRef({
    circle: null as Circle | null,
    anchor: null as Circle | null,
    stable: 0,
    misses: 0,
    best: null as Shot | null,
    lastFocus: 0,
  })

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Caméra arrière, en haute définition : une pièce tenue loin reste assez détaillée.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        const [videoTrack] = s.getVideoTracks()
        trackRef.current = videoTrack
        const caps = videoTrack.getCapabilities?.() as FocusCapabilities | undefined
        if (caps?.focusMode?.includes('continuous')) {
          const constraints = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
          videoTrack.applyConstraints(constraints).catch(() => {})
        }
        const video = videoRef.current!
        video.srcObject = s
        await video.play()
        setPhase('scanning')
      })
      .catch(() => !cancelled && setPhase('error'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  // Reconnaissance en arrière-plan : les signatures se chargent dès l'ouverture.
  useEffect(() => {
    const worker = new Worker(new URL('../coinMatch.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const url = `${import.meta.env.BASE_URL}coins/signatures.json?v=${encodeURIComponent(data.generatedAt)}`
    worker.postMessage({ url: new URL(url, location.href).href } satisfies MatchRequest)
    return () => worker.terminate()
  }, [])

  // Tailles de la vidéo (pour placer le cercle par-dessus) : à l'arrivée du flux et à chaque redimensionnement.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const measure = () =>
      setBox({ w: video.clientWidth, h: video.clientHeight, vw: video.videoWidth || 1, vh: video.videoHeight || 1 })
    const observer = new ResizeObserver(measure)
    observer.observe(video)
    video.addEventListener('loadedmetadata', measure)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', measure)
    }
  }, [])

  // Focus sur « Fermer » à l'ouverture (fenêtre modale).
  useEffect(() => closeRef.current?.focus(), [])

  // Photo prise : affichage en rond, puis comparaison avec les pièces connues.
  const finish = useCallback((shot: Shot) => {
    navigator.vibrate?.(30)
    const { canvas } = shot
    let c = shot.circle
    // Cercle affiné sur la photo elle-même (plus précis que sur l'image réduite du suivi).
    const small = document.createElement('canvas')
    const scale = Math.min(1, WORK_WIDTH / canvas.width)
    small.width = small.height = Math.round(canvas.width * scale)
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height)
    const refined = detectCircle(grayOfCanvas(small), small.width, small.height)
    if (refined) {
      const r = { x: (refined.x * small.width) / scale, y: (refined.y * small.width) / scale, r: (refined.r * small.width) / scale }
      if (Math.hypot(r.x - c.x, r.y - c.y) < c.r * 0.15 && Math.abs(r.r / c.r - 1) < 0.2) c = r
    }

    const round = document.createElement('canvas')
    const size = Math.round(c.r * 2)
    round.width = round.height = size
    const ctx = round.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(canvas, c.x - c.r, c.y - c.r, size, size, 0, 0, size, size)
    setPhoto(round.toDataURL('image/webp', 0.9))
    setResults([])
    setPhase('matching')

    const gray = grayOfCanvas(canvas)
    workerRef.current?.postMessage(
      { gray, w: canvas.width, h: canvas.height, cx: c.x, cy: c.y, r: c.r } satisfies MatchRequest,
      [gray.buffer],
    )
  }, [])

  // Réponses du worker : résultats regroupés (même dessin pour 1, 2 et 5 cent d'une série…).
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    const onMessage = (e: MessageEvent<MatchResponse>) => {
      if (!e.data.results) return
      const grouped: Result[] = []
      // Ligne de résultat de chaque rang (un rang réuni à un autre pointe vers la même ligne).
      const groupOfRank = new Map<number, Result>()
      e.data.results.forEach(({ image, score, twinOf }, rank) => {
        const ref = coinOfImage(image)
        if (!ref) return
        // Même dessin dans la même série : une seule ligne, valeurs réunies.
        const twin = twinOf === undefined ? undefined : groupOfRank.get(twinOf)
        if (twin?.ref.kind === 'regular' && ref.kind === 'regular' && twin.ref.iso === ref.iso && twin.ref.series === ref.series) {
          twin.ref = { ...twin.ref, denominations: [...twin.ref.denominations, ...ref.denominations] }
          groupOfRank.set(rank, twin)
          return
        }
        if (grouped.length < 3) {
          const result = { ref, score }
          grouped.push(result)
          groupOfRank.set(rank, result)
        }
      })
      setResults(grouped)
      setPhase('results')
    }
    worker.addEventListener('message', onMessage)
    return () => worker.removeEventListener('message', onMessage)
  }, [])

  // Boucle d'analyse : image réduite → cercle → suivi → netteté → prise de vue (auto).
  useEffect(() => {
    if (phase !== 'scanning') return
    const video = videoRef.current!
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let frame = 0
    let last = 0
    let blurrySince = 0
    track.current = { circle: null, anchor: null, stable: 0, misses: 0, best: null, lastFocus: 0 }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < ANALYSIS_INTERVAL || !video.videoWidth) return
      last = now
      const w = WORK_WIDTH
      const h = Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.drawImage(video, 0, 0, w, h)
      const found = detectCircle(toGray(ctx.getImageData(0, 0, w, h).data, w, h), w, h)

      const tr = track.current
      if (found) {
        tr.misses = 0
        // Même pièce : le cercle affiché la suit en douceur ; sinon on repart de zéro.
        tr.circle = tr.circle && sameCoin(tr.circle, found) ? lerp(tr.circle, found, 0.4) : found
        if (tr.anchor && stillSince(tr.anchor, found)) tr.stable++
        else {
          tr.anchor = found
          tr.stable = 1
          tr.best = null
        }
      } else if (++tr.misses > MAX_MISSES) {
        tr.circle = null
        tr.anchor = null
        tr.stable = 0
        tr.best = null
      }

      let nextHint: typeof hint = 'scanHint'
      if (tr.circle && found) {
        // Mise au point sur la pièce (au plus toutes les 1,5 s).
        if (now - tr.lastFocus > 1500) {
          tr.lastFocus = now
          focusOn(trackRef.current, found.x, found.y / (video.videoHeight / video.videoWidth))
        }
        // Netteté : on garde la plus nette des images de la série immobile.
        const probe = cropCoin(video, found, SHARP_SIZE)
        const s = sharpness(grayOfCanvas(probe.canvas), probe.canvas.width)
        if (!tr.best || s > tr.best.sharp) tr.best = { ...cropCoin(video, found, PHOTO_MAX), sharp: s }

        const tooSmall = found.r * video.videoWidth < MIN_COIN_RADIUS
        const sharpEnough = tr.best.sharp >= SHARP_ENOUGH
        blurrySince = sharpEnough ? 0 : blurrySince || now
        if (tooSmall) nextHint = 'scanCloser'
        else if (blurrySince && now - blurrySince > 1000) nextHint = 'scanBlurry'
        else nextHint = modeRef.current === 'auto' ? 'scanHold' : 'scanTapShutter'

        if (modeRef.current === 'auto' && tr.stable >= STABLE_FRAMES && sharpEnough && !tooSmall) {
          cancelAnimationFrame(frame)
          finish(tr.best)
          return
        }
      } else if (modeRef.current === 'manual') nextHint = 'scanTapShutter'
      setCircle(tr.circle)
      setProgress(modeRef.current === 'auto' ? Math.min(1, tr.stable / STABLE_FRAMES) : 0)
      setHint(nextHint)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, finish])

  // Coordonnées écran : la vidéo remplit l'écran en étant rognée (object-fit: cover).
  const { vw, vh } = box
  const scale = Math.max(box.w / vw, box.h / vh)
  const ox = (box.w - vw * scale) / 2
  const oy = (box.h - vh * scale) / 2
  const shown = circle
    ? { x: ox + circle.x * vw * scale, y: oy + circle.y * vw * scale, r: circle.r * vw * scale }
    : { x: box.w / 2, y: box.h / 2, r: GUIDE_RADIUS * Math.min(box.w, box.h) }
  const hole = `M0 0H${box.w}V${box.h}H0Z M${shown.x - shown.r} ${shown.y} a${shown.r} ${shown.r} 0 1 0 ${shown.r * 2} 0 a${shown.r} ${shown.r} 0 1 0 ${-shown.r * 2} 0Z`
  const perimeter = 2 * Math.PI * shown.r

  // Déclencheur : la plus nette des images récentes si la pièce est suivie ; sinon la pièce cherchée
  // dans l'image du moment ; à défaut, le cercle-guide.
  const shoot = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const tr = track.current
    if (tr.best && performance.now() - tr.best.time < 1500) return finish(tr.best)
    const frame = document.createElement('canvas')
    frame.width = WORK_WIDTH
    frame.height = Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth)
    frame.getContext('2d')!.drawImage(video, 0, 0, frame.width, frame.height)
    const found = detectCircle(grayOfCanvas(frame), frame.width, frame.height)
    const guide: Circle = { x: 0.5, y: vh / vw / 2, r: (GUIDE_RADIUS * Math.min(box.w, box.h)) / scale / vw, score: 0 }
    finish(cropCoin(video, found ?? tr.circle ?? guide, PHOTO_MAX))
  }

  // Toucher l'image : mise au point à cet endroit.
  const tapFocus = (e: React.PointerEvent) => {
    const x = (e.nativeEvent.offsetX - ox) / (vw * scale)
    const y = (e.nativeEvent.offsetY - oy) / (vh * scale)
    if (x < 0 || y < 0 || x > 1 || y > 1) return
    track.current.lastFocus = performance.now()
    focusOn(trackRef.current, x, y)
    setFocusPoint({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, key: performance.now() })
  }

  const chooseMode = (value: ScanMode) => {
    setMode(value)
    saveScanMode(value)
  }

  const retake = () => {
    setPhoto(null)
    setResults([])
    setCircle(null)
    setProgress(0)
    setPhase('scanning')
  }

  const pick = (ref: CoinRef) => {
    onPick(ref.iso, ref.kind === 'comm' ? { kind: 'comm', coin: ref.coin } : { kind: 'series', index: ref.series })
    onClose()
  }

  const describe = (ref: CoinRef) => {
    const country = countriesByIso.get(ref.iso)
    const name = country ? nameOf(country) : ref.iso
    if (ref.kind === 'comm') return { title: commTitle(ref.coin) || t('commemorativeCoin'), sub: `${name} · ${ref.coin.year}` }
    const ids = data.denominations.map((d) => d.id).filter((id) => ref.denominations.includes(id))
    const series = country && country.series.length > 1 ? t('seriesN', { n: ref.series }) : t('currentSeries')
    return { title: ids.map(denominationLabel).join(' · '), sub: `${name} · ${series}` }
  }

  const message =
    phase === 'error'
      ? t('scanCameraError')
      : phase === 'matching'
        ? t('scanMatching')
        : phase === 'results'
          ? results.length && results[0].score >= SURE_SCORE
            ? t('scanResults')
            : t('scanNoMatch')
          : t(hint)

  return createPortal(
    <div
      className={`scanner is-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('scanCoin')}
      data-keep-panel
      lang={lang}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Ne ferme que la caméra, pas la fenêtre pays.
        e.stopPropagation()
        onClose()
      }}
    >
      <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />

      {phase === 'scanning' && box.w > 0 && (
        <svg className="scanner-overlay" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true" onPointerDown={tapFocus}>
          <path className="scanner-mask" d={hole} fillRule="evenodd" />
          <circle
            className={circle ? `scanner-ring is-found${hint === 'scanBlurry' ? ' is-blurry' : ''}` : 'scanner-ring'}
            cx={shown.x}
            cy={shown.y}
            r={shown.r}
          />
          {circle && progress > 0 && (
            <circle
              className="scanner-progress"
              cx={shown.x}
              cy={shown.y}
              r={shown.r}
              strokeDasharray={`${perimeter * progress} ${perimeter}`}
              transform={`rotate(-90 ${shown.x} ${shown.y})`}
            />
          )}
          {focusPoint && <circle key={focusPoint.key} className="scanner-focus" cx={focusPoint.x} cy={focusPoint.y} r="28" />}
        </svg>
      )}

      {(phase === 'matching' || phase === 'results') && photo && (
        <div className="scanner-result">
          <img className={phase === 'matching' ? 'is-matching' : undefined} src={photo} alt={t('scanPhoto')} />
          {phase === 'results' && results.length > 0 && (
            <ul className="scanner-matches">
              {results.map(({ ref, score }) => {
                const d = describe(ref)
                return (
                  <li key={ref.image}>
                    <button onClick={() => pick(ref)}>
                      <img src={asset(ref.image)} alt="" />
                      <span className="scanner-match-text">
                        <span className="scanner-match-title">{d.title}</span>
                        <span className="scanner-match-sub">{d.sub}</span>
                      </span>
                      <span className={score < SURE_SCORE ? 'scanner-percent is-unsure' : 'scanner-percent'}>
                        {percent.format(concordance(score))}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Fonction en test : signalée comme telle. */}
      <span className="scanner-trial">{t('trialVersion')}</span>

      <button ref={closeRef} className="icon-button scanner-close" onClick={onClose} aria-label={t('close')}>
        <CloseIcon />
      </button>

      <div className="scanner-bottom">
        <p className="scanner-hint" role="status">
          {message}
        </p>
        {phase === 'scanning' && (
          <>
            <div className="scanner-modes" role="radiogroup" aria-label={t('scanMode')}>
              {(['auto', 'manual'] as const).map((value) => (
                <button key={value} role="radio" aria-checked={mode === value} onClick={() => chooseMode(value)}>
                  {value === 'auto' ? t('scanAuto') : t('scanManual')}
                </button>
              ))}
            </div>
            <button className="scanner-shutter" onClick={shoot} aria-label={t('scanCapture')} />
          </>
        )}
        {(phase === 'results' || phase === 'matching') && (
          <button className="scanner-retake" onClick={retake}>
            {t('scanRetake')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
