import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n, type Messages } from '../i18n'

// Événement propre à Chrome / Edge / Android : permet d'ouvrir la fenêtre d'installation native.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'android' | 'ios' | 'desktop'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

const PLATFORMS: { id: Platform; steps: keyof Messages }[] = [
  { id: 'android', steps: 'stepsAndroid' },
  { id: 'ios', steps: 'stepsIos' },
  { id: 'desktop', steps: 'stepsDesktop' },
]

const ICONS: Record<Platform, React.ReactNode> = {
  android: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  ),
  ios: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11M8 7l4-4 4 4" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  ),
  desktop: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
}

// Bouton « Installer l'application » + fenêtre d'aide : un onglet par plateforme (Android, iPhone /
// iPad, ordinateur), ouvert sur l'appareil détecté, et bouton d'installation directe quand le
// navigateur le permet. Masqué si l'application est déjà installée.
export function InstallButton() {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setPrompt(null)
      setInstalled(true)
      setOpen(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const installNow = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === 'accepted') setOpen(false)
  }

  return (
    <>
      <button className="install-button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
        </svg>
        <span className="install-label">{t('installApp')}</span>
      </button>
      {/* Rendue dans <body> : au-dessus de tout, hors du plan de l'en-tête. */}
      {open &&
        createPortal(
          <InstallGuide canInstall={!!prompt} onInstall={installNow} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  )
}

function InstallGuide({
  canInstall,
  onInstall,
  onClose,
}: {
  canInstall: boolean
  onInstall: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [platform, setPlatform] = useState<Platform>(detectPlatform)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const tabsId = useId()

  // Focus dans la fenêtre à l'ouverture, rendu au bouton à la fermeture ; Échap ferme.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus({ preventScroll: true })
    }
  }, [onClose])

  // Piège à focus : Tab et Maj+Tab restent dans la fenêtre.
  const onTrapKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusables = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), a[href]') ?? []),
    ]
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

  // Onglets ARIA : flèches gauche / droite.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = PLATFORMS.findIndex((p) => p.id === platform)
    const next =
      e.key === 'ArrowRight' ? PLATFORMS[(i + 1) % PLATFORMS.length]
      : e.key === 'ArrowLeft' ? PLATFORMS[(i - 1 + PLATFORMS.length) % PLATFORMS.length]
      : null
    if (!next) return
    e.preventDefault()
    setPlatform(next.id)
    document.getElementById(`${tabsId}-${next.id}`)?.focus()
  }

  const label = (p: Platform) => (p === 'android' ? 'Android' : p === 'ios' ? 'iPhone / iPad' : t('platformDesktop'))
  const steps = t(PLATFORMS.find((p) => p.id === platform)!.steps).split('|')

  return (
    <div className="install-backdrop" onClick={onClose} data-keep-panel>
      <div
        ref={dialogRef}
        className="install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onTrapKey}
      >
        <header className="install-dialog-header">
          <img src={`${import.meta.env.BASE_URL}icons/logo.webp`} alt="" width="44" height="44" />
          <div>
            <h2 id={titleId}>{t('installTitle')}</h2>
            <p>{t('installIntro')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}>
            ×
          </button>
        </header>

        {canInstall && (
          <button className="install-now" onClick={onInstall}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
            </svg>
            {t('installNow')}
          </button>
        )}

        <div className="install-tabs" role="tablist" onKeyDown={onTabKey}>
          {PLATFORMS.map(({ id }) => (
            <button
              key={id}
              id={`${tabsId}-${id}`}
              role="tab"
              aria-selected={platform === id}
              aria-controls={`${tabsId}-panel`}
              tabIndex={platform === id ? 0 : -1}
              onClick={() => setPlatform(id)}
            >
              {ICONS[id]}
              {label(id)}
            </button>
          ))}
        </div>

        <ol className="install-steps" id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${platform}`} key={platform}>
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}
