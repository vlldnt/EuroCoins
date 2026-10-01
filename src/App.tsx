import { useCallback, useEffect, useRef, useState } from 'react'
import { EuropeMap } from './components/EuropeMap'
import { CountryPanel } from './components/CountryPanel'
import { Lightbox, type ZoomItem } from './components/Lightbox'
import { LanguageSelect } from './components/LanguageSelect'
import { DisplaySettings } from './components/DisplaySettings'
import { InstallButton } from './components/InstallButton'
import { RotateNotice } from './components/RotateNotice'
import { CountryList } from './components/CountryPicker'
import { countriesByIso, data } from './data'
import { useI18n } from './i18n'
import { useCoinTexts } from './i18n/useCoinTexts'

// Le pays sélectionné est gardé dans l'URL (#fr, #de…) pour pouvoir partager un lien.
function readHash() {
  const iso = window.location.hash.slice(1).toLowerCase()
  return countriesByIso.has(iso) ? iso : null
}

// Liens d'évitement : on déplace le focus sans changer l'URL (le hash sert au pays ouvert).
function skipTo(e: React.MouseEvent, ...ids: string[]) {
  e.preventDefault()
  // Premier élément affiché parmi les cibles (la liste des pays diffère selon le format d'écran).
  const target = ids.map((id) => document.getElementById(id)).find((el) => el && el.offsetParent !== null)
  target?.focus()
}


export default function App() {
  const { t, textsLang } = useI18n()
  const { nameOf } = useCoinTexts()
  const [selected, setSelected] = useState<string | null>(readHash)
  // Élément qui avait le focus avant l'ouverture de la fenêtre : il le retrouve à la fermeture.
  const returnFocus = useRef<HTMLElement | SVGElement | null>(null)
  const [zoom, setZoom] = useState<{ items: ZoomItem[]; index: number } | null>(null)

  useEffect(() => {
    const onHash = () => setSelected(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const select = useCallback((iso: string | null) => {
    if (iso && !returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null
    if (!iso) {
      const target = returnFocus.current
      returnFocus.current = null
      // Après le rendu (la fenêtre a disparu), on rend le focus à son déclencheur, ou à la carte.
      requestAnimationFrame(() => {
        const el = target?.isConnected ? target : document.getElementById('map')
        el?.focus({ preventScroll: true })
      })
    }
    // replaceState : fermer la fenêtre ne laisse pas un « # » vide dans l'URL.
    history.replaceState(null, '', iso ? `#${iso}` : location.pathname + location.search)
    setSelected(iso)
  }, [])

  const close = useCallback(() => select(null), [select])

  // Fermeture : Échap, ou clic en dehors de la fenêtre (sauf sur les éléments marqués
  // data-keep-panel : pays de la carte, carrousel, outils d'en-tête, liste des pays…).
  useEffect(() => {
    if (!selected || zoom) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.isConnected || target.closest('[data-keep-panel]')) return
      close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [selected, zoom, close])

  // Hauteur réelle de l'en-tête (posé sur la carte) : la liste des pays et la fenêtre se placent dessous.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header')
    if (!header) return
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`),
    )
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const setZoomIndex = useCallback((index: number) => setZoom((z) => z && { ...z, index }), [])
  const closeZoom = useCallback(() => setZoom(null), [])

  const country = selected ? countriesByIso.get(selected) : undefined
  // Message lu par les lecteurs d'écran (région aria-live) à l'ouverture d'un pays.
  const announcement = country ? t('countryOpened', { country: nameOf(country) }) : ''

  return (
    <div className={`app${country ? ' has-panel' : ''}`}>
      <nav className="skip-links" aria-label={t('display')}>
        <a href="#map" onClick={(e) => skipTo(e, 'map')}>
          {t('skipToMap')}
        </a>
        <a href="#countries-list" onClick={(e) => skipTo(e, 'countries-list')}>
          {t('skipToCountries')}
        </a>
      </nav>
      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      <header className="site-header">
        <h1>
          <img className="logo" src={`${import.meta.env.BASE_URL}icons/logo.webp`} alt="" width="42" height="42" />
          EuroCoins
        </h1>
        <p>{t('subtitle', { count: data.countries.length })}</p>
        <div className="header-tools" data-keep-panel>
          <InstallButton />
          <DisplaySettings />
          <LanguageSelect />
        </div>
      </header>

      <main className="layout">
        <EuropeMap selected={selected} onSelect={select} panelOpen={!!country} />
        <CountryList selected={selected} onSelect={select} />
        {country && (
          <CountryPanel
            key={country.iso}
            country={country}
            onClose={close}
            onZoom={(items, index) => setZoom({ items, index })}
          />
        )}
      </main>

      {/* Crédit BCE posé sur la carte, en bas à droite. */}
      <div className="bottom-overlay">
        <footer className="site-footer">
          {t('sourceLabel')}{' '}
          <a href={`https://www.ecb.europa.eu/euro/coins/html/index.${textsLang}.html`} target="_blank" rel="noreferrer">
            {t('ecb')}
          </a>
        </footer>
      </div>

      <RotateNotice />

      {zoom && <Lightbox items={zoom.items} index={zoom.index} onIndex={setZoomIndex} onClose={closeZoom} />}
    </div>
  )
}
