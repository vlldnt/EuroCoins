// Reconnaissance d'une pièce par comparaison avec les pièces connues, sans IA.
//
// Chaque pièce est « déroulée » en anneaux concentriques (coordonnées polaires) : RINGS anneaux de
// ANGLES points, mesurant l'intensité des contours du relief (gradient), plus stable que la couleur
// face aux éclairages. Une pièce tournée donne le même déroulé décalé : la comparaison essaie tous
// les décalages et garde le meilleur (corrélation). L'anneau extérieur (les 12 étoiles, communes à
// toutes les faces nationales) est laissé de côté.
//
// Fichier sans import : utilisé aussi par scripts/build-signatures.mjs (Node).

export const RINGS = 16
export const ANGLES = 64
// Portion du rayon couverte par les anneaux.
const INNER = 0.08
const OUTER = 0.8

/** Niveaux de gris d'une image RGBA (fond transparent compté comme blanc). */
export function grayOf(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const a = rgba[j + 3] / 255
    gray[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a)
  }
  return gray
}

/** Intensité des contours (Sobel) après un léger flou 3 × 3 : à calculer une fois par image. */
export function edges(gray: Float32Array, w: number, h: number): Float32Array {
  const blur = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * w + x + dx]
      blur[y * w + x] = s / 9
    }
  }
  const mag = new Float32Array(w * h)
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      const gx = blur[i - w + 1] + 2 * blur[i + 1] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - 1] - blur[i + w - 1]
      const gy = blur[i + w - 1] + 2 * blur[i + w] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - w] - blur[i - w + 1]
      // Racine : les contours très marqués (bord, reflets) ne dominent pas tout le reste.
      mag[i] = Math.sqrt(Math.hypot(gx, gy))
    }
  }
  return mag
}

function bilinear(img: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 0
  const x0 = x | 0
  const y0 = y | 0
  const fx = x - x0
  const fy = y - y0
  const i = y0 * w + x0
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy
}

/**
 * Déroulé d'une pièce de centre (cx, cy) et de rayon `radius` (en pixels de l'image), normalisé
 * (moyenne 0, écart type 1) : RINGS × ANGLES valeurs, anneau par anneau.
 */
export function polarSignature(gray: Float32Array, w: number, h: number, cx: number, cy: number, radius: number) {
  return polarOfEdges(edges(gray, w, h), w, h, cx, cy, radius)
}

function polarOfEdges(mag: Float32Array, w: number, h: number, cx: number, cy: number, radius: number) {
  const sig = new Float32Array(RINGS * ANGLES)
  for (let ring = 0; ring < RINGS; ring++) {
    for (let a = 0; a < ANGLES; a++) {
      // Moyenne de 3 × 2 points par case : un peu de flou, moins sensible au cadrage.
      let s = 0
      for (let k = 0; k < 3; k++) {
        const r = radius * (INNER + ((OUTER - INNER) * (ring + (k + 0.5) / 3)) / RINGS)
        for (let m = 0; m < 2; m++) {
          const angle = ((a + (m + 0.5) / 2) / ANGLES) * Math.PI * 2
          s += bilinear(mag, w, h, cx + r * Math.cos(angle), cy + r * Math.sin(angle))
        }
      }
      sig[ring * ANGLES + a] = s / 6
    }
  }
  return normalize(sig)
}

function normalize(sig: Float32Array): Float32Array {
  let mean = 0
  for (const v of sig) mean += v
  mean /= sig.length
  let variance = 0
  for (const v of sig) variance += (v - mean) ** 2
  const std = Math.sqrt(variance / sig.length) || 1
  for (let i = 0; i < sig.length; i++) sig[i] = (sig[i] - mean) / std
  return sig
}

// Stockage compact : un octet par valeur (écarts types de −4 à +4).
export function quantize(sig: Float32Array): Uint8Array {
  const out = new Uint8Array(sig.length)
  for (let i = 0; i < sig.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((sig[i] + 4) * 32)))
  return out
}

export function dequantize(bytes: Uint8Array): Float32Array {
  const sig = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) sig[i] = bytes[i] / 32 - 4
  return normalize(sig)
}

/** Ressemblance de deux déroulés (corrélation, de −1 à 1) pour la meilleure rotation. */
export function similarity(query: Float32Array, ref: Float32Array): number {
  let best = -Infinity
  for (let shift = 0; shift < ANGLES; shift++) {
    let s = 0
    for (let ring = 0; ring < RINGS; ring++) {
      const base = ring * ANGLES
      for (let a = 0; a < ANGLES; a++) s += query[base + a] * ref[base + ((a + shift) & (ANGLES - 1))]
    }
    if (s > best) best = s
  }
  return best / (RINGS * ANGLES)
}

export interface Match {
  /** Rang de la pièce dans la liste des signatures. */
  index: number
  score: number
}

/**
 * Pièces connues les plus ressemblantes. En deux temps : tri rapide de toutes les pièces sur le
 * cercle donné (3 rayons), puis les meilleures candidates sont recomparées en décalant un peu le
 * centre et le rayon, pour rattraper l'imprécision du cercle détecté.
 */
export function rankMatches(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  refs: Float32Array[],
  shortlist = 40,
): Match[] {
  const mag = edges(gray, w, h)
  const best = new Float32Array(refs.length).fill(-1)
  for (const f of [0.95, 1, 1.05]) {
    const q = polarOfEdges(mag, w, h, cx, cy, radius * f)
    for (let j = 0; j < refs.length; j++) best[j] = Math.max(best[j], similarity(q, refs[j]))
  }
  const candidates = [...best.keys()].sort((a, b) => best[b] - best[a]).slice(0, shortlist)
  for (const dx of [-0.03, 0, 0.03]) {
    for (const dy of [-0.03, 0, 0.03]) {
      for (const f of [0.92, 0.96, 1, 1.04, 1.08]) {
        if (dx === 0 && dy === 0 && (f === 0.96 || f === 1.04)) continue
        const q = polarOfEdges(mag, w, h, cx + dx * radius, cy + dy * radius, radius * f)
        for (const j of candidates) best[j] = Math.max(best[j], similarity(q, refs[j]))
      }
    }
  }
  return candidates.map((index) => ({ index, score: best[index] })).sort((a, b) => b.score - a.score)
}
