import { useEffect, useState } from 'react'
import { aiEnabled, aiUnlocked, lockAi, unlockAi } from '../coinIdentify'
import { useI18n } from '../i18n'
import '../scanner-admin.css'

// Cadenas du scanner : la reconnaissance par modèle de vision est réservée à l'administrateur.
// Un code PIN, vérifié par le service, la débloque dans ce navigateur ; un nouvel appui la reverrouille.
// Rien n'est affiché tant que le service n'est pas installé.
export function ScannerAdmin() {
  const { t } = useI18n()
  const [available, setAvailable] = useState(false)
  const [unlocked, setUnlocked] = useState(aiUnlocked)
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void aiEnabled().then((enabled) => !cancelled && setAvailable(enabled))
    return () => {
      cancelled = true
    }
  }, [])

  if (!available) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    const ok = await unlockAi(pin)
    setBusy(false)
    setWrong(!ok)
    setPin('')
    if (ok) {
      setUnlocked(true)
      setOpen(false)
    }
  }

  const toggle = () => {
    if (unlocked) {
      lockAi()
      setUnlocked(false)
      return
    }
    setWrong(false)
    setOpen(!open)
  }

  return (
    <div className="scanner-admin">
      <button className="scanner-admin-toggle" aria-pressed={unlocked} aria-expanded={open} aria-label={t('scanAdmin')} title={t('scanAdmin')} onClick={toggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d={unlocked ? 'M8 11V7.5a4 4 0 0 1 7.6-1.7' : 'M8 11V7.5a4 4 0 0 1 8 0V11'} />
        </svg>
      </button>
      {open && !unlocked && (
        <form className="scanner-admin-form" onSubmit={submit}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            placeholder={t('scanPin')}
            aria-label={t('scanPin')}
            aria-invalid={wrong}
            onChange={(e) => setPin(e.target.value)}
          />
          <button type="submit" disabled={!pin || busy}>
            OK
          </button>
          {wrong && <p role="alert">{t('scanPinWrong')}</p>}
        </form>
      )}
    </div>
  )
}
