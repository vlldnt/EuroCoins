import type { CommemorativeCoin } from './data'

// Recherche rapide : chaque résultat porte une liste de mots normalisés ; une requête correspond si
// chacun de ses mots est le début (ou, à partir de 3 lettres, un morceau) d'un de ces mots.

/** Ce que la fenêtre pays doit montrer à l'ouverture depuis la recherche. */
export type PanelTarget =
  | { kind: 'country' }
  | { kind: 'series'; index: number }
  | { kind: 'comm'; coin: CommemorativeCoin }

export interface SearchEntry {
  id: string
  iso: string
  target: PanelTarget
  /** Mots normalisés sur lesquels porte la recherche. */
  words: string[]
  /** Ordre d'affichage à score égal : pays, puis séries, puis commémoratives récentes. */
  rank: number
}

/** Minuscules, sans accents ni ponctuation : « Notre-Dame » → « notre dame ». */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function wordsOf(...texts: (string | number | null | undefined)[]): string[] {
  const words = new Set<string>()
  for (const text of texts) {
    if (text === null || text === undefined || text === '') continue
    for (const w of normalize(String(text)).split(' ')) if (w) words.add(w)
  }
  return [...words]
}

// Score d'un mot de la requête : mot exact 3, début de mot 2, morceau de mot 1, absent 0.
function tokenScore(token: string, words: string[]): number {
  let best = 0
  for (const w of words) {
    if (w === token) return 3
    if (w.startsWith(token)) best = Math.max(best, 2)
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 1)
  }
  return best
}

// Petits mots (« de », « la », « en »…) : facultatifs, ils ne font qu'améliorer le score.
const isOptional = (token: string) => token.length <= 2 && !/\d/.test(token)

export function search(entries: SearchEntry[], query: string, limit = 40): SearchEntry[] {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return []
  const scored: { entry: SearchEntry; score: number }[] = []
  for (const entry of entries) {
    let score = 0
    let matched = true
    for (const token of tokens) {
      const s = tokenScore(token, entry.words)
      if (s === 0 && !isOptional(token)) {
        matched = false
        break
      }
      score += s
    }
    if (matched && score > 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.rank - b.entry.rank)
  return scored.slice(0, limit).map((s) => s.entry)
}
