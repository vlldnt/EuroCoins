// Récupère sur le site de la BCE les textes traduits (descriptions des pays, titres et
// descriptions des pièces commémoratives) dans les langues de l'UE, et génère
// public/i18n/{langue}.json (format CoinTexts de src/i18n/index.tsx).
//
// Les pièces sont associées d'une langue à l'autre par leur image : les chemins d'images
// sont identiques sur toutes les versions linguistiques d'une page. Le pays d'une pièce
// commémorative est repris de src/data/coins.json (à générer d'abord avec fetch-coins).
//
// Usage : npm run fetch-texts             (toutes les langues)
//         npm run fetch-texts -- de en    (seulement certaines langues)

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COUNTRIES, DENOMINATIONS } from './countries.mjs'
import {
  fetchText, parseBoxes, pool, regularImage, isPlaceholder, commFile, webpName, text, regularUrl, commUrl,
} from './ecb.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_FILE = path.join(ROOT, 'src', 'data', 'coins.json')
const OUT_DIR = path.join(ROOT, 'public', 'i18n')
const LANGS = ['fr', 'en', 'de', 'nl', 'it', 'es', 'pt', 'el', 'fi', 'et', 'lv', 'lt', 'sk', 'sl', 'hr', 'mt', 'bg']
const CONCURRENCY = 4 // politesse envers le serveur de la BCE

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const langs = args.length ? LANGS.filter((l) => args.includes(l)) : LANGS

// ---------- correspondance image → pièce (depuis coins.json) ----------

const data = JSON.parse(await readFile(DATA_FILE, 'utf8'))
const byEcb = new Map(COUNTRIES.map((c) => [c.ecb, c]))

// Clé indépendante du pays : "{année}/{nom WebP sans le préfixe iso}".
// ex. /coins/commemorative/2024/lt-lithuania.webp → "2024/lithuania.webp"
const commKey = (year, file) => `${year}/${file.replace(/^[a-z]{2}-/, '')}`
const imagesByKey = new Map()
for (const coin of data.commemorative) {
  if (!coin.image) continue
  const key = commKey(coin.year, path.basename(coin.image))
  const list = imagesByKey.get(key) ?? []
  if (!list.includes(coin.image)) list.push(coin.image)
  imagesByKey.set(key, list)
}
const expected = [...new Set(data.commemorative.filter((c) => c.image).map((c) => c.image))]
const years = [...new Set(data.commemorative.map((c) => c.year))].sort()

// ---------- textes d'une box commémorative ----------

// Premier paragraphe = thème, précédé d'un libellé en gras (« Dessin commémoratif : »,
// « Commemorative design: »…) qu'on retire. Les paragraphes suivants forment la description.
function commTexts(box) {
  const [first = '', ...rest] = box.body.split('\n')
  let title = first
  const label = box.html.match(/^\s*(?:<(?!\/?(?:strong|b)\b)[^>]+>\s*)*<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i)
  if (label) {
    const labelText = text(label[2])
    const colon = first.indexOf(':')
    if (colon >= 0 && colon <= labelText.length + 2) title = first.slice(colon + 1).trim()
    // Libellé doublé par erreur sur certaines pages (ex. maltais 2015 : « Tema: Tema: … »).
    const label2 = first.slice(0, colon + 1)
    if (colon > 0 && title.startsWith(label2)) title = title.slice(label2.length).trim()
  }
  return { title, description: rest.join('\n') }
}

// Les textes BCE d'un pays répètent souvent la même introduction pour chaque valeur faciale
// (« Chaque valeur faciale française présente un graphisme différent… »). Pour décrire une pièce,
// on retire les paragraphes présents dans TOUS les textes du pays, s'il en reste d'autres.
function stripCommonParagraphs(regular) {
  const byCountry = new Map()
  for (const image of Object.keys(regular)) {
    const iso = image.split('/')[3]
    if (!byCountry.has(iso)) byCountry.set(iso, [])
    byCountry.get(iso).push(image)
  }
  for (const images of byCountry.values()) {
    const bodies = [...new Set(images.map((i) => regular[i]))]
    if (bodies.length < 2) continue
    const [first, ...others] = bodies.map((b) => b.split('\n'))
    const common = new Set(first.filter((p) => others.every((o) => o.includes(p))))
    for (const image of images) {
      const kept = regular[image].split('\n').filter((p) => !common.has(p))
      if (kept.length) regular[image] = kept.join('\n')
    }
  }
}

