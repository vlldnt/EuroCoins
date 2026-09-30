// Réglages d'affichage mémorisés dans le navigateur : thème, palette de la carte, taille du texte.
// Ils sont appliqués sur <html> (data-theme, data-palette, font-size) ; le script en tête de
// index.html fait la même chose avant le premier affichage pour éviter un flash.

export type Theme = 'system' | 'light' | 'dark'
export type Palette = 'standard' | 'protan' | 'deutan' | 'tritan' | 'achroma' | 'contrast'

export const PALETTES: Palette[] = ['standard', 'protan', 'deutan', 'tritan', 'achroma', 'contrast']
// Tailles de texte proposées (% de la taille par défaut du navigateur).
export const TEXT_SIZES = [100, 112, 125, 150] as const
export type TextSize = (typeof TEXT_SIZES)[number]

const KEYS = {
  theme: 'eurocoins.theme',
  palette: 'eurocoins.palette',
  textSize: 'eurocoins.textSize',
  coinLayout: 'eurocoins.coinLayout',
}

// Disposition des 8 pièces courantes : couronne autour de la 2 €, ligne (1 cent → 2 €), ou grille.
export type CoinLayout = 'circle' | 'row' | 'grid'
export const COIN_LAYOUTS: CoinLayout[] = ['circle', 'row', 'grid']

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // stockage indisponible (navigation privée…)
  }
}

export function readTheme(): Theme {
  const v = read(KEYS.theme)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function readPalette(): Palette {
  const v = read(KEYS.palette) as Palette | null
  return v && PALETTES.includes(v) ? v : 'standard'
}

export function readTextSize(): TextSize {
  const v = Number(read(KEYS.textSize))
  return (TEXT_SIZES as readonly number[]).includes(v) ? (v as TextSize) : 100
}

// « system » = on suit le réglage du système (prefers-color-scheme) : pas d'attribut data-theme.
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  write(KEYS.theme, theme === 'system' ? null : theme)
}

export function applyPalette(palette: Palette) {
  const root = document.documentElement
  if (palette === 'standard') delete root.dataset.palette
  else root.dataset.palette = palette
  write(KEYS.palette, palette === 'standard' ? null : palette)
}

// Toute l'interface est en rem : changer la taille de <html> agrandit texte, boutons et espacements.
export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = size === 100 ? '' : `${size}%`
  write(KEYS.textSize, size === 100 ? null : String(size))
}

export function readCoinLayout(): CoinLayout {
  const v = read(KEYS.coinLayout) as CoinLayout | null
  return v && COIN_LAYOUTS.includes(v) ? v : 'circle'
}

export function saveCoinLayout(layout: CoinLayout) {
  write(KEYS.coinLayout, layout === 'circle' ? null : layout)
}
