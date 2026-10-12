import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Identifiant unique de chaque build : les textes BCE sont demandés avec ?v=<build>,
// donc une nouvelle adresse à chaque déploiement (voir src/i18n/provider.tsx).
const buildId = Date.now().toString(36)
// Version affichée dans l'appli (« v1.10 ») : majeure.mineure de package.json, à incrémenter avant
// chaque push sur main (voir CLAUDE.md).
const [major, minor] = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}).version.split('.')
const appVersion = `v${major}.${minor}`

// Reconnaissance par photo en local : lance server/identify.py (comme sur le VPS) quand .env
// contient OPEN_ROUTER_API_KEY ; « /api/identify » lui est transmis (voir `proxy` plus bas).
const IDENTIFY_PORT = 8097
function identifyService(): Plugin {
  const start = (mode: string, close: (stop: () => void) => void) => {
    const env = loadEnv(mode, process.cwd(), '')
    if (!env.OPEN_ROUTER_API_KEY) return
    const child = spawn('python3', ['server/identify.py'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        OPEN_ROUTER_API_KEY: env.OPEN_ROUTER_API_KEY,
        ...(env.IDENTIFY_MODEL ? { IDENTIFY_MODEL: env.IDENTIFY_MODEL } : {}),
        // Code PIN de l'administrateur : sans lui, le service reste désactivé.
        ADMIN_ACCESS: env.ADMIN_ACCESS ?? '',
        IDENTIFY_PORT: String(IDENTIFY_PORT),
        // Les visuels viennent de public/ (ou de dist/ en aperçu : mêmes fichiers).
        IDENTIFY_SITE_DIR: 'public',
        IDENTIFY_ORIGINS: '*',
        IDENTIFY_PER_HOUR: '1000',
      },
    })
    const stop = () => child.kill()
    close(stop)
    process.once('exit', stop)
  }
  return {
    name: 'eurocoins-identify',
    configureServer: (server) => start(server.config.mode, (stop) => server.httpServer?.once('close', stop)),
    configurePreviewServer: (server) => start(server.config.mode, (stop) => server.httpServer.once('close', stop)),
  }
}
const proxy = { '/api/identify': `http://127.0.0.1:${IDENTIFY_PORT}` }

// https://vite.dev/config/
// Ports fixes pour ne pas entrer en conflit avec les autres projets.
export default defineConfig({
  plugins: [
    react(),
    identifyService(),
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
        // La bibliothèque Excel (≈ 1 Mo) n'est chargée qu'à l'export ou à l'import d'un classeur.
        globIgnores: ['coins/**', 'i18n/**', '**/collectionXlsx-*.js', '**/exceljs*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Compteur de visites : jamais servi depuis le cache, ni remplacé par la page d'accueil.
        // Idem pour les pages purement statiques (une valeur faciale dans tous les pays,
        // commémoratives par année : voir scripts/build-pages.mjs), le sitemap et robots.txt.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/fr\/\d+-(centimes?|euros?)\/?$/,
          /^\/fr\/2-euros-commemoratives(\/\d{4})?\/?$/,
          /\.(xml|txt)$/,
        ],
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
  define: { __BUILD_ID__: JSON.stringify(buildId), __APP_VERSION__: JSON.stringify(appVersion) },
  server: { port: 3006, strictPort: true, proxy },
  preview: { port: 3007, strictPort: true, proxy },
})
