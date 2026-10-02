// Récupère sur Numista les tirages par année des pièces courantes (1 cent → 2 €) de chaque pays,
// puis génère src/data/mintages.json.
//
// Usage : npm run fetch-mintages              (réutilise les réponses en cache)
//         npm run fetch-mintages -- --refresh (réinterroge l'API)
//
// La clé API est lue dans .env (NUMISTA_API_KEY) : elle ne sert qu'ici, jamais dans le navigateur.
// Le quota Numista étant mensuel, chaque réponse est gardée dans scripts/.cache/numista/
// (non versionné) : relancer le script sans --refresh ne consomme aucune requête.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COUNTRIES } from './countries.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache', 'numista')
const DATA_FILE = path.join(ROOT, 'src', 'data', 'mintages.json')
const API = 'https://api.numista.com/v3'
const KEY = process.env.NUMISTA_API_KEY
const REFRESH = process.argv.includes('--refresh')
const DENOMINATIONS = ['1c', '2c', '5c', '10c', '20c', '50c', '1e', '2e']

// Code émetteur Numista de chaque pays (GET /issuers).
const NUMISTA_ISSUERS = {
  ad: 'andorre', at: 'autriche', be: 'belgique', bg: 'bulgarie', cy: 'chypre', de: 'allemagne',
  ee: 'estonie', es: 'espagne', fi: 'finlande', fr: 'france', gr: 'grece', hr: 'croatie',
  ie: 'irlande', it: 'italie', lt: 'lituanie', lu: 'luxembourg', lv: 'lettonie', mc: 'monaco',
  mt: 'malte', nl: 'pays-bas', pt: 'portugal', si: 'slovenie', sk: 'slovaquie', sm: 'saint-marin',
  va: 'vatican',
}

// Types d'objet Numista : « Pièces courantes », et « Pièces non circulantes » où Numista range
// certaines séries courantes frappées surtout pour les coffrets (1 € allemand ou français 2e carte,
// Monaco, Saint-Marin, Vatican…). Les commémoratives (type 2) sont exclues.
const STANDARD_CIRCULATION = 1
const NON_CIRCULATING = 3

// Parenthèses admises pour une pièce courante classée « non circulante » : seulement carte, type,
// portrait ou cannelures (« 2nd map », « 2nd type, 2nd portrait »…). Tout le reste (« Coloured »,
// « Grace Kelly », « hologram version »…) désigne une commémorative ou une variante de collection.
const PLAIN_VARIANT = /^((1st|2nd|3rd|\d+th) (map|type|portrait)|(fine|coarse) reeding)$/i

// Exceptions : 2 € « Sede vacante » de 2013 et 2025, commémoratives (la série courante Sede
// vacante est celle de 2005).
const EXCLUDED_TYPES = new Set([46032, 476025])

function isPlainRegular(title) {
  const parens = [...title.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  return parens.every((p) => p.split(/[,;] ?/).every((part) => PLAIN_VARIANT.test(part.trim())))
}

// Émissions réservées aux collectionneurs (coffrets BU, BE/Proof…) : comptées à part.
const COLLECTOR_ISSUE = /\b(set|sets|BU|proof|BE|FDC|coffret|coin ?card|starter|kit|brilliant)\b/i

// Titre anglais du type → valeur faciale (« 1 Euro Cent », « 20 Euro Cents (2nd map) », « 2 Euros »).
function denominationOf(title) {
  const m = /^(\d+) Euro(?: (Cents?)|s?\b)/i.exec(title.trim())
  if (!m) return null
  const id = m[1] + (m[2] ? 'c' : 'e')
  return DENOMINATIONS.includes(id) ? id : null
}

// ---------- accès à l'API (avec cache disque) ----------

let requests = 0

async function api(pathname, params = {}) {
  const query = new URLSearchParams({ lang: 'en', ...params }).toString()
  const cacheFile = path.join(CACHE_DIR, `${pathname.replace(/\W+/g, '_')}_${query.replace(/\W+/g, '_')}.json`)
  if (!REFRESH) {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8'))
    } catch {
      // pas encore en cache
    }
  }
  for (let attempt = 1; ; attempt++) {
    requests++
    const res = await fetch(`${API}${pathname}?${query}`, { headers: { 'Numista-API-Key': KEY } })
    if (res.status === 429 && attempt < 4) {
      // Trop de requêtes simultanées : on patiente puis on réessaie.
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      continue
    }
    if (!res.ok) throw new Error(`Numista ${res.status} sur ${pathname} : ${await res.text()}`)
    const json = await res.json()
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cacheFile, JSON.stringify(json))
    return json
  }
}

