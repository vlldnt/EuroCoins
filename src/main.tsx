import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Police de toute l'interface : Calibri si elle est installée (Windows, Office), sinon Carlito,
// son équivalent libre aux mêmes dimensions (licence OFL), hébergé avec le site (hors ligne, PWA).
// Latin, grec et cyrillique ; chinois, japonais et hindi passent par la police système.
import '@fontsource/carlito/400.css'
import '@fontsource/carlito/400-italic.css'
import '@fontsource/carlito/700.css'
import './index.css'
import App from './App.tsx'
import { startAutoUpdate } from './autoUpdate'
import { I18nProvider } from './i18n'

startAutoUpdate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
