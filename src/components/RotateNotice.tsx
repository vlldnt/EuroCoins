import { useEffect } from 'react'
import { useI18n } from '../i18n'

// Téléphone (petit écran tactile) = mode portrait uniquement ; tablette et ordinateur : libres.
const isPhone = () =>
  window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600

/**
 * Sur téléphone, le site est conçu pour le portrait.
 * - Application installée (Android) : l'orientation est verrouillée en portrait.
 * - Ailleurs (navigateur, iPhone, qui ne permettent pas le verrouillage) : en paysage, un écran invite
 *   à tourner le téléphone. Il est affiché par la CSS (voir .rotate-notice dans index.css).
 */
export function RotateNotice() {
  const { t } = useI18n()

  useEffect(() => {
    if (!isPhone()) return
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    // Ne fonctionne qu'en plein écran / application installée : l'échec est normal ailleurs.
    orientation?.lock?.('portrait').catch(() => {})
  }, [])

  return (
    <div className="rotate-notice" role="alert" aria-live="assertive">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="20" y="8" width="24" height="44" rx="4" />
        <path d="M29 46h6" />
        <path d="M50 22a18 18 0 0 1 0 20M54 38l-4 4-4-4" />
      </svg>
      <p>{t('rotatePhone')}</p>
    </div>
  )
}
