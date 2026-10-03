import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { APP_VERSION } from '../version'

const KEY = 'eurocoins.version'
// Durée d'affichage du message (ms).
const SHOWN_FOR = 5000

// Version vue au dernier lancement ; mémorise la version actuelle.
function previousVersion(): string | null {
  try {
    const seen = localStorage.getItem(KEY)
    localStorage.setItem(KEY, APP_VERSION)
    return seen
  } catch {
    return null
  }
}

/**
 * Message bref « EuroCoins mis à jour : v1.13 » après le rechargement automatique sur une nouvelle
 * version (voir autoUpdate.ts). Rien au tout premier lancement.
 */
export function UpdateToast() {
  const { t } = useI18n()
  const [show, setShow] = useState(() => {
    const seen = previousVersion()
    return seen !== null && seen !== APP_VERSION
  })

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), SHOWN_FOR)
    return () => clearTimeout(timer)
  }, [show])

  if (!show) return null
  return (
    <div className="update-toast" role="status" onClick={() => setShow(false)}>
      {t('updatedTo', { version: APP_VERSION })}
    </div>
  )
}
