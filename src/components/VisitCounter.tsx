import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

const API = `${import.meta.env.BASE_URL}api/visits`
const HOUR = 60 * 60 * 1000
const LAST_KEY = 'eurocoins.lastVisit'
// Une visite ne compte qu'après quelques secondes de page visible (pas les préchargements).
const VISIBLE_DELAY = 3000

async function call(method: 'GET' | 'POST'): Promise<number | null> {
  try {
    const res = await fetch(API, {
      method,
      // En-tête propre au site : le serveur ignore les appels qui ne l'ont pas (scripts, robots).
      headers: method === 'POST' ? { 'X-EuroCoins': '1' } : undefined,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { count?: number }
    return typeof json.count === 'number' ? json.count : null
  } catch {
    return null
  }
}

function lastVisit(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0
  } catch {
    return 0
  }
}

function markVisit() {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()))
  } catch {
    // stockage indisponible : le serveur dédoublonne de toute façon (une fois par heure et par adresse)
  }
}

/**
 * Compteur de visites discret (« 128 », puis « 1,8 k », « 12 k », « 1,2 M »…).
 * Une visite = un visiteur par heure : signalée après 3 s de page visible, puis toutes les heures
 * tant que le site reste ouvert. Masqué si le service n'est pas joignable (développement local).
 */
export function VisitCounter() {
  const { t, lang } = useI18n()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const update = (value: number | null) => !cancelled && value !== null && setCount(value)

    const countVisit = () => {
      window.clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = window.setTimeout(async () => {
        if (Date.now() - lastVisit() < HOUR) return
        markVisit()
        update(await call('POST'))
      }, VISIBLE_DELAY)
    }

    call('GET').then(update)
    countVisit()
    document.addEventListener('visibilitychange', countVisit)
    const hourly = window.setInterval(countVisit, HOUR)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearInterval(hourly)
      document.removeEventListener('visibilitychange', countVisit)
    }
  }, [])

  if (count === null) return null

  const full = new Intl.NumberFormat(lang).format(count)
  const short = new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(count)
  const label = t('visits', { count: full })

  return (
    <span className="visit-count" title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span aria-hidden="true">{short}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
