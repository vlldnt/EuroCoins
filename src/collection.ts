import { useSyncExternalStore } from 'react'
import { commemorativeFor, data, type CommemorativeCoin, type Country, type Series } from './data'
import { mintagesFor } from './mintages'
import { slugify } from './routes'

// Collection de l'utilisateur : la liste des pièces qu'il possède, gardée dans le navigateur.
// Trois familles d'identifiants :
//   pièce courante d'une série   « fr/s1/2e »    (pays / série / valeur)
//   pièce courante d'une année   « fr/2003/2e »  (pays / millésime / valeur)
//   2 € commémorative            « c/2012/<fichier de l'image> »
// Deux séries d'un même pays sont toujours distinctes, même quand un dessin n'a pas changé.

/** Onglets de la page, et filtre des pièces affichées. */
export type CollectionTab = 'summary' | 'regular' | 'comm'
export type CollectionFilter = 'all' | 'missing' | 'owned'

/** Suivi des pièces courantes : une case par série, ou une case par année. */
export type CollectionMode = 'series' | 'years'

export const DENOMINATION_IDS = data.denominations.map((d) => d.id)

export const seriesKey = (iso: string, index: number) => `${iso}/s${index}`
export const yearKey = (iso: string, year: number) => `${iso}/${year}`

export function commId(coin: CommemorativeCoin): string {
  const file = coin.image?.split('/').pop()?.replace(/\.\w+$/, '')
  return `c/${coin.year}/${file ?? `${coin.country}-${slugify(coin.title)}`}`
}

export interface SeriesRow {
  series: Series
  key: string
  ids: string[]
}

export interface YearRow {
  year: number
  key: string
  /** Une case par valeur faciale ; null quand la pièce n'a pas été frappée cette année-là. */
  cells: (string | null)[]
  ids: string[]
}

export interface CommEntry {
  coin: CommemorativeCoin
  id: string
}

export interface CountryCatalog {
  country: Country
  series: SeriesRow[]
  years: YearRow[]
  comm: CommEntry[]
}

/** Série en circulation une année donnée : la dernière dont l'année de début est connue et atteinte. */
export function seriesOfYear(country: Country, year: number): Series {
  let found = country.series[0]
  for (const s of country.series) if (s.since !== null && s.since <= year) found = s
  return found
}

// Un millésime coché vaut aussi pour sa série : « fr/2003/2e » entraîne « fr/s1/2e ».
const impliedSeries = new Map<string, string>()

function yearRowsOf(country: Country): YearRow[] {
  const byDenomination = mintagesFor(country.iso)
  const years = new Set<number>()
  for (const byYear of Object.values(byDenomination)) for (const y of Object.keys(byYear ?? {})) years.add(Number(y))
  const rows: YearRow[] = []
  for (const year of [...years].sort((a, b) => a - b)) {
    const key = yearKey(country.iso, year)
    const series = seriesOfYear(country, year)
    const cells = DENOMINATION_IDS.map((d) => {
      const m = byDenomination[d]?.[year]
      // Ni circulation ni coffret : pas de frappe.
      if (!m || (m[0] === 0 && !m[1])) return null
      const id = `${key}/${d}`
      if (series.coins[d]) impliedSeries.set(id, `${seriesKey(country.iso, series.index)}/${d}`)
      return id
    })
    const ids = cells.filter((id): id is string => id !== null)
    if (ids.length) rows.push({ year, key, cells, ids })
  }
  return rows
}

export const catalog: CountryCatalog[] = data.countries.map((country) => ({
  country,
  series: country.series.map((series) => {
    const key = seriesKey(country.iso, series.index)
    return { series, key, ids: DENOMINATION_IDS.filter((d) => series.coins[d]).map((d) => `${key}/${d}`) }
  }),
  years: yearRowsOf(country),
  comm: commemorativeFor(country.iso)
    .map((coin) => ({ coin, id: commId(coin) }))
    .sort((a, b) => a.coin.year - b.coin.year),
}))

/** Identifiants des pièces courantes d'un pays, selon le suivi choisi. */
export const regularIds = (entry: CountryCatalog, mode: CollectionMode) =>
  (mode === 'years' ? entry.years : entry.series).flatMap((row) => row.ids)

export const commIds = (entry: CountryCatalog) => entry.comm.map((c) => c.id)

/** Tous les identifiants connus : sert à écarter les lignes étrangères d'un fichier importé. */
export const validIds = new Set(catalog.flatMap((e) => [...regularIds(e, 'series'), ...regularIds(e, 'years'), ...commIds(e)]))

export const countOwned = (ids: readonly string[], owned: ReadonlySet<string>) =>
  ids.reduce((n, id) => n + (owned.has(id) ? 1 : 0), 0)

// ----- lien de partage -----
// La collection tient dans l'adresse : « 1s~fr8101_de0080~fr0320~fr1c ».
//   « 1 » version, « s » ou « y » suivi affiché (série / année), puis au besoin la vue d'arrivée
//   (onglet « r » courantes ou « c » commémoratives, filtre « m » manquantes ou « o » possédées),
//   puis trois parties séparées par « ~ » :
//   séries   pays + 2 chiffres hexadécimaux par série (un bit par valeur faciale) ;
//   années   pays + (année sur 2 chiffres depuis 1990 + 2 chiffres hexadécimaux), répété ;
//   2 €      pays + un bit par commémorative du pays, dans l'ordre chronologique.
// Tout est rangé par pays : une pièce ajoutée au catalogue ne décale pas les autres pays.

const YEAR_BASE = 1990
const byIso = new Map(catalog.map((entry) => [entry.country.iso, entry]))

