import type { CommemorativeCoin, Country, DenominationId } from './data.ts'
import type { Messages } from './i18n/locales/fr.ts'
import type { Route } from './routes.ts'

// Titre et description de chaque page (onglet du navigateur, résultats de recherche).
// Module sans dépendance au navigateur, partagé par l'appli (src/usePageMeta.ts) et par le script
// des pages statiques (scripts/build-pages.mjs) : la page servie et la page affichée disent pareil.

/** Accès aux textes dans la langue de la page. */
export interface MetaContext {
  t: (key: keyof Messages, vars?: Record<string, string | number>) => string
  countries: Country[]
  commemorative: CommemorativeCoin[]
  nameOf: (country: Country) => string
  commTitle: (coin: CommemorativeCoin) => string
  commDescription: (coin: CommemorativeCoin) => string
  /** Ce que représente une pièce courante, par chemin d'image ('' si inconnu). */
  regularDescription: (image: string) => string
}

export interface PageMeta {
  title: string
  description: string
}

const VALUES: Record<DenominationId, { n: number; unit: 'cent' | 'euro' }> = {
  '1c': { n: 1, unit: 'cent' },
  '2c': { n: 2, unit: 'cent' },
  '5c': { n: 5, unit: 'cent' },
  '10c': { n: 10, unit: 'cent' },
  '20c': { n: 20, unit: 'cent' },
  '50c': { n: 50, unit: 'cent' },
  '1e': { n: 1, unit: 'euro' },
  '2e': { n: 2, unit: 'euro' },
}

/** Valeur faciale telle qu'on la cherche (« 1 centime », « 2 euros »). */
export function valueLabel(t: MetaContext['t'], id: DenominationId): string {
  const { n, unit } = VALUES[id]
  if (unit === 'cent') return t(n === 1 ? 'centLocal' : 'centsLocal', { n })
  return t(n === 1 ? 'euro' : 'euros', { n })
}

/** Description du graphisme d'une commémorative : premier paragraphe, sans son libellé. */
export function designOf(description: string): string {
  const first = description.split('\n')[0] ?? ''
  const colon = first.indexOf(':')
  const text = colon > 0 && colon < 30 ? first.slice(colon + 1).trim() : first
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

/** Coupe un texte à la fin d'un mot (les moteurs de recherche tronquent vers 160 caractères). */
export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,;:.]+$/, '')}…`
}

export function pageMeta(route: Route, ctx: MetaContext): PageMeta {
  const { t } = ctx
  if (route.kind === 'home') return { title: t('seoHomeTitle'), description: t('seoHomeDescription') }
  if (route.kind === 'collection') return { title: t('seoCollectionTitle'), description: t('seoCollectionDescription') }

  const country = ctx.countries.find((c) => c.iso === route.iso)
  if (!country) return { title: t('seoHomeTitle'), description: t('seoHomeDescription') }
  const name = ctx.nameOf(country)
  const coins = ctx.commemorative.filter((c) => c.country === route.iso)
  const countryDescription = t('seoCountryDescription', { country: name, count: coins.length })

  switch (route.kind) {
    case 'country':
      return { title: t('seoCountryTitle', { country: name }), description: countryDescription }
    case 'coin': {
      const value = valueLabel(t, route.denomination)
      const image = country.series.find((s) => s.index === route.series)?.coins[route.denomination]
      const text = image ? ctx.regularDescription(image) : ''
      return {
        title: t('seoCoinTitle', { value, country: name }),
        description: text ? truncate(`${value} – ${name}. ${text}`) : countryDescription,
      }
    }
    case 'commList': {
      if (coins.length === 0) return { title: t('seoCountryTitle', { country: name }), description: countryDescription }
      const years = coins.map((c) => c.year)
      return {
        title: t('seoCommListTitle', { country: name, count: coins.length }),
        description: t('seoCommListDescription', { country: name, from: Math.min(...years), to: Math.max(...years) }),
      }
    }
    case 'comm': {
      const title = ctx.commTitle(route.coin)
      return {
        title: t('seoCommTitle', { country: name, year: route.coin.year, title }),
        description: truncate(`${name} ${route.coin.year} – ${title}. ${designOf(ctx.commDescription(route.coin))}`),
      }
    }
  }
}
