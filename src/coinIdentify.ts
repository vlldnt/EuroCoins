import { commemorativeFor, countriesByIso, type DenominationId } from './data'

// Reconnaissance d'une photo par un modèle de vision, en renfort de la comparaison locale
// (src/coinMatch.ts). Le modèle tourne derrière le service server/identify.py, qui garde la clé :
//   1. il lit la pièce (pays, valeur, année) ;
//   2. on en déduit les pièces possibles du catalogue ;
//   3. il compare la photo aux visuels de ces pièces et désigne la bonne.
// Service absent, quota atteint ou réponse illisible : null, et la reconnaissance locale fait foi.
// Pour l'instant réservé à l'administrateur : chaque requête porte son code PIN, vérifié par le
// service ; le code saisi est gardé dans ce navigateur.

const API = `${import.meta.env.BASE_URL}api/identify`
// Nombre de visuels comparés au plus (même borne que le service).
const MAX_CANDIDATES = 24
const PIN_KEY = 'eurocoins.aiPin'

function readPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY)
  } catch {
    return null
  }
}

function writePin(pin: string | null) {
  try {
    if (pin === null) localStorage.removeItem(PIN_KEY)
    else localStorage.setItem(PIN_KEY, pin)
  } catch {
    // stockage indisponible : le code ne sera pas retenu
  }
}

/** Un code PIN a-t-il été validé dans ce navigateur ? */
export const aiUnlocked = () => readPin() !== null

interface Reading {
  country: string | null
  value: DenominationId | null
  commemorative: boolean
  year: number | null
}

let enabled: Promise<boolean> | null = null

/** Le service de reconnaissance est-il installé et configuré ? (demandé une seule fois) */
export function aiEnabled(): Promise<boolean> {
  enabled ??= fetch(API)
    .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : null))
    .then((json) => json?.enabled === true)
    .catch(() => false)
  return enabled
}

async function post<T>(body: object, pin = readPin()): Promise<T | null> {
  if (!pin) return null
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-EuroCoins': '1', 'X-EuroCoins-Pin': pin },
    body: JSON.stringify(body),
  })
  // Code refusé (changé depuis) : il faudra le ressaisir.
  if (response.status === 401) writePin(null)
  return response.ok ? ((await response.json()) as T) : null
}

/** Vérifie un code PIN auprès du service ; juste, il est retenu dans ce navigateur. */
export async function unlockAi(pin: string): Promise<boolean> {
  const ok = (await post<{ ok?: boolean }>({ check: true }, pin).catch(() => null))?.ok === true
  if (ok) writePin(pin)
  return ok
}

/** Oublie le code PIN : retour à la reconnaissance locale seule. */
export const lockAi = () => writePin(null)

/** Pièces du catalogue compatibles avec ce que le modèle a lu, complétées par le classement local. */
function candidatesFor(reading: Reading, local: string[]): string[] {
  const images = new Set<string>()
  const country = reading.country ? countriesByIso.get(reading.country) : undefined
  if (country) {
    if (reading.value) for (const s of country.series) if (s.coins[reading.value]) images.add(s.coins[reading.value]!)
    // Commémoratives : toujours des 2 € ; celles de l'année lue d'abord, sinon toutes celles du pays.
    if (!reading.value || reading.value === '2e') {
      const coins = commemorativeFor(country.iso).filter((c) => c.image)
      const ofYear = coins.filter((c) => c.year === reading.year)
      for (const c of ofYear.length ? ofYear : coins.reverse()) images.add(c.image!)
    }
  }
  // Le classement local garde quelques places : le modèle a pu mal lire le pays.
  const kept = [...images].slice(0, MAX_CANDIDATES - Math.min(6, local.length))
  return [...new Set([...kept, ...local])].slice(0, MAX_CANDIDATES)
}

/**
 * Image du catalogue correspondant à la photo d'après le modèle, ou null.
 * `photo` : data URL de la pièce ; `local` : images classées par la comparaison locale.
 */
export async function identifyByAi(photo: string, local: string[]): Promise<string | null> {
  if (!aiUnlocked() || !(await aiEnabled())) return null
  const reading = await post<Reading>({ photo })
  if (!reading) return null
  const candidates = candidatesFor(reading, local)
  if (!candidates.length) return null
  const picked = await post<{ index: number | null }>({ photo, candidates })
  return picked?.index == null ? null : (candidates[picked.index] ?? null)
}
