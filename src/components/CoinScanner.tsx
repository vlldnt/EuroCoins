import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { detectCircle, toGray, type Circle } from '../coinDetect'
import { useI18n } from '../i18n'
import { CloseIcon } from './CloseIcon'

// Largeur de l'image analysée : assez pour un cercle net, assez petite pour ~15 analyses/s.
const WORK_WIDTH = 180
// Intervalle minimal entre deux analyses (ms).
const ANALYSIS_INTERVAL = 60
// Nombre d'analyses consécutives où la pièce reste immobile avant la prise de vue automatique.
const STABLE_FRAMES = 10
// Analyses sans pièce tolérées avant de perdre la pièce suivie (reflet, flou passager).
const MAX_MISSES = 3
// Rayon du cercle-guide, en fraction du plus petit côté de l'écran.
const GUIDE_RADIUS = 0.32

type Phase = 'starting' | 'scanning' | 'captured' | 'error'

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

/**
 * Photographier une pièce : vue caméra plein écran, la pièce est repérée en direct (cercle) comme un
 * scanner de document repère une feuille ; quand elle reste immobile, la photo part seule. Le
 * résultat est la pièce recadrée en rond (la reconnaissance viendra s'y brancher).
 */
export function CoinScanner({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('starting')
  const [circle, setCircle] = useState<Circle | null>(null)
  const [progress, setProgress] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  // Taille affichée de la vidéo (w, h) et taille réelle du flux (vw, vh).
  const [box, setBox] = useState({ w: 0, h: 0, vw: 1, vh: 1 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Suivi : cercle lissé affiché, position de départ de l'immobilité, compteurs.
  const track = useRef({ circle: null as Circle | null, anchor: null as Circle | null, stable: 0, misses: 0 })

  // Caméra arrière, en bonne définition (la photo finale est prise dans le flux vidéo).
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
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

  // Photo : la pièce recadrée dans un carré, hors du disque rendu transparent.
  const capture = useCallback((coin: Circle) => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const vw = video.videoWidth
    const radius = coin.r * vw * 1.03
    const size = Math.min(900, Math.round(radius * 2))
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(video, coin.x * vw - radius, coin.y * vw - radius, radius * 2, radius * 2, 0, 0, size, size)
    navigator.vibrate?.(30)
    setPhoto(canvas.toDataURL('image/webp', 0.9))
    setPhase('captured')
  }, [])

  // Boucle d'analyse : image réduite → cercle → suivi (lissage, immobilité) → prise de vue auto.
  useEffect(() => {
    if (phase !== 'scanning') return
    const video = videoRef.current!
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let frame = 0
    let last = 0
    track.current = { circle: null, anchor: null, stable: 0, misses: 0 }

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
        }
      } else if (++tr.misses > MAX_MISSES) {
        tr.circle = null
        tr.anchor = null
        tr.stable = 0
      }
      setCircle(tr.circle)
      setProgress(Math.min(1, tr.stable / STABLE_FRAMES))
      if (tr.circle && tr.stable >= STABLE_FRAMES) {
        cancelAnimationFrame(frame)
        capture(tr.circle)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, capture])

  const retake = () => {
    setPhoto(null)
    setCircle(null)
    setProgress(0)
    setPhase('scanning')
  }

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
  // Cercle-guide exprimé dans l'image (même repère que la détection) : photo manuelle sans pièce repérée.
  const guide: Circle = {
    x: 0.5,
    y: vh / vw / 2,
    r: (GUIDE_RADIUS * Math.min(box.w, box.h)) / scale / vw,
    score: 0,
  }

  const hint =
    phase === 'error' ? t('scanCameraError') : phase === 'captured' ? t('scanCaptured') : circle ? t('scanHold') : t('scanHint')

  return createPortal(
    <div
      className={`scanner is-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('scanCoin')}
      data-keep-panel
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Ne ferme que la caméra, pas la fenêtre pays.
        e.stopPropagation()
        onClose()
      }}
    >
      <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />

      {phase === 'scanning' && box.w > 0 && (
        <svg className="scanner-overlay" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
          <path className="scanner-mask" d={hole} fillRule="evenodd" />
          <circle className={circle ? 'scanner-ring is-found' : 'scanner-ring'} cx={shown.x} cy={shown.y} r={shown.r} />
          {circle && (
            <circle
              className="scanner-progress"
              cx={shown.x}
              cy={shown.y}
              r={shown.r}
              strokeDasharray={`${perimeter * progress} ${perimeter}`}
              transform={`rotate(-90 ${shown.x} ${shown.y})`}
            />
          )}
        </svg>
      )}

      {phase === 'captured' && photo && (
        <div className="scanner-result">
          <img src={photo} alt={t('scanCaptured')} />
        </div>
      )}

      {/* Fonction en test : signalée comme telle. */}
      <span className="scanner-trial">{t('trialVersion')}</span>

      <button ref={closeRef} className="icon-button scanner-close" onClick={onClose} aria-label={t('close')}>
        <CloseIcon />
      </button>

      <div className="scanner-bottom">
        <p className="scanner-hint" role="status">
          {hint}
        </p>
        {phase === 'scanning' && (
          <button className="scanner-shutter" onClick={() => capture(track.current.circle ?? guide)} aria-label={t('scanCapture')} />
        )}
        {phase === 'captured' && (
          <button className="scanner-retake" onClick={retake}>
            {t('scanRetake')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
