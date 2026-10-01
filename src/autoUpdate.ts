/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// Mise à jour automatique sans Ctrl+Maj+F5. Le service worker (vite-plugin-pwa) sert l'application
// depuis son cache : sans ceci, un simple rechargement affichait encore l'ancienne version.
// Avec registerType « autoUpdate », la page se recharge d'elle-même dès que le nouveau service
// worker prend la main. Le pays sélectionné est dans l'adresse (#fr…), il est conservé.

declare global {
  const __BUILD_ID__: string
}

export const BUILD_ID = __BUILD_ID__

export function startAutoUpdate() {
  if (import.meta.env.DEV) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Onglet ou application installée qui revient au premier plan : on cherche une nouvelle version.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {})
      })
    },
  })
}
