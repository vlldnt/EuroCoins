// Banc d'essai de la reconnaissance par photo, sans vraies photos : chaque visuel connu est
// transformé en « photo » de synthèse (rotation, inclinaison, éclairage rasant, reflet, usure, flou,
// bruit, cercle détecté imprécis), puis reconnu parmi toutes les pièces. Mesure la part de pièces
// retrouvées en tête et dans les trois premières.
//
//   node scripts/bench-match.mjs            200 pièces tirées au hasard (toujours les mêmes)
//   node scripts/bench-match.mjs 400 7      400 pièces, autre tirage
//   node scripts/bench-match.mjs 100 1 2    niveau « extrême » seul (0, 1, 2 ou une combinaison)
//
// Trois niveaux : « facile » (photo propre), « difficile » (lumière rasante, usure, reflets) et
// « extrême » (il ne reste presque que le relief éclairé de côté, cadrage nettement faux : ce qui
// se rapproche le plus d'une vraie pièce, bien différente du visuel officiel).
// Les chiffres comparent deux versions du code entre elles ; ils ne prédisent pas le taux de
// réussite sur de vraies photos, plus variées que ces transformations.

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { dequantize, grayOf, polarSignature, quantize, rankMatches, similarity } from '../src/coinMatch.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const COUNT = Number(process.argv[2] ?? 200)
const SEED = Number(process.argv[3] ?? 1)
const REF = 160 // taille des visuels pour les signatures (comme build-signatures.mjs)
const SRC = 360 // taille du visuel dont on tire la photo
const OUT = 420 // taille de la photo de synthèse

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function loadGray(image, size) {
  const { data } = await sharp(path.join(ROOT, 'public', image)).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return grayOf(data, size, size)
}

// Pièce sur fond blanc : son cercle est le cadre des pixels non blancs.
function coinCircle(gray, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (gray[y * size + x] < 235) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { cx: size / 2, cy: size / 2, r: size / 2 }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: (maxX - minX + maxY - minY) / 4 }
}

function sample(img, size, x, y) {
  if (x < 0 || y < 0 || x >= size - 1 || y >= size - 1) return 255
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * size + x0
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + size] * (1 - fx) + img[i + size + 1] * fx) * fy
}

function blur(img, size, passes) {
  let a = img
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length)
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x
        b[i] = (a[i] * 4 + (a[i - 1] + a[i + 1] + a[i - size] + a[i + size]) * 2 + a[i - size - 1] + a[i - size + 1] + a[i + size - 1] + a[i + size + 1]) / 16
      }
    }
    a = b
  }
  return a
}

