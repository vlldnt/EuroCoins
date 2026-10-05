import { useEffect, useMemo } from 'react'
import { data } from './data'
import { useI18n } from './i18n'
import { useCoinTexts } from './i18n/useCoinTexts'
import { canonicalFor } from './navigation'
import { pageMeta } from './pageMeta'
import type { Route } from './routes'

// Titre de l'onglet, description et adresse de référence suivent la vue affichée (pays, pièce…),
// avec les mêmes textes que les pages statiques générées par scripts/build-pages.mjs.
export function usePageMeta(route: Route) {
  const { t, lang } = useI18n()
  const { nameOf, commTitle, commDescription, regularDescription } = useCoinTexts()

  const meta = useMemo(
    () =>
      pageMeta(route, {
        t,
        countries: data.countries,
        commemorative: data.commemorative,
        nameOf,
        commTitle,
        commDescription,
        regularDescription,
      }),
    [route, t, nameOf, commTitle, commDescription, regularDescription],
  )
  const canonical = canonicalFor(route, lang)

  useEffect(() => {
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
    // Langue sans pages : on laisse l'adresse de référence fournie par le HTML.
    if (canonical) document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  }, [meta, canonical])
}
