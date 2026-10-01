// Télécharge depuis le site de la BCE les faces nationales des pièces en euros
// (séries courantes + pièces commémoratives de 2 €), puis génère src/data/coins.json.
//
// Usage : npm run fetch-coins            (ne retélécharge pas les images existantes)
//         npm run fetch-coins -- --force (retélécharge tout)

import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { COUNTRIES, DENOMINATIONS } from './countries.mjs'
import {
  ECB, FIRST_COMM_YEAR, fetchText, norm, parseBoxes, regularImage, isPlaceholder, commFile, webpName,
  regularUrl, commUrl,
  parseMintage,
} from './ecb.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const DATA_FILE = path.join(ROOT, 'src', 'data', 'coins.json')
const FORCE = process.argv.includes('--force')

// ---------- utilitaires ----------

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const downloads = []
// Les images sont converties en WebP (540 px max) pour garder un dépôt léger.
function queueDownload(url, target) {
  const localPath = path.join(path.dirname(target), webpName(target))
  downloads.push({ url, localPath })
  return '/' + path.relative(PUBLIC_DIR, localPath).split(path.sep).join('/')
}

async function runDownloads(concurrency = 8) {
  let i = 0
  let done = 0
  let failed = 0
  async function worker() {
    while (i < downloads.length) {
      const { url, localPath } = downloads[i++]
      if (!FORCE && (await exists(localPath))) {
        done++
        continue
      }
      const res = await fetch(new URL(url).href)
      if (!res.ok) {
        failed++
        console.warn(`  ✗ ${res.status} ${url}`)
        continue
      }
      await mkdir(path.dirname(localPath), { recursive: true })
      const webp = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize({ width: 540, height: 540, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
      await writeFile(localPath, webp)
      done++
      if (done % 50 === 0) console.log(`  … ${done}/${downloads.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { done, failed }
}

const byEcb = new Map(COUNTRIES.map((c) => [c.ecb, c]))
const byFrName = new Map()
for (const c of COUNTRIES) for (const n of [c.fr, ...(c.aliases ?? [])]) byFrName.set(norm(n), c)

function countryFromFilename(file) {
  const base = path.basename(file)
  const prefix = base.match(/^([A-Z]{2})[-_]/)
  if (prefix) {
    const c = byEcb.get(prefix[1].toLowerCase()) ?? COUNTRIES.find((x) => x.iso === prefix[1].toLowerCase())
    if (c) return c
  }
  const n = norm(base)
  return COUNTRIES.find((c) => n.includes(norm(c.en)))
}

// ---------- séries courantes ----------

async function fetchRegular() {
  // iso -> denomination -> images dans l'ordre chronologique de la BCE
  const byDenom = {}
  const descriptions = {}
  for (const d of DENOMINATIONS) {
    const url = regularUrl(d.slug)
    const html = await fetchText(url)
    if (!html) throw new Error(`Page introuvable : ${url}`)
    const boxes = parseBoxes(html)
    console.log(`${d.label} : ${boxes.length} pays`)
    for (const box of boxes) {
      for (const src of box.images) {
        const m = regularImage(src)
        if (!m) continue
        const country = byEcb.get(m.ecb)
        if (!country) {
          console.warn(`  ? pays inconnu pour ${src}`)
          continue
        }
        const file = m.file
        const image = queueDownload(ECB + src, path.join(PUBLIC_DIR, 'coins', 'regular', country.iso, file))
        byDenom[country.iso] ??= {}
        ;(byDenom[country.iso][d.id] ??= []).push({ image, file })
        descriptions[country.iso] ??= []
        if (box.body && !descriptions[country.iso].includes(box.body)) descriptions[country.iso].push(box.body)
      }
    }
  }

  // La BCE liste les versions d'une valeur faciale de la plus ancienne à la plus récente :
  // la n-ième image correspond à la n-ième série. Une valeur faciale inchangée reprend
  // l'image de la série précédente.
  const series = {}
  for (const c of COUNTRIES) {
    const denoms = byDenom[c.iso] ?? {}
    const count = Math.max(0, ...Object.values(denoms).map((list) => list.length))
    series[c.iso] = Array.from({ length: count }, (_, i) => {
      const coins = {}
      const changed = []
      const years = []
      const notes = new Set()
      for (const d of DENOMINATIONS) {
        const list = denoms[d.id]
        if (!list) continue
        const entry = list[Math.min(i, list.length - 1)]
        coins[d.id] = entry.image
        if (i === 0 || i < list.length) {
          changed.push(d.id)
          const y = entry.file.match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/)
          if (y) years.push(Number(y[1]))
          if (/sede ?vacante/i.test(entry.file)) notes.add('Sede vacante')
        }
      }
      const since = i === 0 ? c.euroSince : years.length ? Math.max(c.euroSince, Math.min(...years)) : null
      return { index: i + 1, since, note: [...notes][0] ?? null, coins, changed }
    })
  }
  return { series, descriptions }
}

// ---------- pièces commémoratives ----------

async function fetchCommemorative() {
  const coins = []
  const currentYear = new Date().getFullYear()
  for (let year = FIRST_COMM_YEAR; year <= currentYear + 1; year++) {
    const pageUrl = commUrl(year)
    const html = await fetchText(pageUrl)
    if (!html) {
      console.log(`${year} : pas de page`)
      continue
    }
    const boxes = parseBoxes(html)
    let count = 0
    for (const box of boxes) {
      const boxCountry = byFrName.get(norm(box.title))
      const joint = !boxCountry && box.images.length > 1
      for (const src of box.images) {
        const country = boxCountry ?? countryFromFilename(src)
        if (!country) {
          if (!joint) console.warn(`  ? ${year} pays inconnu : « ${box.title} » ${src}`)
          continue
        }
        const abs = new URL(src, pageUrl).href
        const [first, ...rest] = box.body.split('\n')
        const coin = {
          year,
          country: country.iso,
          joint,
          title: (first ?? '').replace(/^Dessin commémoratif\s*:\s*/i, ''),
          description: rest.join('\n'),
          // Tirage (nombre de pièces émises) ; null pour les émissions communes (« variable »).
          mintage: parseMintage(rest.join('\n')),
          image: null,
        }
        // Pièce annoncée mais visuel pas encore publié par la BCE.
        if (isPlaceholder(src)) {
          coins.push(coin)
          count++
          continue
        }
        const file = commFile(country.iso, src)
        coin.image = queueDownload(abs, path.join(PUBLIC_DIR, 'coins', 'commemorative', String(year), file))
        coins.push(coin)
        count++
      }
    }
    console.log(`${year} : ${count} pièces commémoratives`)
  }
  return coins
}

// ---------- main ----------

const { series, descriptions } = await fetchRegular()
const commemorative = await fetchCommemorative()

console.log(`Téléchargement de ${downloads.length} images…`)
const { done, failed } = await runDownloads()
console.log(`Images : ${done} OK, ${failed} en échec`)

const data = {
  source: 'Banque centrale européenne — https://www.ecb.europa.eu/euro/coins/',
  generatedAt: new Date().toISOString(),
  denominations: DENOMINATIONS.map(({ id, label }) => ({ id, label })),
  countries: COUNTRIES.map(({ iso, numeric, fr, euroSince }) => ({
    iso,
    numeric,
    name: fr,
    euroSince,
    description: descriptions[iso] ?? [],
    series: series[iso],
  })),
  commemorative,
}

await mkdir(path.dirname(DATA_FILE), { recursive: true })
await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
console.log(`Données écrites dans ${path.relative(ROOT, DATA_FILE)}`)
