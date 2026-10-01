import raw from './data/coins.json'

export type DenominationId = '1c' | '2c' | '5c' | '10c' | '20c' | '50c' | '1e' | '2e'

export interface Denomination {
  id: DenominationId
  label: string
}

export interface Series {
  index: number
  since: number | null
  note: string | null
  coins: Partial<Record<DenominationId, string>>
  changed: DenominationId[]
}

export interface Country {
  iso: string
  numeric: string
  name: string
  euroSince: number
  description: string[]
  series: Series[]
}

export interface CommemorativeCoin {
  year: number
  country: string
  joint: boolean
  title: string
  description: string
  /** Tirage (pièces émises) d'après la BCE ; null si non chiffré (émissions communes). */
  mintage: number | null
  image: string | null
}

interface CoinData {
  source: string
  generatedAt: string
  denominations: Denomination[]
  countries: Country[]
  commemorative: CommemorativeCoin[]
}

export const data = raw as CoinData

export const countriesByIso = new Map(data.countries.map((c) => [c.iso, c]))
export const countriesByNumeric = new Map(data.countries.map((c) => [c.numeric, c]))

export function commemorativeFor(iso: string): CommemorativeCoin[] {
  return data.commemorative.filter((c) => c.country === iso)
}

// Chemins d'images relatifs à la base Vite (utile si le site est servi dans un sous-dossier).
export const asset = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, '')

// Valeur faciale → nombre + unité (libellé traduit) et diamètre réel en mm (taille à l'échelle).
const DENOMINATION_VALUES: Record<DenominationId, { n: number; unit: 'cent' | 'euro'; diameter: number }> = {
  '1c': { n: 1, unit: 'cent', diameter: 16.25 },
  '2c': { n: 2, unit: 'cent', diameter: 18.75 },
  '5c': { n: 5, unit: 'cent', diameter: 21.25 },
  '10c': { n: 10, unit: 'cent', diameter: 19.75 },
  '20c': { n: 20, unit: 'cent', diameter: 22.25 },
  '50c': { n: 50, unit: 'cent', diameter: 24.25 },
  '1e': { n: 1, unit: 'euro', diameter: 23.25 },
  '2e': { n: 2, unit: 'euro', diameter: 25.75 },
}

/** Diamètre relatif à la plus grande pièce (2 €), entre 0 et 1. */
export const relativeDiameter = (id: DenominationId) => DENOMINATION_VALUES[id].diameter / 25.75

export function denominationValue(id: DenominationId) {
  return DENOMINATION_VALUES[id]
}

/** Dernière série du pays (celle en circulation). */
export function latestSeries(country: Country): Series | undefined {
  return country.series[country.series.length - 1]
}
