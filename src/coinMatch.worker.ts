// Reconnaissance en arrière-plan : charge les signatures des pièces connues une fois, puis classe
// chaque photo reçue sans bloquer l'interface.
import { ANGLES, RINGS, dequantize, rankMatches, similarity } from './coinMatch'

export interface MatchRequest {
  /** Adresse de signatures.json (signatures.bin est à côté). */
  url?: string
  gray?: Float32Array
  w?: number
  h?: number
  cx?: number
  cy?: number
  r?: number
}

export interface MatchResponse {
  ready?: boolean
  /** twinOf : rang d'un résultat précédent au même dessin (1, 2 et 5 cent d'une série…). */
  results?: { image: string; score: number; twinOf?: number }[]
  error?: string
}

let loading: Promise<{ images: string[]; refs: Float32Array[] }> | null = null

async function load(url: string) {
  const index = (await (await fetch(url)).json()) as { images: string[] }
  const bin = new Uint8Array(await (await fetch(url.replace('signatures.json', 'signatures.bin'))).arrayBuffer())
  const n = RINGS * ANGLES
  const refs = index.images.map((_, i) => dequantize(bin.subarray(i * n, (i + 1) * n)))
  return { images: index.images, refs }
}

self.onmessage = async (e: MessageEvent<MatchRequest>) => {
  const req = e.data
  try {
    if (req.url) {
      loading ??= load(req.url)
      await loading
      self.postMessage({ ready: true } satisfies MatchResponse)
      return
    }
    const { images, refs } = await loading!
    const ranked = rankMatches(req.gray!, req.w!, req.h!, req.cx!, req.cy!, req.r!, refs).slice(0, 12)
    // Même dessin : déroulés des deux pièces de référence très ressemblants.
    const results = ranked.map((m, i) => {
      const twin = ranked.findIndex((o, j) => j < i && similarity(refs[o.index], refs[m.index]) > 0.5)
      return { image: images[m.index], score: m.score, twinOf: twin >= 0 ? twin : undefined }
    })
    self.postMessage({ results } satisfies MatchResponse)
  } catch (error) {
    self.postMessage({ error: String(error) } satisfies MatchResponse)
  }
}
