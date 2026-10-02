import { data, type CommemorativeCoin, type DenominationId } from './data'

// Retrouve la pièce (pays, série, valeur ou commémorative) correspondant à une image du site.
export type CoinRef =
  | { kind: 'regular'; iso: string; series: number; denominations: DenominationId[]; image: string }
  | { kind: 'comm'; iso: string; coin: CommemorativeCoin; image: string }

let byImage: Map<string, CoinRef> | null = null

export function coinOfImage(image: string): CoinRef | undefined {
  if (!byImage) {
    byImage = new Map()
    for (const country of data.countries) {
      for (const s of country.series) {
        for (const [id, img] of Object.entries(s.coins) as [DenominationId, string][]) {
          const known = byImage.get(img)
          // Une même image peut servir à plusieurs valeurs (1, 2 et 5 cent identiques…).
          if (known?.kind === 'regular') known.denominations.push(id)
          else byImage.set(img, { kind: 'regular', iso: country.iso, series: s.index, denominations: [id], image: img })
        }
      }
    }
    for (const c of data.commemorative) {
      if (c.image) byImage.set(c.image, { kind: 'comm', iso: c.country, coin: c, image: c.image })
    }
  }
  return byImage.get(image)
}