// ---------- une langue ----------

async function fetchLang(lang) {
  const countries = {}
  const regular = {} // image → description du graphisme de cette valeur faciale
  const commemorative = {}
  const missingPages = []
  const unknown = []

  const regularPages = await pool(DENOMINATIONS, CONCURRENCY, (d) => fetchText(regularUrl(d.slug, lang)))
  DENOMINATIONS.forEach((d, i) => {
    const html = regularPages[i]
    if (!html) return missingPages.push(d.slug)
    for (const box of parseBoxes(html)) {
      for (const src of box.images) {
        const m = regularImage(src)
        const country = m && byEcb.get(m.ecb)
        if (!country || !box.body) continue
        regular[`/coins/regular/${country.iso}/${webpName(m.file)}`] = box.body
        const list = (countries[country.iso] ??= { description: [] }).description
        if (!list.includes(box.body)) list.push(box.body)
      }
    }
  })

  const commPages = await pool(years, CONCURRENCY, (year) => fetchText(commUrl(year, lang)))
  years.forEach((year, i) => {
    const html = commPages[i]
    if (!html) return missingPages.push(`comm_${year}`)
    for (const box of parseBoxes(html)) {
      const texts = commTexts(box)
      // Box vide (certaines pages bulgares 2022) : pas de texte plutôt qu'un texte vide.
      if (!texts.title && !texts.description) continue
      for (const src of box.images) {
        if (isPlaceholder(src)) continue
        const images = imagesByKey.get(commKey(year, webpName(commFile('xx', src))))
        if (!images) {
          unknown.push(`${year} ${src}`)
          continue
        }
        // Une même image peut servir deux fois (ex. Monaco 2025) : on garde la première box.
        for (const image of images) commemorative[image] ??= texts
      }
    }
  })

  stripCommonParagraphs(regular)

  // Tri des pays dans l'ordre du référentiel pour des fichiers stables.
  const sorted = {}
  for (const c of COUNTRIES) if (countries[c.iso]) sorted[c.iso] = countries[c.iso]
  return { texts: { countries: sorted, regular, commemorative }, missingPages, unknown }
}

// ---------- main ----------

await mkdir(OUT_DIR, { recursive: true })
for (const lang of langs) {
  const { texts, missingPages, unknown } = await fetchLang(lang)
  const file = path.join(OUT_DIR, `${lang}.json`)
  const json = JSON.stringify(texts)
  await writeFile(file, json + '\n')

  const missing = expected.filter((img) => !texts.commemorative[img])
  const nCountries = Object.keys(texts.countries).length
  const pct = ((100 * (expected.length - missing.length)) / expected.length).toFixed(1)
  const leftover = [...new Set(json.match(/&[a-z]+;/gi) ?? [])]
  console.log(
    `${lang} : ${expected.length - missing.length}/${expected.length} commémoratives (${pct} %), ` +
      `${nCountries}/${COUNTRIES.length} pays, ${(json.length / 1024).toFixed(0)} Ko`
  )
  if (missingPages.length) console.log(`   pages absentes : ${missingPages.join(', ')}`)
  if (unknown.length) console.log(`   images inconnues de coins.json : ${unknown.join(', ')}`)
  if (leftover.length) console.log(`   entités non décodées : ${leftover.join(' ')}`)
  if (missing.length) console.log(`   sans texte : ${missing.join(', ')}`)
}
console.log(`Textes écrits dans ${path.relative(ROOT, OUT_DIR)}/ (${langs.length} langues)`)
