import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PreviewCard, type PreviewState } from './CoinPreviewCard'

export interface PreviewContent {
  image: string
  title: string
  text?: string
}

// Aperçu au survol d'une pièce : grande image + description du graphisme (textes BCE).
// Rendu dans <body> pour ne pas être coupé par le défilement du panneau.
export function useCoinPreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const timer = useRef<number>(undefined)

  const show = useCallback((content: PreviewContent, el: HTMLElement) => {
    window.clearTimeout(timer.current)
    // Petit délai : pas d'aperçu quand la souris ne fait que traverser la grille.
    timer.current = window.setTimeout(() => setPreview({ ...content, anchor: el.getBoundingClientRect() }), 120)
  }, [])

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setPreview(null)
  }, [])

  /** Props à poser sur le bouton d'une pièce. */
  const bind = useCallback(
    (content: PreviewContent) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(content, e.currentTarget),
      onMouseLeave: hide,
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(content, e.currentTarget),
      onBlur: hide,
      onClick: hide,
    }),
    [show, hide],
  )

  const node = preview ? createPortal(<PreviewCard preview={preview} />, document.body) : null
  return { bind, hide, node }
}
