// Type de pièce d'après ses couleurs : 2 € (centre doré, anneau argenté), 1 € (l'inverse) ou
// centimes (une seule teinte). Mesuré aux essais sur les 870 images connues, sous lumière neutre,
// chaude et froide : l'écart de « chaleur » entre anneau et centre repère les bimétalliques de façon
// fiable ; cuivre et or, eux, se confondent dès que la lumière est teintée et ne sont pas départagés.
//
// Fichier sans import : utilisé aussi par scripts/build-signatures.mjs (Node).

export type Metal = 'euro2' | 'euro1' | 'gold' | 'copper'

/** Type repéré sur une photo : 2 €, 1 €, centimes (une seule teinte) ou indécis (null). */
export type MetalGuess = 'euro2' | 'euro1' | 'single' | null

/** Couleurs du centre et de l'anneau d'une pièce de centre (cx, cy) et de rayon r (px). */
export function guessMetal(rgb: Uint8ClampedArray | Uint8Array, w: number, h: number, cx: number, cy: number, r: number, channels = 4): MetalGuess {
  const inner = [0, 0, 0, 0]
  const ring = [0, 0, 0, 0]
  const step = Math.max(1, Math.round(r / 60))
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, cy + r); y += step) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, cx + r); x += step) {
      const d = Math.hypot(x - cx, y - cy) / r
      const zone = d < 0.45 ? inner : d > 0.78 && d < 0.93 ? ring : null
      if (!zone) continue
      const i = (y * w + x) * channels
      const R = rgb[i], G = rgb[i + 1], B = rgb[i + 2]
      // Reflets et ombres franches : couleur non significative.
      if (Math.max(R, G, B) > 248 || Math.max(R, G, B) < 20) continue
      zone[0] += R
      zone[1] += G
      zone[2] += B
      zone[3]++
    }
  }
  if (inner[3] < 20 || ring[3] < 20) return null
  const warmth = (z: number[]) => (z[0] - z[2]) / (z[0] + z[1] + z[2] + 1)
  const diff = warmth(ring) - warmth(inner)
  if (diff <= -0.025) return 'euro2'
  if (diff >= 0.02) return 'euro1'
  // Centre et anneau de même teinte : centimes (cuivre ou or, indiscernables sous une lumière teintée).
  if (Math.abs(diff) < 0.008) return 'single'
  return null
}

/**
 * Ajustement du score d'une pièce connue selon le type repéré sur la photo : léger bonus si le type
 * concorde, pénalité sinon (forte entre 1 € et 2 €, plus prudente face aux centimes).
 */
export function metalBonus(guess: MetalGuess, ref: Metal): number {
  if (!guess) return 0
  const refGuess = ref === 'gold' || ref === 'copper' ? 'single' : ref
  if (guess === refGuess) return 0.05
  return guess === 'single' || refGuess === 'single' ? -0.08 : -0.15
}
