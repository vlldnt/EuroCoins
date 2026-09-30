import { createContext, useContext } from 'react'
import type { Messages } from './locales/fr'
import type { Lang, Locale } from './languages'

// Textes BCE (titres et descriptions des pièces), générés par scripts/fetch-texts.mjs.
export interface CoinTexts {
  countries: Record<string, { description: string[] }>
  /** Description du graphisme d'une pièce courante, par chemin d'image. */
  regular?: Record<string, string>
  commemorative: Record<string, { title: string; description: string }>
}

export type Vars = Record<string, string | number>

export interface I18n {
  lang: Lang
  /** Choix du sélecteur (pays + langue). */
  locale: Locale
  setLocale: (id: string) => void
  t: (key: keyof Messages, vars?: Vars) => string
  /** Pluriel simple : clé `one` si count === 1, sinon `many`. */
  plural: (one: keyof Messages, many: keyof Messages, count: number) => string
  countryName: (iso: string, fallback: string, inLang?: string) => string
  languageName: (code: string, inLang?: string) => string
  texts: CoinTexts | null
  textsLang: string
}

export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n doit être utilisé dans <I18nProvider>')
  return ctx
}
