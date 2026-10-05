import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EuropeMap } from './components/EuropeMap'
import { CountryPanel, type PanelTab } from './components/CountryPanel'
import { Lightbox, type ZoomItem } from './components/Lightbox'
import { LanguageSelect } from './components/LanguageSelect'
import { DisplaySettings } from './components/DisplaySettings'
import { InstallButton } from './components/InstallButton'
import { RotateNotice } from './components/RotateNotice'
import { VisitCounter } from './components/VisitCounter'
import { APP_VERSION } from './version'
import { UpdateToast } from './components/UpdateToast'
import { CountryList } from './components/CountryPicker'
import { QuickSearch } from './components/QuickSearch'
import type { PanelTarget } from './search'
import { countriesByIso, data } from './data'
import { useI18n } from './i18n'
import { useDelayedUnmount } from './useDelayedUnmount'
import { useCoinTexts } from './i18n/useCoinTexts'
import { readLocation, targetFor, writeLocation } from './navigation'
import { usePageMeta } from './usePageMeta'
import type { Route } from './routes'

// Le pays, l'onglet et la pièce ouverte sont gardés dans l'URL (/fr/belgique/2-euros/, ou #be dans
// les langues sans pages) pour pouvoir partager un lien : voir src/navigation.ts.
const isoOf = (route: Route) => (route.kind === 'home' ? null : route.iso)

// Liens d'évitement : on déplace le focus sans changer l'URL (le hash sert au pays ouvert).
function skipTo(e: React.MouseEvent, ...ids: string[]) {
  e.preventDefault()
  // Premier élément affiché parmi les cibles (la liste des pays diffère selon le format d'écran).
  const target = ids.map((id) => document.getElementById(id)).find((el) => el && el.offsetParent !== null)
  target?.focus()
}


export default function App() {
  const { t, lang, textsLang } = useI18n()
  const { nameOf } = useCoinTexts()
  // Vue demandée par l'adresse à l'arrivée sur le site.
  const [initial] = useState(readLocation)
  const [selected, setSelected] = useState<string | null>(() => isoOf(initial))
  // Élément qui avait le focus avant l'ouverture de la fenêtre : il le retrouve à la fermeture.
  const returnFocus = useRef<HTMLElement | SVGElement | null>(null)
  const [zoom, setZoom] = useState<{ items: ZoomItem[]; index: number } | null>(null)
  // Destination choisie dans la recherche rapide (onglet, série, pièce) ; nouvel objet à chaque choix.
  const [target, setTarget] = useState<PanelTarget | null>(() => targetFor(initial))
  // Onglet affiché par la fenêtre pays (elle le signale), avec le pays auquel il se rapporte.
  const [tab, setTab] = useState<{ iso: string; tab: PanelTab } | null>(null)

  // Adresse modifiée à la main, ou retour arrière : on affiche la vue demandée.
  useEffect(() => {
    const onLocation = () => {
      const route = readLocation()
      setSelected(isoOf(route))
      setTarget(targetFor(route))
      if (route.kind !== 'coin' && route.kind !== 'comm') setZoom(null)
    }
    window.addEventListener('hashchange', onLocation)
    window.addEventListener('popstate', onLocation)
    return () => {
      window.removeEventListener('hashchange', onLocation)
      window.removeEventListener('popstate', onLocation)
    }
  }, [])

  // Vue affichée : la pièce ouverte dans le carrousel, sinon l'onglet du pays, sinon la carte.
  const zoomRoute = zoom?.items[zoom.index]?.route
  const showsCommemoratives = !!selected && tab?.iso === selected && tab.tab === 'commemorative'
  const route = useMemo<Route>(() => {
    if (zoomRoute) return zoomRoute
    if (!selected) return { kind: 'home' }
    return { kind: showsCommemoratives ? 'commList' : 'country', iso: selected }
  }, [zoomRoute, selected, showsCommemoratives])

  // L'adresse suit la vue (replaceState : fermer une fenêtre ne remplit pas l'historique).
  useEffect(() => writeLocation(route, lang), [route, lang])
  usePageMeta(route)

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
    setSelected(iso)
    setTarget(null)
  }, [])

  const close = useCallback(() => select(null), [select])

  const goTo = useCallback(
    (iso: string, to: PanelTarget) => {
      setZoom(null)
      select(iso)
      setTarget({ ...to })
    },
    [select],
  )

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
  // Fenêtre pays et carrousel restent affichés le temps de leur animation de fermeture.
  const panel = useDelayedUnmount(country ?? null, 280)
  const lightbox = useDelayedUnmount(zoom, 220)
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
          <QuickSearch onPick={goTo} />
          <InstallButton />
          <DisplaySettings />
          <LanguageSelect />
        </div>
      </header>

      <main className="layout">
        <EuropeMap selected={selected} onSelect={select} panelOpen={!!country} />
        <CountryList selected={selected} onSelect={select} />
        {panel.item && (
          <CountryPanel
            key={panel.item.iso}
            country={panel.item}
            leaving={panel.leaving}
            target={panel.item.iso === selected ? target : null}
            onClose={close}
            onTab={(value) => setTab({ iso: panel.item!.iso, tab: value })}
            onZoom={(items, index) => setZoom({ items, index })}
          />
        )}
      </main>

      {/* Crédit BCE posé sur la carte, en bas à droite. */}
      <div className="bottom-overlay">
        <footer className="site-footer">
          <VisitCounter />
          {t('sourceLabel')}{' '}
          <a href={`https://www.ecb.europa.eu/euro/coins/html/index.${textsLang}.html`} target="_blank" rel="noreferrer">
            {t('ecb')}
          </a>
          <span className="app-version" title={t('version', { version: APP_VERSION })}>
            {APP_VERSION}
          </span>
        </footer>
      </div>

      <RotateNotice />
      <UpdateToast />

      {lightbox.item && (
        <Lightbox
          items={lightbox.item.items}
          index={lightbox.item.index}
          leaving={lightbox.leaving}
          onIndex={setZoomIndex}
          onClose={closeZoom}
        />
      )}
    </div>
  )
}
