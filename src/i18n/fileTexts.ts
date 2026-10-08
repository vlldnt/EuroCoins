import { BUILD_ID } from '../autoUpdate'
import type { FileTexts } from '../collectionFiles'
import { denominationValue } from '../data'
import type { CoinTexts } from './context'
import { textLangFor, type Lang } from './languages'
import fr, { type Messages } from './locales/fr'

// Textes d'un fichier exporté dans une autre langue que celle de l'interface (classeur envoyé à
// quelqu'un qui ne lit pas le français) : mêmes sources et mêmes replis que l'affichage du site.

const loaders = import.meta.glob<{ default: Messages }>('./locales/*.ts')

export async function loadFileTexts(lang: Lang): Promise<FileTexts> {
  const textsLang = textLangFor(lang)
  const [messages, texts] = await Promise.all([
    (loaders[`./locales/${lang}.ts`]?.() ?? Promise.resolve({ default: fr })).then((m) => ({ ...fr, ...m.default })),
    // Titres BCE des commémoratives ; à défaut (hors ligne), ceux de coins.json.
    fetch(`${import.meta.env.BASE_URL}i18n/${textsLang}.json?v=${BUILD_ID}`)
      .then((r) => (r.ok ? (r.json() as Promise<CoinTexts>) : null))
      .catch(() => null),
  ])
  const t: FileTexts['t'] = (key, vars) =>
    messages[key].replace(/\{(\w+)\}/g, (m, name: string) => (vars && name in vars ? String(vars[name]) : m))
  let regions: Intl.DisplayNames | null = null
  try {
    regions = new Intl.DisplayNames([lang, textsLang, 'en'], { type: 'region' })
  } catch {
    // langue inconnue du navigateur : noms de coins.json
  }
  return {
    t,
    nameOf: (country) => {
      const name = regions?.of(country.iso.toUpperCase())
      return name && name.toUpperCase() !== country.iso.toUpperCase() ? name : country.name
    },
    denominationLabel: (id) => {
      const { n, unit } = denominationValue(id)
      if (unit === 'cent') return t(n === 1 ? 'cent' : 'cents', { n })
      return t(n === 1 ? 'euro' : 'euros', { n })
    },
    commTitle: (coin) => (coin.image && texts?.commemorative[coin.image]?.title) || coin.title,
  }
}
