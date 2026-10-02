// Détection d'une pièce (un cercle) dans une image, sans IA : transformée de Hough « par gradient ».
// Chaque point de contour vote, le long de la direction de son gradient, pour les centres possibles ;
// le centre le plus voté est retenu, puis le rayon le plus fréquent autour de lui. Pensé pour une
// image réduite (~180 px de large) traitée plusieurs fois par seconde sur téléphone.

/** L'appareil peut-il servir à photographier une pièce ? Écran tactile et caméra accessible. */
export const canScanCoins = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches &&
  !!navigator.mediaDevices?.getUserMedia

export interface Circle {
  /** Centre et rayon en fraction de la largeur de l'image analysée (0 → 1). */
  x: number
  y: number
  r: number
  /** Part du contour du cercle effectivement présente dans l'image (0 → 1). */
  score: number
}

// Rayon cherché, en fraction du plus petit côté de l'image (petit minimum : téléphone tenu loin
// quand il ne fait pas la mise au point de près).
const MIN_RADIUS = 0.07
const MAX_RADIUS = 0.48
// Part minimale du contour retrouvée pour accepter le cercle.
const MIN_SCORE = 0.5

/** Niveaux de gris d'une image RGBA. */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  }
  return gray
}

// Flou par moyenne glissante (horizontal puis vertical) : atténue le grain et les petits reliefs.
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const size = radius * 2 + 1
  for (let y = 0; y < h; y++) {
    let sum = 0
    for (let x = -radius; x <= radius; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / size
      sum += src[y * w + Math.min(w - 1, x + radius + 1)] - src[y * w + Math.max(0, x - radius)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x]
    }
  }
  return out
}

export function detectCircle(gray: Float32Array, w: number, h: number): Circle | null {
  const img = boxBlur(boxBlur(gray, w, h, 1), w, h, 1)
  const minDim = Math.min(w, h)
  const rMin = Math.round(minDim * MIN_RADIUS)
  const rMax = Math.round(minDim * MAX_RADIUS)

  // Gradient de Sobel.
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const mag = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = img[i - w - 1], b = img[i - w], c = img[i - w + 1]
      const d = img[i - 1], f = img[i + 1]
      const g = img[i + w - 1], k = img[i + w], l = img[i + w + 1]
      const sx = c + 2 * f + l - a - 2 * d - g
      const sy = g + 2 * k + l - a - 2 * b - c
      gx[i] = sx
      gy[i] = sy
      mag[i] = Math.hypot(sx, sy)
    }
  }

  // Seuil adaptatif : les 12 % de points au gradient le plus fort (au moins un contraste net).
  const hist = new Uint32Array(256)
  let maxMag = 1
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxMag) maxMag = mag[i]
  for (let i = 0; i < mag.length; i++) hist[Math.min(255, Math.floor((mag[i] / maxMag) * 255))]++
  let count = 0
  let bin = 255
  while (bin > 0 && count < mag.length * 0.12) count += hist[bin--]
  const threshold = Math.max(40, (bin / 255) * maxMag)

  const edges: number[] = []
  for (let i = 0; i < mag.length; i++) if (mag[i] >= threshold) edges.push(i)
  if (edges.length < 20) return null

  // Votes pour le centre, des deux côtés du contour (pièce plus claire ou plus sombre que le fond).
  const acc = new Float32Array(w * h)
  for (const i of edges) {
    const x = i % w
    const y = (i - x) / w
    const dx = gx[i] / mag[i]
    const dy = gy[i] / mag[i]
    for (let r = rMin; r <= rMax; r++) {
      let cx = (x + dx * r + 0.5) | 0
      let cy = (y + dy * r + 0.5) | 0
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) acc[cy * w + cx]++
      cx = (x - dx * r + 0.5) | 0
      cy = (y - dy * r + 0.5) | 0
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) acc[cy * w + cx]++
    }
  }
  const smooth = boxBlur(acc, w, h, 1)
  let best = 0
  for (let i = 1; i < smooth.length; i++) if (smooth[i] > smooth[best]) best = i
  const cx = best % w
  const cy = (best - cx) / w

  // Rayon : distance au centre la plus fréquente parmi les contours orientés vers lui.
  const radii = new Float32Array(rMax + 2)
  for (const i of edges) {
    const x = i % w
    const y = (i - x) / w
    const vx = x - cx
    const vy = y - cy
    const dist = Math.hypot(vx, vy)
    if (dist < rMin || dist > rMax) continue
    const align = Math.abs((vx * gx[i] + vy * gy[i]) / (dist * mag[i]))
    if (align > 0.85) radii[Math.round(dist)] += align
  }
  let r = rMin
  for (let d = rMin; d <= rMax; d++) {
    const v = radii[d - 1] + radii[d] + radii[d + 1]
    if (v > radii[r - 1] + radii[r] + radii[r + 1]) r = d
  }

  // Score : part des points du cercle où l'on retrouve un contour orienté vers le centre.
  const steps = 72
  let hits = 0
  for (let s = 0; s < steps; s++) {
    const angle = (s / steps) * Math.PI * 2
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    for (let dr = -2; dr <= 2; dr++) {
      const x = Math.round(cx + ux * (r + dr))
      const y = Math.round(cy + uy * (r + dr))
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue
      const i = y * w + x
      if (mag[i] >= threshold * 0.6 && Math.abs((ux * gx[i] + uy * gy[i]) / mag[i]) > 0.7) {
        hits++
        break
      }
    }
  }
  const score = hits / steps
  if (score < MIN_SCORE) return null
  return { x: cx / w, y: cy / w, r: r / w, score }
}
