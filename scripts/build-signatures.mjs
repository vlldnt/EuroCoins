// Calcule le « déroulé » (signature) de chaque pièce connue, pour la reconnaissance par photo.
// Lit src/data/coins.json et les images de public/coins/, écrit :
//   public/coins/signatures.json : réglages et liste des images, dans l'ordre des signatures ;
//   public/coins/signatures.bin  : les signatures à la suite (RINGS × ANGLES octets chacune).
// À relancer après fetch-coins (npm run build-signatures).

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { ANGLES, RINGS, grayOf, polarSignature, quantize } from '../src/coinMatch.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SIZE = 160

const data = JSON.parse(await fs.readFile(path.join(ROOT, 'src/data/coins.json'), 'utf8'))
// Type de chaque image (2 €, 1 €, or, cuivre) : sert de filtre d'après les couleurs de la photo.
const metalOf = new Map()
for (const c of data.countries) {
  for (const s of c.series) {
    for (const [d, img] of Object.entries(s.coins)) {
      metalOf.set(img, d === '2e' ? 'euro2' : d === '1e' ? 'euro1' : ['10c', '20c', '50c'].includes(d) ? 'gold' : 'copper')
    }
  }
}
for (const c of data.commemorative) if (c.image) metalOf.set(c.image, 'euro2')
const images = [...metalOf.keys()]

// Pièce sur fond blanc : son cercle est le cadre des pixels non blancs.
function coinCircle(gray) {
  let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (gray[y * SIZE + x] < 235) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { cx: SIZE / 2, cy: SIZE / 2, r: SIZE / 2 }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: (maxX - minX + maxY - minY) / 4 }
}

const kept = []
const chunks = []
for (const image of images) {
  try {
    const { data: rgba } = await sharp(path.join(ROOT, 'public', image))
      .resize(SIZE, SIZE, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const gray = grayOf(rgba, SIZE, SIZE)
    const { cx, cy, r } = coinCircle(gray)
    chunks.push(quantize(polarSignature(gray, SIZE, SIZE, cx, cy, r)))
    kept.push(image)
  } catch (error) {
    console.warn(`Ignorée : ${image} (${error.message})`)
  }
}

await fs.writeFile(path.join(ROOT, 'public/coins/signatures.bin'), Buffer.concat(chunks))
await fs.writeFile(
  path.join(ROOT, 'public/coins/signatures.json'),
  JSON.stringify({ rings: RINGS, angles: ANGLES, images: kept, metals: kept.map((i) => metalOf.get(i)) }) + '\n',
)
console.log(`${kept.length} signatures (${(kept.length * RINGS * ANGLES / 1024).toFixed(0)} Ko).`)