const byteOf = (cells: (string | null)[], owned: ReadonlySet<string>) =>
  cells.reduce((bits, id, i) => (id && owned.has(id) ? bits | (1 << i) : bits), 0)
const hex2 = (n: number) => n.toString(16).padStart(2, '0')
const seriesCells = (row: SeriesRow) => DENOMINATION_IDS.map((d) => (row.series.coins[d] ? `${row.key}/${d}` : null))

/** Code de partage de la collection (lettres minuscules, chiffres, « ~ » et « _ »). */
export function encodeShare(owned: ReadonlySet<string>, mode: CollectionMode, tab: CollectionTab = 'summary', filter: CollectionFilter = 'all'): string {
  const series: string[] = []
  const years: string[] = []
  const comm: string[] = []
  for (const entry of catalog) {
    const { iso } = entry.country
    const bytes = entry.series.map((row) => byteOf(seriesCells(row), owned))
    if (bytes.some(Boolean)) series.push(iso + bytes.map(hex2).join(''))
    const perYear = entry.years
      .map((row) => [row.year, byteOf(row.cells, owned)] as const)
      .filter(([, bits]) => bits)
      .map(([year, bits]) => String(year - YEAR_BASE).padStart(2, '0') + hex2(bits))
    if (perYear.length) years.push(iso + perYear.join(''))
    let digits = ''
    for (let i = 0; i < entry.comm.length; i += 4) {
      digits += byteOf(entry.comm.slice(i, i + 4).map((c) => c.id), owned).toString(16)
    }
    digits = digits.replace(/0+$/, '')
    if (digits) comm.push(iso + digits)
  }
  const view = tab === 'summary' ? '' : (tab === 'comm' ? 'c' : 'r') + (filter === 'missing' ? 'm' : filter === 'owned' ? 'o' : '')
  return `1${mode === 'years' ? 'y' : 's'}${view}~${series.join('_')}~${years.join('_')}~${comm.join('_')}`
}

/** Collection portée par un lien de partage ; null si le code n'est pas lisible. */
export function decodeShare(
  code: string,
): { mode: CollectionMode; tab: CollectionTab; filter: CollectionFilter; ids: ReadonlySet<string> } | null {
  const match = /^1([sy])([rc]?)([mo]?)~([a-z0-9_]*)~([a-z0-9_]*)~([a-z0-9_]*)$/.exec(code)
  if (!match) return null
  const ids = new Set<string>()
  const read = (part: string, each: (entry: CountryCatalog, data: string) => void) => {
    for (const item of part.split('_')) {
      const entry = byIso.get(item.slice(0, 2))
      if (entry) each(entry, item.slice(2))
    }
  }
  const pick = (cells: (string | null)[], bits: number) =>
    cells.forEach((id, i) => {
      if (id && bits & (1 << i)) ids.add(id)
    })
  read(match[4], (entry, data) => entry.series.forEach((row, n) => pick(seriesCells(row), parseInt(data.slice(n * 2, n * 2 + 2), 16) || 0)))
  read(match[5], (entry, data) => {
    for (let i = 0; i + 4 <= data.length; i += 4) {
      const year = YEAR_BASE + Number(data.slice(i, i + 2))
      const row = entry.years.find((y) => y.year === year)
      if (row) pick(row.cells, parseInt(data.slice(i + 2, i + 4), 16) || 0)
    }
  })
  read(match[6], (entry, data) =>
    [...data].forEach((digit, n) => pick(entry.comm.slice(n * 4, n * 4 + 4).map((c) => c.id), parseInt(digit, 16) || 0)),
  )
  return {
    mode: match[1] === 'y' ? 'years' : 'series',
    tab: match[2] === 'r' ? 'regular' : match[2] === 'c' ? 'comm' : 'summary',
    filter: match[3] === 'm' ? 'missing' : match[3] === 'o' ? 'owned' : 'all',
    ids,
  }
}

// ----- stockage -----

const KEY = 'eurocoins.collection'
const MODE_KEY = 'eurocoins.collectionMode'

function load(): ReadonlySet<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => validIds.has(id as string)) : [])
  } catch {
    return new Set()
  }
}

let owned = load()
const listeners = new Set<() => void>()

function commit(next: ReadonlySet<string>, persist = true) {
  owned = next
  if (persist) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      // stockage indisponible (navigation privée…) : la collection vit le temps de la visite
    }
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Collection modifiée dans un autre onglet du navigateur.
  const onStorage = (e: StorageEvent) => e.key === KEY && commit(load(), false)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function add(target: Set<string>, ids: Iterable<string>) {
  for (const id of ids) {
    if (!validIds.has(id)) continue
    target.add(id)
    const series = impliedSeries.get(id)
    if (series) target.add(series)
  }
}

/** Coche ou décoche des pièces. */
export function setOwned(ids: Iterable<string>, value: boolean) {
  const next = new Set(owned)
  if (value) add(next, ids)
  else for (const id of ids) next.delete(id)
  commit(next)
}

/** Inverse une pièce d'après l'état du moment : deux appuis très rapprochés ne se marchent pas dessus. */
export function toggleOwned(id: string) {
  setOwned([id], !owned.has(id))
}

/** Remplace toute la collection (import d'un fichier, remise à zéro). */
export function replaceCollection(ids: Iterable<string>) {
  const next = new Set<string>()
  add(next, ids)
  commit(next)
}

export const currentCollection = () => owned

/** Pièces possédées ; le composant se met à jour à chaque changement. */
export function useCollection(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, currentCollection)
}

export function readCollectionMode(): CollectionMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'years' ? 'years' : 'series'
  } catch {
    return 'series'
  }
}

export function writeCollectionMode(mode: CollectionMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // stockage indisponible
  }
}
