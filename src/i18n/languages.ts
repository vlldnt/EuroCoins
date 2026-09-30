// Langues de l'interface = fichiers de src/i18n/locales/.
// `texts` = langue dans laquelle on affiche les textes des pièces (publiés par la BCE) ;
// quand la BCE ne publie pas dans la langue, on se replie sur une langue proche.
export const LANGUAGES = [
  { code: 'fr', texts: 'fr' },
  { code: 'en', texts: 'en' },
  { code: 'de', texts: 'de' },
  { code: 'nl', texts: 'nl' },
  { code: 'it', texts: 'it' },
  { code: 'es', texts: 'es' },
  { code: 'pt', texts: 'pt' },
  { code: 'el', texts: 'el' },
  { code: 'fi', texts: 'fi' },
  { code: 'et', texts: 'et' },
  { code: 'lv', texts: 'lv' },
  { code: 'lt', texts: 'lt' },
  { code: 'sk', texts: 'sk' },
  { code: 'sl', texts: 'sl' },
  { code: 'hr', texts: 'hr' },
  { code: 'mt', texts: 'mt' },
  { code: 'bg', texts: 'bg' },
  { code: 'ca', texts: 'es' },
  { code: 'lb', texts: 'de' },
  { code: 'zh', texts: 'en' },
  { code: 'ja', texts: 'en' },
  { code: 'hi', texts: 'en' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']
export type TextLang = (typeof LANGUAGES)[number]['texts']

export function textLangFor(lang: Lang): TextLang {
  return LANGUAGES.find((l) => l.code === lang)!.texts
}

// Choix proposés dans le sélecteur : un par pays émetteur, avec son drapeau et sa langue,
// puis quelques langues hors zone euro. `id` = code pays ISO (minuscules).
// `label` / `country` remplacent les noms fournis par Intl quand l'usage local diffère
// ou que le navigateur ne connaît pas la langue (luxembourgeois, maltais).
export interface Locale {
  id: string
  lang: Lang
  label?: string
  country?: string
  euro: boolean
}

export const LOCALES: Locale[] = [
  { id: 'ad', lang: 'ca', euro: true },
  { id: 'at', lang: 'de', euro: true },
  { id: 'be', lang: 'nl', label: 'Vlaams', euro: true },
  { id: 'bg', lang: 'bg', euro: true },
  { id: 'cy', lang: 'el', euro: true },
  { id: 'de', lang: 'de', euro: true },
  { id: 'ee', lang: 'et', euro: true },
  { id: 'es', lang: 'es', euro: true },
  { id: 'fi', lang: 'fi', euro: true },
  { id: 'fr', lang: 'fr', euro: true },
  { id: 'gr', lang: 'el', euro: true },
  { id: 'hr', lang: 'hr', euro: true },
  { id: 'ie', lang: 'en', euro: true },
  { id: 'it', lang: 'it', euro: true },
  { id: 'lt', lang: 'lt', euro: true },
  { id: 'lu', lang: 'lb', label: 'Lëtzebuergesch', country: 'Lëtzebuerg', euro: true },
  { id: 'lv', lang: 'lv', euro: true },
  { id: 'mc', lang: 'fr', euro: true },
  { id: 'mt', lang: 'mt', label: 'Malti', country: 'Malta', euro: true },
  { id: 'nl', lang: 'nl', euro: true },
  { id: 'pt', lang: 'pt', euro: true },
  { id: 'si', lang: 'sl', euro: true },
  { id: 'sk', lang: 'sk', euro: true },
  { id: 'sm', lang: 'it', euro: true },
  { id: 'va', lang: 'it', euro: true },
  { id: 'cn', lang: 'zh', euro: false },
  { id: 'jp', lang: 'ja', euro: false },
  { id: 'in', lang: 'hi', euro: false },
]

export const DEFAULT_LOCALE = 'fr'

export function localeById(id: string | null | undefined): Locale | undefined {
  return LOCALES.find((l) => l.id === id)
}

/** Locale correspondant à une préférence du navigateur (« fr-BE », « de », « en-IE »…). */
export function localeForBrowser(tag: string): Locale | undefined {
  const [lang, region] = tag.toLowerCase().split('-')
  return (
    LOCALES.find((l) => l.lang === lang && l.id === region) ??
    LOCALES.find((l) => l.lang === lang && l.id === lang) ??
    LOCALES.find((l) => l.lang === lang)
  )
}

// Fuseau horaire du navigateur → pays. Sert à choisir la langue du pays où l'on se trouve,
// sans demander de géolocalisation ni appeler de service externe.
const TIME_ZONE_COUNTRY: Record<string, string> = {
  'Europe/Andorra': 'ad',
  'Europe/Vienna': 'at',
  'Europe/Brussels': 'be',
  'Europe/Sofia': 'bg',
  'Asia/Nicosia': 'cy',
  'Asia/Famagusta': 'cy',
  'Europe/Nicosia': 'cy',
  'Europe/Berlin': 'de',
  'Europe/Busingen': 'de',
  'Europe/Tallinn': 'ee',
  'Europe/Madrid': 'es',
  'Africa/Ceuta': 'es',
  'Atlantic/Canary': 'es',
  'Europe/Helsinki': 'fi',
  'Europe/Paris': 'fr',
  'Indian/Reunion': 'fr',
  'Indian/Mayotte': 'fr',
  'America/Guadeloupe': 'fr',
  'America/Martinique': 'fr',
  'America/Cayenne': 'fr',
  'Europe/Athens': 'gr',
  'Europe/Zagreb': 'hr',
  'Europe/Dublin': 'ie',
  'Europe/Rome': 'it',
  'Europe/Vilnius': 'lt',
  'Europe/Luxembourg': 'lu',
  'Europe/Riga': 'lv',
  'Europe/Monaco': 'mc',
  'Europe/Malta': 'mt',
  'Europe/Amsterdam': 'nl',
  'Europe/Lisbon': 'pt',
  'Atlantic/Madeira': 'pt',
  'Atlantic/Azores': 'pt',
  'Europe/Ljubljana': 'si',
  'Europe/Bratislava': 'sk',
  'Europe/San_Marino': 'sm',
  'Europe/Vatican': 'va',
  'Asia/Shanghai': 'cn',
  'Asia/Chongqing': 'cn',
  'Asia/Harbin': 'cn',
  'Asia/Urumqi': 'cn',
  'Asia/Tokyo': 'jp',
  'Asia/Kolkata': 'in',
  'Asia/Calcutta': 'in',
}

// Autres langues officielles d'un pays, prises en compte si le navigateur les préfère
// (ex. un navigateur en français en Belgique reste en français).
const OTHER_OFFICIAL_LANGS: Record<string, Lang[]> = {
  be: ['fr', 'de'],
  lu: ['fr', 'de'],
  mt: ['en'],
}

/** Locale du pays où se trouve l'utilisateur, d'après le fuseau horaire du navigateur. */
export function localeForLocation(timeZone: string, browserLangs: readonly string[]): Locale | undefined {
  const country = TIME_ZONE_COUNTRY[timeZone]
  const local = localeById(country)
  if (!country || !local) return undefined
  const preferred = browserLangs[0]?.slice(0, 2).toLowerCase()
  if (preferred && OTHER_OFFICIAL_LANGS[country]?.includes(preferred as Lang)) {
    return localeForBrowser(`${preferred}-${country}`)
  }
  return local
}
