// Reconnaissance d'une pièce par comparaison avec les pièces connues, sans IA.
//
// Chaque pièce est « déroulée » en anneaux concentriques (coordonnées polaires) : RINGS anneaux de
// ANGLES points, mesurant l'intensité des contours du relief (gradient), plus stable que la couleur
// face aux éclairages. Une pièce tournée donne le même déroulé décalé : la comparaison essaie tous
// les décalages et garde le meilleur (corrélation). L'anneau extérieur (les 12 étoiles, communes à
// toutes les faces nationales) est laissé de côté.
//
// Avant de comparer, le bord de la pièce est recherché sur la photo elle-même (fitRim) : le cercle
// fourni par la détection est souvent un peu décentré, et une pièce photographiée de biais est une
// ellipse. Le déroulé suit alors ce bord réel, ce qui annule l'essentiel de l'erreur de cadrage.
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

/**
 * Contour d'une pièce sur la photo : une ellipse de centre (cx, cy), de demi-axes `a` (dans la
 * direction `tilt`) et `b` (en travers). Un cercle a ses deux demi-axes égaux.
 */
export interface Rim {
  cx: number
  cy: number
  a: number
  b: number
  tilt: number
}

// Rayons explorés autour du cercle annoncé pour trouver le bord, et nombre de directions sondées.
const RIM_FROM = 0.84
const RIM_TO = 1.2
const RIM_RAYS = 96

/**
 * Bord réel de la pièce autour du cercle annoncé. Dans chaque direction, le bord est le contour
 * le plus marqué près du rayon attendu ; le rayon mesuré en fonction de la direction est ensuite
 * résumé par sa moyenne (rayon), son premier harmonique (décentrage) et son second (ellipse).
 * Les directions aberrantes (ombre, reflet, objet voisin) sont écartées. Si le résultat s'éloigne
 * trop du cercle annoncé, celui-ci est gardé tel quel.
 */
export function fitRim(mag: Float32Array, w: number, h: number, cx: number, cy: number, radius: number): Rim {
  const circle: Rim = { cx, cy, a: radius, b: radius, tilt: 0 }
  const steps = Math.max(24, Math.round(radius * (RIM_TO - RIM_FROM)))
  const found = new Float32Array(RIM_RAYS)
  for (let i = 0; i < RIM_RAYS; i++) {
    const angle = (i / RIM_RAYS) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    let best = 0
    let at = radius
    for (let k = 0; k <= steps; k++) {
      const r = radius * (RIM_FROM + ((RIM_TO - RIM_FROM) * k) / steps)
      // Contour moyenné sur trois points voisins le long du bord : moins sensible au bruit.
      const value =
        bilinear(mag, w, h, cx + r * cos, cy + r * sin) +
        0.5 * (bilinear(mag, w, h, cx + r * cos - 2 * sin, cy + r * sin + 2 * cos) + bilinear(mag, w, h, cx + r * cos + 2 * sin, cy + r * sin - 2 * cos))
      if (value > best) {
        best = value
        at = r
      }
    }
    found[i] = at
  }

  // Moindres carrés sur 1, cos, sin, cos 2θ, sin 2θ (base orthogonale sur des directions régulières),
  // trois passes : chacune ignore les directions trop éloignées de l'ajustement précédent.
  const keep = new Uint8Array(RIM_RAYS).fill(1)
  let fit = [radius, 0, 0, 0, 0]
  for (let pass = 0; pass < 3; pass++) {
    const sums = [0, 0, 0, 0, 0]
    let n = 0
    for (let i = 0; i < RIM_RAYS; i++) {
      if (!keep[i]) continue
      const angle = (i / RIM_RAYS) * Math.PI * 2
      n++
      sums[0] += found[i]
      sums[1] += found[i] * Math.cos(angle)
      sums[2] += found[i] * Math.sin(angle)
      sums[3] += found[i] * Math.cos(2 * angle)
      sums[4] += found[i] * Math.sin(2 * angle)
    }
    // Les directions écartées laissent des trous : on y remet la valeur de l'ajustement précédent,
    // ce qui garde la base orthogonale (pas de système à résoudre).
    for (let i = 0; i < RIM_RAYS; i++) {
      if (keep[i]) continue
      const angle = (i / RIM_RAYS) * Math.PI * 2
      const value = fit[0] + fit[1] * Math.cos(angle) + fit[2] * Math.sin(angle) + fit[3] * Math.cos(2 * angle) + fit[4] * Math.sin(2 * angle)
      sums[0] += value
      sums[1] += value * Math.cos(angle)
      sums[2] += value * Math.sin(angle)
      sums[3] += value * Math.cos(2 * angle)
      sums[4] += value * Math.sin(2 * angle)
    }
    if (n < RIM_RAYS / 2) return circle
    fit = [sums[0] / RIM_RAYS, (2 * sums[1]) / RIM_RAYS, (2 * sums[2]) / RIM_RAYS, (2 * sums[3]) / RIM_RAYS, (2 * sums[4]) / RIM_RAYS]
    // Écart de chaque direction à l'ajustement ; au-delà de 2,5 % du rayon (et de l'écart type), écartée.
    let spread = 0
    const gaps = new Float32Array(RIM_RAYS)
    for (let i = 0; i < RIM_RAYS; i++) {
      const angle = (i / RIM_RAYS) * Math.PI * 2
      gaps[i] = found[i] - (fit[0] + fit[1] * Math.cos(angle) + fit[2] * Math.sin(angle) + fit[3] * Math.cos(2 * angle) + fit[4] * Math.sin(2 * angle))
      spread += gaps[i] * gaps[i]
    }
    const limit = Math.max(0.025 * radius, 1.5 * Math.sqrt(spread / RIM_RAYS))
    for (let i = 0; i < RIM_RAYS; i++) keep[i] = Math.abs(gaps[i]) <= limit ? 1 : 0
  }

  const [mean, shiftX, shiftY, c2, s2] = fit
  const stretch = Math.hypot(c2, s2)
  // Garde-fous : décentrage, taille ou aplatissement invraisemblables.
  if (Math.hypot(shiftX, shiftY) > 0.15 * radius || Math.abs(mean / radius - 1) > 0.14 || stretch > 0.16 * radius) return circle
  return { cx: cx + shiftX, cy: cy + shiftY, a: mean + stretch, b: mean - stretch, tilt: Math.atan2(s2, c2) / 2 }
}

