// Application installée sur iPhone : la hauteur donnée par Safari (100dvh) s'arrête parfois avant le
// bas de l'écran et laisse une bande vide sous la carte. L'application y occupe pourtant tout
// l'écran : on pose sa hauteur réelle dans --app-h (lue par .app, voir index.css).
export function startScreenHeight() {
  // `standalone` n'existe que sur iOS, et ne vaut true que depuis l'écran d'accueil.
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return
  const landscape = window.matchMedia('(orientation: landscape)')
  const apply = () => {
    // Sur iOS, screen.width et screen.height ne s'échangent pas quand on tourne l'appareil.
    const long = Math.max(screen.width, screen.height)
    const short = Math.min(screen.width, screen.height)
    const height = Math.max(window.innerHeight, landscape.matches ? short : long)
    document.documentElement.style.setProperty('--app-h', `${height}px`)
  }
  apply()
  landscape.addEventListener('change', apply)
  window.addEventListener('resize', apply)
}
