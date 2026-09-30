import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

// Événement propre à Chrome / Edge / Android : permet d'ouvrir la fenêtre d'installation.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// iPhone / iPad dans Safari : pas d'API d'installation, on affiche la marche à suivre.
const isIosSafari = () => {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

// Bouton « Installer l'application » : une fois installé, le site s'ouvre en plein écran,
// sans barre d'adresse. Masqué si l'application est déjà installée ou si le navigateur ne le permet pas.
export function InstallButton() {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [ios] = useState(() => isIosSafari() && !isStandalone())
  const [hint, setHint] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPrompt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // La bulle d'aide iOS se ferme au clic extérieur ou avec Échap.
  useEffect(() => {
    if (!hint) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !rootRef.current?.contains(e.target as Node)) setHint(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [hint])

  if (!prompt && !ios) return null

  const install = async () => {
    if (prompt) {
      await prompt.prompt()
      await prompt.userChoice
      setPrompt(null)
    } else {
      setHint((h) => !h)
    }
  }

  return (
    <div className="install" ref={rootRef}>
      <button className="install-button" onClick={install} aria-expanded={ios ? hint : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
        </svg>
        <span className="install-label">{t('installApp')}</span>
      </button>
      {hint && (
        <p className="install-hint" role="status">
          {t('installIosHint')}
        </p>
      )}
    </div>
  )
}