function polarOfEdges(mag: Float32Array, w: number, h: number, cx: number, cy: number, radius: number) {
  return polarOfRim(mag, w, h, { cx, cy, a: radius, b: radius, tilt: 0 })
}

/** Déroulé le long d'un contour (ellipse) : la pièce photographiée de biais est remise à plat. */
function polarOfRim(mag: Float32Array, w: number, h: number, rim: Rim, scale = 1) {
  const sig = new Float32Array(RINGS * ANGLES)
  const ct = Math.cos(rim.tilt)
  const st = Math.sin(rim.tilt)
  const a = rim.a * scale
  const b = rim.b * scale
  // Point de la pièce à plat (rayon 1) → point de la photo : étirement `a` le long de l'inclinaison, `b` en travers.
  const xx = a * ct * ct + b * st * st
  const xy = (a - b) * ct * st
  const yy = a * st * st + b * ct * ct
  for (let ring = 0; ring < RINGS; ring++) {
    for (let cell = 0; cell < ANGLES; cell++) {
      // Moyenne de 3 × 2 points par case : un peu de flou, moins sensible au cadrage.
      let s = 0
      for (let k = 0; k < 3; k++) {
        const r = INNER + ((OUTER - INNER) * (ring + (k + 0.5) / 3)) / RINGS
        for (let m = 0; m < 2; m++) {
          const angle = ((cell + (m + 0.5) / 2) / ANGLES) * Math.PI * 2
          const px = r * Math.cos(angle)
          const py = r * Math.sin(angle)
          s += bilinear(mag, w, h, rim.cx + xx * px + xy * py, rim.cy + xy * px + yy * py)
        }
      }
      sig[ring * ANGLES + cell] = s / 6
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
 * Pièces connues les plus ressemblantes. Le bord réel de la pièce est d'abord recherché autour du
 * cercle donné (fitRim). Puis, en deux temps : tri rapide de toutes les pièces sur ce bord
 * (3 tailles), et les meilleures candidates sont recomparées en décalant un peu le centre et la
 * taille, pour rattraper ce qui reste d'imprécision.
 */
export function rankMatches(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  refs: Float32Array[],
  /** Ajustement par pièce connue (type repéré sur la photo), ajouté au score. */
  bonus?: Float32Array,
  shortlist = 40,
): Match[] {
  const mag = edges(gray, w, h)
  const best = new Float32Array(refs.length).fill(-1)
  const rim = fitRim(mag, w, h, cx, cy, radius)
  radius = (rim.a + rim.b) / 2
  for (const f of [0.95, 1, 1.05]) {
    const q = polarOfRim(mag, w, h, rim, f)
    for (let j = 0; j < refs.length; j++) best[j] = Math.max(best[j], similarity(q, refs[j]))
  }
  const adjusted = (j: number) => best[j] + (bonus ? bonus[j] : 0)
  const candidates = [...best.keys()].sort((a, b) => adjusted(b) - adjusted(a)).slice(0, shortlist)
  for (const dx of [-0.03, 0, 0.03]) {
    for (const dy of [-0.03, 0, 0.03]) {
      for (const f of [0.92, 0.96, 1, 1.04, 1.08]) {
        if (dx === 0 && dy === 0 && (f === 0.96 || f === 1.04)) continue
        const q = polarOfRim(mag, w, h, { ...rim, cx: rim.cx + dx * radius, cy: rim.cy + dy * radius }, f)
        for (const j of candidates) best[j] = Math.max(best[j], similarity(q, refs[j]))
      }
    }
  }
  return candidates.map((index) => ({ index, score: adjusted(index) })).sort((a, b) => b.score - a.score)
}