// ---------- traitement ----------

/** Types « pièces courantes » en euros d'un émetteur (valeur faciale déduite du titre anglais). */
async function euroTypes(issuer, euroSince) {
  const out = []
  const search = async (params, keep) => {
    for (let page = 1; ; page++) {
      const res = await api('/types', {
        issuer,
        date: `${Math.min(1999, euroSince)}-2100`,
        count: '100',
        page: String(page),
        ...params,
      })
      for (const t of res.types) {
        const denomination = denominationOf(t.title)
        if (denomination && keep(t.title) && !EXCLUDED_TYPES.has(t.id)) out.push({ id: t.id, title: t.title, denomination })
      }
      if (page * 100 >= res.count) return
    }
  }
  await search({ object_type: String(STANDARD_CIRCULATION) }, () => true)
  // Taille et poids couvrent les 8 valeurs (16,25 → 25,75 mm ; 2,3 → 8,5 g) : écarte l'essentiel
  // des pièces de collection en métal précieux et limite le nombre de pages.
  await search(
    { object_type: String(NON_CIRCULATING), q: 'euro', size: '16-26', weight: '2.2-8.6' },
    isPlainRegular,
  )
  return out
}

/**
 * Tirages d'une valeur faciale, par année : [circulation, collection].
 * Plusieurs types (changement de carte d'Europe) et plusieurs ateliers (A, D, F, G, J en Allemagne)
 * peuvent porter la même année : on additionne.
 * circulation : nombre, 0 si l'année n'existe qu'en coffrets, null si le tirage n'est pas communiqué.
 * collection : total BU + BE, null si inconnu ou inexistant.
 */
function addIssues(years, issues) {
  for (const issue of issues) {
    const year = issue.gregorian_year ?? issue.year
    if (!issue.is_dated || !year) continue
    const entry = (years[year] ??= { c: 0, cUnknown: false, s: null })
    if (issue.comment && COLLECTOR_ISSUE.test(issue.comment)) {
      if (issue.mintage != null) entry.s = (entry.s ?? 0) + issue.mintage
    } else if (issue.mintage != null) {
      entry.c += issue.mintage
    } else {
      entry.cUnknown = true
    }
  }
}

const finalize = ({ c, cUnknown, s }) => [c === 0 && cUnknown ? null : c, s]

async function main() {
  if (!KEY) {
    console.error('NUMISTA_API_KEY manquante : copiez .env.example en .env et renseignez la clé.')
    process.exit(1)
  }
  const countries = {}
  const missing = []
  for (const country of COUNTRIES) {
    const issuer = NUMISTA_ISSUERS[country.iso]
    const types = await euroTypes(issuer, country.euroSince)
    const byDenomination = {}
    for (const type of types) {
      const issues = await api(`/types/${type.id}/issues`)
      addIssues((byDenomination[type.denomination] ??= {}), issues)
    }
    // Rien avant 1999 (les pièces datées 1999-2001, frappées d'avance, sont gardées).
    const firstYear = Math.min(1999, country.euroSince)
    for (const years of Object.values(byDenomination)) {
      for (const [y, entry] of Object.entries(years)) {
        if (Number(y) < firstYear) delete years[y]
        else years[y] = finalize(entry)
      }
    }
    const absent = DENOMINATIONS.filter((d) => !byDenomination[d])
    if (absent.length) missing.push(`${country.iso} : ${absent.join(', ')}`)
    countries[country.iso] = byDenomination
    console.log(`${country.iso} : ${types.length} types (${requests} requêtes API au total)`)
  }

  const out = {
    source: 'Numista — https://numista.com',
    generatedAt: new Date().toISOString(),
    countries,
  }
  await writeFile(DATA_FILE, JSON.stringify(out, null, 1) + '\n')
  console.log(`\n→ ${path.relative(ROOT, DATA_FILE)} (${requests} requêtes API)`)
  if (missing.length) console.log(`Valeurs sans type Numista trouvé :\n  ${missing.join('\n  ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
