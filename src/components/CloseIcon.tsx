// Croix des boutons « Fermer » : tracé SVG centré au pixel près (le caractère « × » ne l'est jamais).
export function CloseIcon() {
  return (
    <svg className="close-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}
