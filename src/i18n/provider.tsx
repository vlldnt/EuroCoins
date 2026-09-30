import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import fr, { type Messages } from './locales/fr'
import { DEFAULT_LOCALE, localeById, localeForBrowser, localeForLocation, textLangFor, type Locale } from './languages'
import { I18nContext, type CoinTexts, type I18n, type Vars } from './context'

// Chaque langue est chargée à la demande (un petit fichier JS par langue).
const loaders = import.meta.glob<{ default: Messages }>('./locales/*.ts')

const STORAGE_KEY = 'eurocoins.locale'
const LEGACY_STORAGE_KEY = 'eurocoins.lang'

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const found = localeById(stored)
    if (found) return found
    // Ancienne préférence enregistrée sous forme de code langue (« en », « ga »…).
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    const migrated = legacy && localeForBrowser(legacy === 'ga' ? 'en-ie' : legacy)
    if (migrated) return migrated
  } catch {
    // stockage indisponible (navigation privée…)
  }
  // Par défaut : la langue du pays où l'on se trouve, puis celle du navigateur.
  const browserLangs = navigator.languages ?? []
  const here = localeForLocation(Intl.DateTimeFormat().resolvedOptions().timeZone, browserLangs)
  if (here) return here
  for (const pref of browserLangs) {
    const found = localeForBrowser(pref)
    if (found) return found
  }
  return localeById(DEFAULT_LOCALE)!
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const lang = locale.lang
  const [messages, setMessages] = useState<Messages>(fr)
  const [texts, setTexts] = useState<CoinTexts | null>(null)
  const textsLang = textLangFor(lang)

  useEffect(() => {
    let cancelled = false
    const load = loaders[`./locales/${lang}.ts`] ?? (() => Promise.resolve({ default: fr }))
    load().then((m) => !cancelled && setMessages({ ...fr, ...m.default }))
    document.documentElement.lang = lang
    return () => {
      cancelled = true
    }
  }, [lang])

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}i18n/${textsLang}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: CoinTexts | null) => !cancelled && setTexts(json))
      .catch(() => !cancelled && setTexts(null))
    return () => {
      cancelled = true
    }
  }, [textsLang])

  const setLocale = useCallback((id: string) => {
    const next = localeById(id)
    if (!next) return
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next.id)
    } catch {
      // ignoré
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const t = (key: keyof Messages, vars?: Vars) =>
      messages[key].replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m))
    const regionNames = safeDisplayNames(lang, 'region')
    const languageNames = safeDisplayNames(lang, 'language')
    return {
      lang,
      locale,
      setLocale,
      t,
      plural: (one, many, count) => t(count === 1 ? one : many, { count }),
      countryName: (iso, fallback, inLang) => {
        const names = inLang ? safeDisplayNames(inLang, 'region') : regionNames
        const name = names?.of(iso.toUpperCase())
        return name && name.toUpperCase() !== iso.toUpperCase() ? name : fallback
      },
      languageName: (code, inLang) => {
        const names = inLang ? safeDisplayNames(inLang, 'language') : languageNames
        const name = names?.of(code)
        return name && name !== code ? name.charAt(0).toLocaleUpperCase(inLang ?? lang) + name.slice(1) : code
      },
      texts,
      textsLang,
    }
  }, [lang, locale, messages, setLocale, texts, textsLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function safeDisplayNames(locale: string, type: 'region' | 'language') {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type })
  } catch {
    return null
  }
}

