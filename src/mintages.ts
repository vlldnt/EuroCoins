import raw from './data/mintages.json'
import type { DenominationId } from './data'

/**
 * Tirage d'une année : [circulation, coffrets].
 * circulation : 0 si l'année n'existe qu'en coffrets, null si le chiffre n'est pas communiqué.
 * coffrets : total BU + BE, null si inconnu ou inexistant.
 */
export type YearMintage = [number | null, number | null]

type CountryMintages = Partial<Record<DenominationId, Record<string, YearMintage>>>

interface MintageData {
  source: string
  generatedAt: string
  countries: Record<string, CountryMintages>
}

const mintages = raw as unknown as MintageData

export function mintagesFor(iso: string): CountryMintages {
  return mintages.countries[iso] ?? {}
}

/** Années couvertes (de la plus récente à la plus ancienne), toutes valeurs confondues. */
export function mintageYears(data: CountryMintages): number[] {
  const years = new Set<number>()
  for (const byYear of Object.values(data)) for (const y of Object.keys(byYear ?? {})) years.add(Number(y))
  return [...years].sort((a, b) => b - a)
}
