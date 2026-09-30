import { useCallback, useEffect, useState } from 'react'
import { EuropeMap } from './components/EuropeMap'
import { CountryPanel } from './components/CountryPanel'
import { Lightbox, type ZoomItem } from './components/Lightbox'
import { LanguageSelect } from './components/LanguageSelect'
import { ThemeToggle } from './components/ThemeToggle'
import { CountryPicker } from './components/CountryPicker'
import { countriesByIso, data } from './data'
import { useI18n } from './i18n'

// Le pays sélectionné est gardé dans l'URL (#fr, #de…) pour pouvoir partager un lien.
function readHash() {
  const iso = window.location.hash.slice(1).toLowerCase()
  return countriesByIso.has(iso) ? iso : null
}

// Côté de la fenêtre pays : à l'opposé du point cliqué, pour garder le pays visible.
type Side = 'left' | 'right'

export default function App() {
  const { t, textsLang } = useI18n()
  const [selected, setSelected] = useState<string | null>(readHash)
  const [side, setSide] = useState<Side>('right')
  const [zoom, setZoom] = useState<{ items: ZoomItem[]; index: number } | null>(null)

  useEffect(() => {
    const onHash = () => setSelected(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const select = useCallback((iso: string | null, clientX?: number) => {
    if (iso && clientX !== undefined) setSide(clientX > window.innerWidth * 0.55 ? 'left' : 'right')
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

  const setZoomIndex = useCallback((index: number) => setZoom((z) => z && { ...z, index }), [])
  const closeZoom = useCallback(() => setZoom(null), [])

  const country = selected ? countriesByIso.get(selected) : undefined

  return (
    <div className={`app${country ? ' has-panel' : ''}`}>
      <header className="site-header">
        <h1>
          <span className="logo" aria-hidden="true">
            €
          </span>
          EuroCoins
        </h1>
        <p>{t('subtitle', { count: data.countries.length })}</p>
        <div className="header-tools" data-keep-panel>
          <ThemeToggle />
          <LanguageSelect />
        </div>
      </header>

      <main className="layout">
        <EuropeMap selected={selected} onSelect={select} panelSide={country ? side : null} />
        {country && (
          <CountryPanel
            key={country.iso}
            country={country}
            side={side}
            onClose={close}
            onZoom={(items, index) => setZoom({ items, index })}
          />
        )}
      </main>

      <div className="bottom-bar" data-keep-panel>
        <CountryPicker selected={selected} onSelect={select} />
      </div>

      <footer className="site-footer">
        {t('sourceLabel')}{' '}
        <a href={`https://www.ecb.europa.eu/euro/coins/html/index.${textsLang}.html`} target="_blank" rel="noreferrer">
          {t('ecb')}
        </a>
      </footer>

      {zoom && <Lightbox items={zoom.items} index={zoom.index} onIndex={setZoomIndex} onClose={closeZoom} />}
    </div>
  )
}
