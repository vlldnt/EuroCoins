// Formats d'écran (mêmes seuils que index.css).

/** Téléphone tenu en paysage : peu de hauteur, fiche pays sur le côté. */
export const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 500px)'

/** Paysage à hauteur limitée (tablettes, petits portables) : fiche pays compacte et plus étroite. */
export const COMPACT_LANDSCAPE =
  '(min-width: 700px) and (orientation: landscape) and (min-height: 501px) and (max-height: 900px)'

/** Formats où la liste des pays est une rangée de drapeaux en bas de la carte (et pas une colonne). */
export const FLAG_ROW = [
  '(max-width: 699px)',
  '(min-width: 700px) and (max-width: 1199px) and (orientation: portrait)',
  PHONE_LANDSCAPE,
].join(', ')
