import { useCallback } from 'react'
import { denominationValue, type CommemorativeCoin, type Country, type DenominationId } from '../data'
import { useI18n } from '.'
import { LOCALES } from './languages'

// Accès aux textes traduits des pièces, avec repli sur le français de coins.json.
export function useCoinTexts() {
  const { t, texts, countryName, lang } = useI18n()

  const denominationLabel = useCallback(
    (id: DenominationId) => {
      const { n, unit } = denominationValue(id)
      if (unit === 'cent') return t(n === 1 ? 'cent' : 'cents', { n })
      return t(n === 1 ? 'euro' : 'euros', { n })
    },
    [t],
  )

  const commTitle = useCallback(
    (c: CommemorativeCoin) => (c.image && texts?.commemorative[c.image]?.title) || c.title,
    [texts],
  )

  const commDescription = useCallback(
    (c: CommemorativeCoin) => (c.image && texts?.commemorative[c.image]?.description) || c.description,
    [texts],
  )

  /** Ce que représente une pièce courante (texte BCE de sa valeur faciale). */
  const regularDescription = useCallback((image: string) => texts?.regular?.[image] ?? '', [texts])

  /** Description courte du graphisme d'une commémorative : premier paragraphe, sans son libellé. */
  const commDesign = useCallback(
    (c: CommemorativeCoin) => {
      const first = commDescription(c).split('\n')[0] ?? ''
      const colon = first.indexOf(':')
      return colon > 0 && colon < 30 ? first.slice(colon + 1).trim() : first
    },
    [commDescription],
  )

  const countryDescription = useCallback(
    (country: Country) => texts?.countries[country.iso]?.description ?? country.description,
    [texts],
  )

  /** « Tirage : 2 500 000 pièces » (ou « variable selon le pays » pour les émissions communes). */
  const mintageText = useCallback(
    (c: CommemorativeCoin) => {
      if (c.mintage !== null) return t('mintage', { count: new Intl.NumberFormat(lang).format(c.mintage) })
      return c.joint ? t('mintageVariable') : ''
    },
    [t, lang],
  )

  /** Tirage abrégé pour la grille (« 2,5 M », « 500 k »…), dans la langue choisie. */
  const mintageShort = useCallback(
    (c: CommemorativeCoin) =>
      c.mintage === null
        ? ''
        : new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(c.mintage),
    [lang],
  )

  const nameOf = useCallback((country: Country) => countryName(country.iso, country.name), [countryName])

  /** Nom du pays dans sa propre langue (« Deutschland », « België », « Ελλάδα »…). */
  const nativeNameOf = useCallback(
    (country: Country) => {
      const locale = LOCALES.find((l) => l.id === country.iso)
      if (!locale) return country.name
      return locale.country ?? countryName(country.iso, country.name, locale.lang)
    },
    [countryName],
  )

  return {
    denominationLabel,
    commTitle,
    commDescription,
    commDesign,
    regularDescription,
    countryDescription,
    nameOf,
    nativeNameOf,
    mintageText,
    mintageShort,
  }
}
