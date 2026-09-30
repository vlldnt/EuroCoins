// Génère le logo et les icônes (onglet, écran d'accueil iPhone/Android, PWA) à partir de
// scripts/assets/logo-source.png (pièce de 1 € dessinée, 1024 × 1024, fond transparent).
// Usage : npm run build-icons

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'scripts', 'assets', 'logo-source.png')
const PUBLIC = path.join(ROOT, 'public')
const DARK = { r: 14, g: 20, b: 36, alpha: 1 } // #0e1424, fond du thème sombre
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

// Logo redimensionné, avec une marge (en fraction de la taille) et un fond éventuel.
async function icon(size, { padding = 0, background = CLEAR } = {}) {
  const inner = Math.round(size * (1 - 2 * padding))
  const coin = await sharp(SOURCE).resize(inner, inner, { fit: 'contain', background: CLEAR }).toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: coin, gravity: 'center' }])
}

await mkdir(path.join(PUBLIC, 'icons'), { recursive: true })

const outputs = [
  // Onglet du navigateur
  ['favicon-32.png', (await icon(32)).png()],
  ['favicon-16.png', (await icon(16)).png()],
  // Logo de l'en-tête (affiché ~42 px, 2× pour les écrans haute densité)
  ['logo.webp', (await icon(96)).webp({ quality: 90 })],
  // Application installée
  ['icon-192.png', (await icon(192, { padding: 0.04 })).png()],
  ['icon-512.png', (await icon(512, { padding: 0.04 })).png()],
  // Android « maskable » : le logo doit tenir dans le cercle de sécurité central (80 %).
  ['maskable-512.png', (await icon(512, { padding: 0.18, background: DARK })).png()],
  // iOS n'affiche pas la transparence : fond plein.
  ['apple-touch-icon.png', (await icon(180, { padding: 0.1, background: DARK })).png()],
]

for (const [name, image] of outputs) {
  await image.toFile(path.join(PUBLIC, 'icons', name))
  console.log(`✓ icons/${name}`)
}
