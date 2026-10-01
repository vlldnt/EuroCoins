import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface View {
  k: number
  // Centre de la vue en coordonnées carte ; null = centre de la vue de base.
  cx: number | null
  cy: number | null
}

const MIN_ZOOM = 1
const MAX_ZOOM = 8
// Au-delà de ce déplacement (px), un appui devient un glisser et n'ouvre pas le pays touché.
const DRAG_THRESHOLD = 6

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Zoom et déplacement de la carte : molette, pincement (2 doigts), glisser (souris ou doigt)
 * et boutons. `base` = vue non zoomée, `limits` = zone dessinée qu'on ne doit pas quitter.
 */
export function useMapZoom(containerRef: React.RefObject<HTMLElement | null>, base: Rect, limits: Rect) {
  const [view, setView] = useState<View>({ k: 1, cx: null, cy: null })

  // Vue effective (viewBox) pour un état donné, bornée à la zone dessinée.
  const rectFor = useCallback(
    ({ k, cx, cy }: View): Rect => {
      const width = base.width / k
      const height = base.height / k
      const centerX = cx ?? base.x + base.width / 2
      const centerY = cy ?? base.y + base.height / 2
      const x =
        width >= limits.width
          ? limits.x + (limits.width - width) / 2
          : clamp(centerX - width / 2, limits.x, limits.x + limits.width - width)
      const y =
        height >= limits.height
          ? limits.y + (limits.height - height) / 2
          : clamp(centerY - height / 2, limits.y, limits.y + limits.height - height)
      return { x, y, width, height }
    },
    [base, limits],
  )

  const current = rectFor(view)
  // Dernier état connu, lu par les gestionnaires d'événements (mis à jour après chaque rendu).
  const latest = useRef({ rect: current, view })
  useLayoutEffect(() => {
    latest.current = { rect: current, view }
  })

  // Mouvements animés (boutons, clavier) : interpolation de la vue sur ~0,45 s.
  // Glisser, pincer et molette restent immédiats (ils suivent le doigt ou la souris).
  const animation = useRef(0)
  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(animation.current)
      const { rect, view: from } = latest.current
      const fromCx = from.cx ?? rect.x + rect.width / 2
      const fromCy = from.cy ?? rect.y + rect.height / 2
      const baseCx = base.x + base.width / 2
      const baseCy = base.y + base.height / 2
      const toCx = target.cx ?? baseCx
      const toCy = target.cy ?? baseCy
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden
      if (reduce) return setView(target)
      const start = performance.now()
      const duration = 450
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 // ease-in-out
        // Zoom interpolé en échelle logarithmique : mouvement régulier à l'œil.
        const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e)
        if (t < 1) {
          setView({ k, cx: fromCx + (toCx - fromCx) * e, cy: fromCy + (toCy - fromCy) * e })
          animation.current = requestAnimationFrame(step)
        } else {
          setView(target)
        }
      }
      animation.current = requestAnimationFrame(step)
    },
    [base],
  )

  const reset = useCallback(() => animateTo({ k: 1, cx: null, cy: null }), [animateTo])

  /** Zoome d'un facteur autour d'un point écran (par défaut le centre de la carte). */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number, animate = false) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      const { rect, view: v } = latest.current
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM)
      if (k === v.k) return
      const px = (clientX ?? box.left + box.width / 2) - box.left
      const py = (clientY ?? box.top + box.height / 2) - box.top
      // Point de la carte sous le curseur, qui doit y rester après le zoom.
      const mapX = rect.x + (px / box.width) * rect.width
      const mapY = rect.y + (py / box.height) * rect.height
      const width = base.width / k
      const height = base.height / k
      const x = mapX - (px / box.width) * width
      const y = mapY - (py / box.height) * height
      const next = k === 1 ? { k: 1, cx: null, cy: null } : { k, cx: x + width / 2, cy: y + height / 2 }
      if (animate) animateTo(next)
      else {
        cancelAnimationFrame(animation.current)
        setView(next)
      }
    },
    [base, containerRef, animateTo],
  )

  const panBy = useCallback(
    (dxPx: number, dyPx: number, animate = false) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      const { rect, view: v } = latest.current
      if (v.k === 1) return
      const scale = rect.width / box.width
      const next = { k: v.k, cx: rect.x + rect.width / 2 - dxPx * scale, cy: rect.y + rect.height / 2 - dyPx * scale }
      if (animate) animateTo(next)
      else {
        cancelAnimationFrame(animation.current)
        setView(next)
      }
    },
    [containerRef, animateTo],
  )


  // Molette : écouteur non passif pour empêcher le défilement de la page.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef, zoomAt])

  // Glisser / pincer avec les Pointer Events.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ travelled: 0, dragging: false, suppressClick: false })

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) gesture.current = { travelled: 0, dragging: false, suppressClick: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.entries()]
      const other = a[0] === e.pointerId ? b[1] : a[1]
      const before = Math.hypot(prev.x - other.x, prev.y - other.y)
      const after = Math.hypot(next.x - other.x, next.y - other.y)
      pointers.current.set(e.pointerId, next)
      if (before > 0) zoomAt(after / before, (next.x + other.x) / 2, (next.y + other.y) / 2)
      gesture.current.dragging = true
      gesture.current.suppressClick = true
      return
    }

    pointers.current.set(e.pointerId, next)
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    gesture.current.travelled += Math.hypot(dx, dy)
    if (!gesture.current.dragging && gesture.current.travelled > DRAG_THRESHOLD && latest.current.view.k > 1) {
      gesture.current.dragging = true
      gesture.current.suppressClick = true
      // Capture seulement une fois le glisser commencé : un simple appui reste un clic sur le pays.
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    }
    if (gesture.current.dragging) panBy(dx, dy)
  }

  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current.dragging = false
  }

  // Après un glisser ou un pincement, le clic qui suit ne doit pas sélectionner de pays.
  const onClickCapture = (e: React.MouseEvent) => {
    if (gesture.current.suppressClick) {
      e.stopPropagation()
      gesture.current.suppressClick = false
    }
  }

  return {
    viewBox: `${current.x} ${current.y} ${current.width} ${current.height}`,
    zoom: view.k,
    isDragging: () => gesture.current.dragging,
    panBy,
    zoomIn: () => zoomAt(1.6, undefined, undefined, true),
    zoomOut: () => zoomAt(1 / 1.6, undefined, undefined, true),
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
  }
}
