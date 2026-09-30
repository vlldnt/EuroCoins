import { useLayoutEffect, useRef, useState } from 'react'
import { asset } from '../data'
import type { PreviewContent } from './useCoinPreview'
import { Flag } from './Flag'

export interface PreviewState extends PreviewContent {
  anchor: DOMRect
}

const GAP = 16
const MARGIN = 12

export function PreviewCard({ preview }: { preview: PreviewState }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Placement : à droite de la pièce, sinon à gauche ; toujours dans l'écran.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { anchor } = preview
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = anchor.right + GAP
    if (left + w > window.innerWidth - MARGIN) left = anchor.left - GAP - w
    left = Math.max(MARGIN, left)
    const top = Math.min(
      Math.max(MARGIN, anchor.top + anchor.height / 2 - h / 2),
      window.innerHeight - h - MARGIN,
    )
    setPos({ left, top })
  }, [preview])

  return (
    <div
      ref={ref}
      className="coin-preview"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      aria-hidden="true"
    >
      <div className="coin-preview-image">
        <img key={preview.image} src={asset(preview.image)} alt="" />
      </div>
      <strong className="coin-preview-title">
        {preview.iso && <Flag id={preview.iso} />}
        <span>{preview.title}</span>
      </strong>
      {preview.text &&
        preview.text.split('\n').map((p, i) => (
          <p key={i} className="coin-preview-text">
            {p}
          </p>
        ))}
    </div>
  )
}