/** Photo de synthèse d'un visuel ; renvoie l'image et le cercle « détecté » (imprécis). */
function synth(src, circle, random, level) {
  // Diagnostic : BENCH=look (aspect extrême, cadrage parfait) ou BENCH=geo (aspect propre, cadrage extrême).
  const only = process.env.BENCH
  const hard = level >= 1 && only !== 'geo'
  const extreme = level >= 2 && only !== 'geo'
  const geo = only === 'look' ? 0 : level
  const u = (lo, hi) => lo + (hi - lo) * random()
  const angle = u(0, Math.PI * 2)
  // Inclinaison : la pièce est écrasée le long d'un axe (téléphone pas tout à fait à plat).
  const tiltAxis = u(0, Math.PI)
  const squeeze = geo >= 2 ? u(0.8, 0.97) : geo >= 1 ? u(0.86, 1) : only === 'look' ? 1 : u(0.95, 1)
  const R = OUT * u(0.33, 0.4)
  const ox = OUT / 2 + u(-8, 8), oy = OUT / 2 + u(-8, 8)
  const background = u(40, 200)
  const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(tiltAxis), st = Math.sin(tiltAxis)
  let img = new Float32Array(OUT * OUT)
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      // Photo → pièce : on annule l'écrasement, puis la rotation.
      let dx = (x - ox) / R, dy = (y - oy) / R
      const along = dx * ct + dy * st, across = (-dx * st + dy * ct) / squeeze
      dx = along * ct - across * st
      dy = along * st + across * ct
      const px = dx * ca + dy * sa, py = -dx * sa + dy * ca
      const d = Math.hypot(px, py)
      img[y * OUT + x] = d <= 1 ? sample(src, SRC, circle.cx + px * circle.r, circle.cy + py * circle.r) : background + u(-10, 10)
    }
  }
  if (hard) {
    // Usure : relief adouci. Lumière rasante : le relief s'ombre selon la direction de la lampe.
    const soft = blur(img, OUT, 3)
    const wear = extreme ? u(0.5, 0.85) : u(0.2, 0.6), light = u(0, Math.PI * 2), relief = extreme ? u(2, 4) : u(0.6, 1.6)
    // Extrême : les teintes du visuel disparaissent presque, seul le relief ombré reste.
    const albedo = extreme ? u(0.05, 0.25) : 0.6
    const lx = Math.cos(light), ly = Math.sin(light)
    const lit = new Float32Array(img.length)
    for (let y = 1; y < OUT - 1; y++) {
      for (let x = 1; x < OUT - 1; x++) {
        const i = y * OUT + x
        const base = img[i] * (1 - wear) + soft[i] * wear
        const slope = (soft[i + 1] - soft[i - 1]) * lx + (soft[i + OUT] - soft[i - OUT]) * ly
        lit[i] = base * albedo + (1 - albedo) * 150 + slope * relief * 3
      }
    }
    img = lit
  }
  // Éclairage inégal, reflet, contraste, flou de mise au point, bruit du capteur.
  const gx = u(-0.35, 0.35) * (hard ? 1.5 : 1), gy = u(-0.35, 0.35) * (hard ? 1.5 : 1)
  const sx = ox + u(-R, R) * 0.6, sy = oy + u(-R, R) * 0.6, sr = R * u(0.15, 0.4), sv = hard ? u(40, 140) : u(0, 40)
  const contrast = hard ? u(0.45, 0.9) : u(0.75, 1), offset = u(-20, 20)
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      const i = y * OUT + x
      const shade = 1 + (gx * (x - ox) + gy * (y - oy)) / R
      const glare = sv * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * sr * sr))
      img[i] = (img[i] - 128) * contrast * shade + 128 + offset + glare
    }
  }
  img = blur(img, OUT, extreme ? 2 + Math.floor(u(0, 3)) : hard ? 1 + Math.floor(u(0, 3)) : Math.floor(u(0, 2)))
  const noise = hard ? 9 : 4
  for (let i = 0; i < img.length; i++) img[i] = Math.max(0, Math.min(255, img[i] + (random() + random() + random() - 1.5) * noise))
  // Cercle détecté : un peu décentré, rayon un peu faux (la pièce inclinée n'est plus tout à fait ronde).
  const jitter = only === 'look' ? 0 : geo >= 2 ? 0.06 : geo >= 1 ? 0.035 : 0.02
  return { img, cx: ox + u(-jitter, jitter) * R, cy: oy + u(-jitter, jitter) * R, r: R * ((1 + squeeze) / 2) * (1 + u(-jitter, jitter)) }
}

const { images } = JSON.parse(await fs.readFile(path.join(ROOT, 'public/coins/signatures.json'), 'utf8'))
console.log(`Signatures de ${images.length} pièces…`)
const refs = []
for (const image of images) {
  const gray = await loadGray(image, REF)
  const c = coinCircle(gray, REF)
  refs.push(dequantize(quantize(polarSignature(gray, REF, REF, c.cx, c.cy, c.r))))
}

// Même dessin sous deux images (1, 2 et 5 cent d'une série…) : l'une vaut l'autre.
const sameDesign = (a, b) => a === b || similarity(refs[a], refs[b]) > 0.85

const random = rng(SEED)
const picked = [...images.keys()].sort(() => random() - 0.5).slice(0, COUNT)
const LEVELS = ['facile   ', 'difficile', 'extrême  ']
for (const level of (process.argv[4] ?? '012').split('').map(Number)) {
  let top1 = 0, top3 = 0, ms = 0
  for (const index of picked) {
    const src = await loadGray(images[index], SRC)
    const photo = synth(src, coinCircle(src, SRC), random, level)
    const start = performance.now()
    const ranked = rankMatches(photo.img, OUT, OUT, photo.cx, photo.cy, photo.r, refs)
    ms += performance.now() - start
    const rank = ranked.findIndex((m) => sameDesign(m.index, index))
    if (rank === 0) top1++
    if (rank >= 0 && rank < 3) top3++
  }
  const pct = (n) => `${((n / picked.length) * 100).toFixed(1)} %`
  console.log(`${LEVELS[level]} : en tête ${pct(top1)} · dans les 3 premières ${pct(top3)} · ${(ms / picked.length).toFixed(0)} ms par photo`)
}
