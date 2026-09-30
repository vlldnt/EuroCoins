// Utilitaires communs aux scripts qui lisent le site de la BCE
// (fetch-coins.mjs : images + coins.json, fetch-texts.mjs : textes traduits).

import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const ECB = 'https://www.ecb.europa.eu'
export const FIRST_COMM_YEAR = 2004

// ---------- texte ----------

const ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', bdquo: '„', sbquo: '‚', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
  hellip: '…', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  aacute: 'á', atilde: 'ã', aring: 'å', ccedil: 'ç', iacute: 'í', igrave: 'ì', icirc: 'î',
  iuml: 'ï', ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
  oslash: 'ø', uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', auml: 'ä', yacute: 'ý',
  szlig: 'ß', scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž',
  Eacute: 'É', Egrave: 'È', Aacute: 'Á', Agrave: 'À', Auml: 'Ä', Ccedil: 'Ç', Iacute: 'Í',
  Oacute: 'Ó', Ouml: 'Ö', Uacute: 'Ú', Uuml: 'Ü', oelig: 'œ', euro: '€', deg: '°', shy: '',
  middot: '·', times: '×', ordm: 'º', ordf: 'ª', copy: '©', reg: '®', trade: '™', prime: '′',
}

export function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
}

// HTML → texte brut, un paragraphe par ligne.
export function text(html) {
  return decode(
    html
      .replace(/<\/p>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

// ---------- réseau ----------

// Télécharge une page ; null si elle n'existe pas. Réessaie sur 503/429 et erreurs réseau.
export async function fetchText(url, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res.text()
      if ((res.status !== 503 && res.status !== 429) || attempt >= retries) return null
    } catch (err) {
      if (attempt >= retries) throw err
    }
    await sleep(1000 * (attempt + 1))
  }
}

// Exécute fn sur chaque élément avec au plus `concurrency` appels simultanés.
export async function pool(items, concurrency, fn) {
  const results = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const k = i++
      results[k] = await fn(items[k], k)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// ---------- pages BCE ----------

export const regularUrl = (slug, lang = 'fr') => `${ECB}/euro/coins/${slug}/html/index.${lang}.html`
export const commUrl = (year, lang = 'fr') => `${ECB}/euro/coins/comm/html/comm_${year}.${lang}.html`

// Découpe une page BCE en « box » (une par pays / par pièce).
// `html` = contenu brut de la box (sans le h3), utile pour repérer les libellés en gras.
export function parseBoxes(html) {
  return html
    .split(/<div class="box"[^>]*>/)
    .slice(1)
    .map((chunk) => {
      const images = [...chunk.matchAll(/<img src="([^"]+)"/g)].map((m) => decode(m[1]))
      const h3 = chunk.match(/<h3>([\s\S]*?)<\/h3>/)
      const content = chunk.match(/<div class="content-box">([\s\S]*?)(?:<a href|<\/div>\s*<\/div>)/)
      const raw = content ? content[1].replace(/<h3>[\s\S]*?<\/h3>/, '') : ''
      return {
        images: images.filter((src) => !src.startsWith('/shared/') && !src.includes('coin_bg')),
        title: h3 ? text(h3[1]) : '',
        body: text(raw),
        html: raw,
      }
    })
    .filter((b) => b.images.length > 0)
}

// Chemin d'image d'une série courante : /img/{codeBCE}/{fichier}
export function regularImage(src) {
  const m = src.match(/\/img\/([a-z]{2})\/([^/]+)$/)
  return m ? { ecb: m[1], file: m[2] } : null
}

// Visuel annoncé mais pas encore publié par la BCE.
export const isPlaceholder = (src) => /placeholder|coming_soon/i.test(src)

// Nom de fichier local (avant conversion WebP) d'une pièce commémorative.
export const commFile = (iso, src) => `${iso}-${path.basename(src).replace(/[^a-zA-Z0-9._-]+/g, '_')}`

// Nom WebP final : minuscules, extension remplacée.
export const webpName = (file) => path.basename(file).replace(/\.[a-z]+$/i, '').toLowerCase() + '.webp'
