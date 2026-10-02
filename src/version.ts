// Version de l'appli (« v1.10 »), lue dans package.json au build (vite.config.ts).
declare global {
  const __APP_VERSION__: string
}

export const APP_VERSION = __APP_VERSION__
