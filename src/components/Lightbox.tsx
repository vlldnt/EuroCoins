import { useEffect, useRef } from 'react'
import { asset } from '../data'
import { useI18n } from '../i18n'
import { Flag } from './Flag'

export interface ZoomItem {
  image: string
  caption: string
  /** Ce que représente la pièce (texte BCE). */
  text?: string
  /** Pays de la pièce : drapeau dans la légende. */
  iso?: string
}

interface Props {
  items: ZoomItem[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}

// Carrousel plein écran : flèches ←/→, Échap, boutons, miniatures et glissement au doigt.
export function Lightbox({ items, index, onIndex, onClose }: Props) {
  const { t } = useI18n()
  const item = items[index]
  const canNavigate = items.length > 1
  const thumbsRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<number | null>(null)

  // Focus : sur « Fermer » à l'ouverture, rendu à la pièce cliquée à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus({ preventScroll: true })
  }, [])

  // Piège à focus : Tab et Maj+Tab restent dans le carrousel (fenêtre modale).
  const onTrapKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const go = (delta: number) => onIndex((index + delta + items.length) % items.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length)
      else if (e.key === 'ArrowRight') onIndex((index + 1) % items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onIndex, onClose])

  // Garde la miniature active visible.
  useEffect(() => {
    thumbsRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  // Les clics dans le carrousel ne doivent pas le fermer.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      ref={dialogRef}
      className="lightbox"
      data-keep-panel
      onKeyDown={onTrapKey}
      role="dialog"
      aria-modal="true"
      aria-label={item.caption}
      onClick={onClose}
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return
        const dx = e.changedTouches[0].clientX - touchStart.current
        touchStart.current = null
        if (canNavigate && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="lightbox-stage">
        {canNavigate && (
          <button className="lightbox-nav" onClick={stop(() => go(-1))} aria-label={t('previousCoin')}>
            ‹
          </button>
        )}
        <figure onClick={(e) => e.stopPropagation()}>
          {/* key : relance l'animation de fondu à chaque changement de pièce */}
          <img key={item.image} src={asset(item.image)} alt={item.caption} />
          <figcaption>
            <span className="lightbox-caption">
              {item.iso && <Flag id={item.iso} />}
              {item.caption}
            </span>
            {item.text && <span className="lightbox-text">{item.text}</span>}
            {canNavigate && (
              <span className="lightbox-position" aria-hidden="true">
                {index + 1} / {items.length}
              </span>
            )}
          </figcaption>
        </figure>
        {/* Annonce vocale à chaque changement de pièce : « Pièce 3 sur 16 — France… ». */}
        <p className="visually-hidden" aria-live="polite">
          {canNavigate && `${t('coinPosition', { n: index + 1, total: items.length })} — `}
          {item.caption}
        </p>
        {canNavigate && (
          <button className="lightbox-nav" onClick={stop(() => go(1))} aria-label={t('nextCoin')}>
            ›
          </button>
        )}
      </div>

      {canNavigate && (
        <div className="lightbox-thumbs" ref={thumbsRef} onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => (
            <button
              key={it.image + i}
              aria-current={i === index}
              aria-label={it.caption}
              onClick={() => onIndex(i)}
            >
              <img src={asset(it.image)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <button ref={closeRef} className="lightbox-close" onClick={stop(onClose)} aria-label={t('close')}>
        ×
      </button>
    </div>
  )
}
