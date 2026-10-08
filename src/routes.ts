import type { CommemorativeCoin, Country, DenominationId } from './data.ts'

// Adresses des pages : /fr/belgique/, /fr/belgique/2-euros/, /fr/belgique/2-euros-commemoratives/…
// Module sans dépendance au navigateur : il sert à l'appli (src/navigation.ts) et au script qui
// génère les pages statiques (scripts/build-pages.mjs), pour que les deux produisent les mêmes URL.

/** Langues qui ont de vraies pages (préfixe d'URL). Les autres gardent l'ancien lien « /#fr ». */
export const PAGE_LANGS = ['fr'] as const
export type PageLang = (typeof PAGE_LANGS)[number]

export type Route =
  | { kind: 'home' }
  /** Collection de l'utilisateur (pièces possédées et manquantes). */
  /** `shared` : code d'une collection reçue par lien (lecture seule), voir src/collection.ts. */
  | { kind: 'collection'; shared?: string }
  | { kind: 'country'; iso: string }
  /** Pièce courante : une valeur faciale d'une série du pays. */
  | { kind: 'coin'; iso: string; denomination: DenominationId; series: number }
  /** Onglet des commémoratives du pays. */
  | { kind: 'commList'; iso: string }
  | { kind: 'comm'; iso: string; coin: CommemorativeCoin }

// Mots des adresses, par langue.
const WORDS: Record<PageLang, { denominations: Record<DenominationId, string>; commemoratives: string; series: string; collection: string }> = {
  fr: {
    denominations: {
      '1c': '1-centime',
      '2c': '2-centimes',
      '5c': '5-centimes',
      '10c': '10-centimes',
      '20c': '20-centimes',
      '50c': '50-centimes',
      '1e': '1-euro',
      '2e': '2-euros',
    },
    commemoratives: '2-euros-commemoratives',
    series: 'serie',
    collection: 'collection',
  },
}

/** « 50e anniversaire du traité de Rome » → « 50e-anniversaire-du-traite-de-rome ». */
export function slugify(text: string): string {
  return text
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Coupe un slug trop long à la fin d'un mot.
function shorten(slug: string, max = 70): string {
  if (slug.length <= max) return slug
  const cut = slug.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf('-'), 20)).replace(/-+$/, '')
}

/** Langue de la page d'après son adresse (« /fr/… » → « fr »), null hors des pages par langue. */
export function pathLang(pathname: string, root = '/'): PageLang | null {
  if (!pathname.startsWith(root)) return null
  const first = pathname.slice(root.length).split('/')[0]
  return (PAGE_LANGS as readonly string[]).includes(first) ? (first as PageLang) : null
}

export interface RouteData {
  countries: Country[]
  commemorative: CommemorativeCoin[]
}

export type Routes = ReturnType<typeof createRoutes>

/** Table des adresses d'une langue. `root` = base du site (« / »). */
export function createRoutes(data: RouteData, lang: PageLang, root = '/') {
  const words = WORDS[lang]
  const base = `${root}${lang}/`
  const denominationIds = Object.keys(words.denominations) as DenominationId[]
  const denominationBySlug = new Map(denominationIds.map((id) => [words.denominations[id], id]))

  // Pays : slug tiré du nom de référence de coins.json (stable, indépendant du navigateur).
  const countrySlugs = new Map(data.countries.map((c) => [c.iso, slugify(c.name)]))
  const countryBySlug = new Map(data.countries.map((c) => [slugify(c.name), c]))

  // Commémoratives : « année-titre », unique dans le pays. Les pièces sans visuel n'ont pas de page.
  const commSlugs = new Map<CommemorativeCoin, string>()
  const commBySlug = new Map<string, CommemorativeCoin>()
  for (const coin of data.commemorative) {
    if (!coin.image || !countrySlugs.has(coin.country)) continue
    const wanted = shorten(`${coin.year}-${slugify(coin.title)}`)
    let slug = wanted
    for (let n = 2; commBySlug.has(`${coin.country}/${slug}`); n++) slug = `${wanted}-${n}`
    commSlugs.set(coin, slug)
    commBySlug.set(`${coin.country}/${slug}`, coin)
  }

  /** Série la plus récente du pays qui comporte cette valeur faciale. */
  function latestSeriesWith(country: Country, id: DenominationId): number | null {
    for (let i = country.series.length - 1; i >= 0; i--) if (country.series[i].coins[id]) return country.series[i].index
    return null
  }

  const countryPath = (iso: string) => `${base}${countrySlugs.get(iso)}/`

  /** Adresse d'une vue de l'appli. Une pièce d'une ancienne série porte « #serie-1 ». */
  function pathOf(route: Route): string {
    switch (route.kind) {
      case 'home':
        return base
      case 'collection':
        return `${base}${words.collection}/${route.shared ? `#${route.shared}` : ''}`
      case 'country':
        return countryPath(route.iso)
      case 'commList':
        return `${countryPath(route.iso)}${words.commemoratives}/`
      case 'comm': {
        const slug = commSlugs.get(route.coin)
        return slug ? `${countryPath(route.iso)}${words.commemoratives}/${slug}/` : `${countryPath(route.iso)}${words.commemoratives}/`
      }
      case 'coin': {
        const path = `${countryPath(route.iso)}${words.denominations[route.denomination]}/`
        const country = data.countries.find((c) => c.iso === route.iso)
        const latest = country && latestSeriesWith(country, route.denomination)
        return route.series === latest ? path : `${path}#${words.series}-${route.series}`
      }
    }
  }

  /** Vue de l'appli correspondant à une adresse ; null si ce n'est pas une page de l'appli. */
  function parse(pathname: string, hash = ''): Route | null {
    if (!pathname.startsWith(base)) return null
    let rest: string
    try {
      rest = decodeURIComponent(pathname.slice(base.length))
    } catch {
      return null
    }
    const [countrySlug, second, third, ...extra] = rest.split('/').filter(Boolean)
    if (extra.length) return null
    if (!countrySlug) return { kind: 'home' }
    if (countrySlug === words.collection && !second) return { kind: 'collection', shared: hash.slice(1) || undefined }
    const country = countryBySlug.get(countrySlug)
    if (!country) return null
    const iso = country.iso
    if (!second) return { kind: 'country', iso }
    if (second === words.commemoratives) {
      if (!third) return { kind: 'commList', iso }
      const coin = commBySlug.get(`${iso}/${third}`)
      return coin ? { kind: 'comm', iso, coin } : { kind: 'commList', iso }
    }
    const denomination = denominationBySlug.get(second)
    if (!denomination || third) return null
    const asked = Number(hash.replace(`#${words.series}-`, ''))
    const series = country.series.find((s) => s.index === asked && s.coins[denomination])?.index
      ?? latestSeriesWith(country, denomination)
    return series === null ? { kind: 'country', iso } : { kind: 'coin', iso, denomination, series }
  }

  return {
    lang,
    base,
    pathOf,
    parse,
    latestSeriesWith,
    hasCommPage: (coin: CommemorativeCoin) => commSlugs.has(coin),
    // Pages statiques, sans vue dans l'appli : une valeur faciale dans tous les pays, et les
    // commémoratives par année.
    denominationPath: (id: DenominationId) => `${base}${words.denominations[id]}/`,
    yearsPath: () => `${base}${words.commemoratives}/`,
    yearPath: (year: number) => `${base}${words.commemoratives}/${year}/`,
  }
}
