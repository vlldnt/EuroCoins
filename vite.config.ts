import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Identifiant unique de chaque build : les textes BCE sont demandés avec ?v=<build>,
// donc une nouvelle adresse à chaque déploiement (voir src/i18n/provider.tsx).
const buildId = Date.now().toString(36)

// https://vite.dev/config/
// Ports fixes pour ne pas entrer en conflit avec les autres projets.
export default defineConfig({
  plugins: [
    react(),
    // Application installable (écran d'accueil, plein écran sans barre d'adresse) et hors ligne.
    VitePWA({
      registerType: 'autoUpdate',
      // Enregistrement fait dans src/autoUpdate.ts, qui recharge la page à chaque nouvelle version.
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.webp'],
      manifest: {
        name: 'EuroCoins — les pièces en euros par pays',
        short_name: 'EuroCoins',
        description:
          "Carte d'Europe interactive des faces nationales des pièces en euros, séries et commémoratives.",
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0e1424',
        theme_color: '#0e1424',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // L'application (HTML, JS, CSS, icônes) est gardée d'avance ; les photos des pièces (≈ 31 Mo)
        // et les textes des 17 langues (≈ 13 Mo) sont gardés au fil de la consultation.
        globPatterns: ['**/*.{js,css,html,png,webp,svg,webmanifest,woff2}'],
        globIgnores: ['coins/**', 'i18n/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/coins/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'coins',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Textes BCE : affichage immédiat depuis le cache, rafraîchis en arrière-plan.
            // Une entrée par langue et par build : on purge les anciennes.
            urlPattern: ({ url }) => url.pathname.startsWith('/i18n/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'texts', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  server: { port: 3006, strictPort: true },
  preview: { port: 3007, strictPort: true },
})
