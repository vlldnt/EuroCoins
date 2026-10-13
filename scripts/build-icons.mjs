// Génère le logo et les icônes (onglet, écran d'accueil iPhone/Android, PWA) à partir de
// scripts/assets/logo.png (dessin sur fond blanc). Le fond blanc est retiré : le logo du site et
// de l'onglet est transparent, il se pose donc sur le fond clair ou sombre du thème. Les icônes
// d'écran d'accueil, que le téléphone n'affiche pas en transparence, gardent un fond blanc.
// Usage : npm run build-icons

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'scripts', 'assets', 'logo.png')
const PUBLIC = path.join(ROOT, 'public')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }
// PNG à palette : quatre à cinq fois plus léger, sans différence visible sur ce dessin.
const SMALL = { palette: true, quality: 90, effort: 10 }
// Écart au blanc (0 à 255) en dessous duquel un pixel relié au bord de l'image est du fond.
const NEAR_WHITE = 48

// Dessin détouré : le blanc relié aux bords devient transparent, les reflets clairs à l'intérieur
// du dessin sont conservés. Renvoie un PNG recadré au plus près du dessin.
async function cutout() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  // Écart au blanc : 0 pour du blanc pur, 255 pour une couleur franche ou du noir.
  const gap = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) gap[i] = 255 - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])

  // Fond : pixels presque blancs atteints depuis les bords de l'image.
  const back = new Uint8Array(w * h)
  const stack = []
  const visit = (i) => {
    if (!back[i] && gap[i] < NEAR_WHITE) {
      back[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    visit(x)
    visit((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    visit(y * w)
    visit(y * w + w - 1)
  }
  while (stack.length) {
    const i = stack.pop()
    const x = i % w
    if (x > 0) visit(i - 1)
    if (x < w - 1) visit(i + 1)
    if (i >= w) visit(i - w)
    if (i < (h - 1) * w) visit(i + w)
  }

  // Liseré : pixels du dessin qui touchent le fond (à deux pixels près), mélangés de blanc.
  const edge = new Uint8Array(w * h)
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (back[i]) continue
      search: for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (back[i + dy * w + dx]) {
            edge[i] = 1
            break search
          }
        }
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (!back[i] && !edge[i]) continue
    // Fond : le halo pâle s'efface en douceur. Liseré : on retire la part de blanc du mélange.
    const alpha = back[i] ? Math.max(0, (gap[i] - 6) / NEAR_WHITE) * 0.6 : Math.min(1, gap[i] / 150)
    data[i * 4 + 3] = Math.round(alpha * 255)
    if (alpha > 0) {
      const part = Math.max(alpha, gap[i] / 255)
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(255 - (255 - data[i * 4 + c]) / part)))
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ background: CLEAR, threshold: 20 }).png().toBuffer()
}

const LOGO = await cutout()

// Logo redimensionné, avec une marge (en fraction de la taille) et un fond éventuel.
async function icon(size, { padding = 0, background = CLEAR } = {}) {
  const inner = Math.round(size * (1 - 2 * padding))
  const logo = await sharp(LOGO).resize(inner, inner, { fit: 'contain', background: CLEAR }).toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
}

await mkdir(path.join(PUBLIC, 'icons'), { recursive: true })

const outputs = [
  // Onglet du navigateur
  ['favicon-32.png', (await icon(32)).png()],
  ['favicon-16.png', (await icon(16)).png()],
  // Logo de l'en-tête (affiché ~42 px, 2× et 3× pour les écrans haute densité)
  ['logo.webp', (await icon(128)).webp({ quality: 86 })],
  // Application installée
  ['icon-192.png', (await icon(192, { padding: 0.02 })).png(SMALL)],
  ['icon-512.png', (await icon(512, { padding: 0.02 })).png(SMALL)],
  // Android « maskable » : le logo doit tenir dans le cercle de sécurité central (80 %).
  ['maskable-512.png', (await icon(512, { padding: 0.14, background: WHITE })).png(SMALL)],
  // iOS n'affiche pas la transparence : fond plein.
  ['apple-touch-icon.png', (await icon(180, { padding: 0.06, background: WHITE })).png(SMALL)],
]

for (const [name, image] of outputs) {
  await image.toFile(path.join(PUBLIC, 'icons', name))
  console.log(`✓ icons/${name}`)
}
