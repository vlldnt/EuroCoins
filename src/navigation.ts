import { countriesByIso, data } from './data'
import type { Lang } from './i18n'
import type { PanelTarget } from './search'
import { PAGE_LANGS, createRoutes, pathLang, type PageLang, type Route } from './routes'

// Lien entre l'adresse du navigateur et ce que l'appli affiche.
// Langues de PAGE_LANGS : vraies adresses (/fr/belgique/2-euros/). Autres langues : ancien lien
// « /#be », qui ne porte que le pays.

const ROOT = import.meta.env.BASE_URL

const routes = Object.fromEntries(PAGE_LANGS.map((lang) => [lang, createRoutes(data, lang, ROOT)])) as Record<
  PageLang,
  ReturnType<typeof createRoutes>
>

// Langues sans pages : la collection s'ouvre avec « /#collection ».
const COLLECTION_HASH = 'collection'

const isPageLang = (lang: string): lang is PageLang => (PAGE_LANGS as readonly string[]).includes(lang)

/** Langue imposée par l'adresse (« /fr/… »), null ailleurs. */
export const urlLang = () => pathLang(window.location.pathname, ROOT)

/** Vue demandée par l'adresse courante. */
export function readLocation(): Route {
  const { pathname, hash } = window.location
  const lang = pathLang(pathname, ROOT)
  if (lang) return routes[lang].parse(pathname, hash) ?? { kind: 'home' }
  // Ancien lien : le pays est dans le hash (#fr, #de…).
  const iso = hash.slice(1).toLowerCase()
  if (iso === COLLECTION_HASH) return { kind: 'collection' }
  if (iso.startsWith(`${COLLECTION_HASH}=`)) return { kind: 'collection', shared: iso.slice(COLLECTION_HASH.length + 1) }
  return countriesByIso.has(iso) ? { kind: 'country', iso } : { kind: 'home' }
}

/** Adresse d'une vue dans la langue de l'interface. */
export function urlFor(route: Route, lang: Lang): string {
  if (isPageLang(lang)) return routes[lang].pathOf(route)
  if (route.kind === 'home') return ROOT + window.location.search
  if (route.kind === 'collection') return `${ROOT}${window.location.search}#${COLLECTION_HASH}${route.shared ? `=${route.shared}` : ''}`
  return `${ROOT}${window.location.search}#${route.iso}`
}

/** Lien de partage d'une collection : sans préfixe de langue, il s'ouvre dans la langue du destinataire. */
export const shareUrl = (code: string) => `${window.location.origin}${ROOT}#${COLLECTION_HASH}=${code}`

/** Adresse de référence de la page (sans hash), null si la langue n'a pas de pages. */
export function canonicalFor(route: Route, lang: Lang): string | null {
  return isPageLang(lang) ? window.location.origin + routes[lang].pathOf(route).split('#')[0] : null
}

/** Ce que la fenêtre pays doit montrer pour une vue donnée. */
export function targetFor(route: Route): PanelTarget | null {
  switch (route.kind) {
    case 'coin':
      return { kind: 'series', index: route.series, denomination: route.denomination }
    case 'commList':
      return { kind: 'commTab' }
    case 'comm':
      return { kind: 'comm', coin: route.coin }
    default:
      return null
  }
}

/** Met l'adresse à jour sans ajouter d'entrée à l'historique (comme l'ancien « #fr »). */
export function writeLocation(route: Route, lang: Lang) {
  const url = urlFor(route, lang)
  const { pathname, search, hash } = window.location
  if (url !== pathname + search + hash) history.replaceState(null, '', url)
}
