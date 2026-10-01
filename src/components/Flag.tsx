import type { ComponentType } from 'react'
import {
  AD, AT, BE, BG, CN, CY, DE, EE, ES, FI, FR, GR, HR, IE, IN, IT, JP, LT, LU, LV, MC, MT, NL, PT, SI, SK, SM, VA,
} from 'country-flag-icons/react/3x2'

// Imports explicites : seuls ces drapeaux finissent dans le bundle.
const FLAGS: Record<string, ComponentType<{ className?: string; preserveAspectRatio?: string }>> = {
  ad: AD, at: AT, be: BE, bg: BG, cn: CN, cy: CY, de: DE, ee: EE, es: ES, fi: FI, fr: FR, gr: GR, hr: HR, ie: IE,
  in: IN, it: IT, jp: JP, lt: LT, lu: LU, lv: LV, mc: MC, mt: MT, nl: NL, pt: PT, si: SI, sk: SK, sm: SM, va: VA,
  eo: EsperantoFlag,
}

// Drapeau de l'espéranto (pas de pays, donc absent de country-flag-icons) : fond vert,
// carré blanc en haut à gauche avec une étoile verte.
function EsperantoFlag(props: { className?: string; preserveAspectRatio?: string }) {
  return (
    <svg viewBox="0 0 30 20" {...props}>
      <rect width="30" height="20" fill="#009900" />
      <rect width="10" height="10" fill="#fff" />
      <path
        fill="#009900"
        d="M5 1.6l.94 2.9h3.05l-2.47 1.8.94 2.9L5 7.4 2.54 9.2l.94-2.9L1.01 4.5h3.05z"
      />
    </svg>
  )
}

/**
 * Drapeau SVG d'un pays (code ISO en minuscules), ou de l'espéranto (« eo »). Décoratif : le nom est donné à côté.
 * `cover` : remplit tout son cadre en rognant (fond de bandeau) au lieu de garder ses proportions.
 */
export function Flag({ id, cover = false }: { id: string; cover?: boolean }) {
  const Component = FLAGS[id]
  if (!Component) return null
  return <Component className="flag" {...(cover ? { preserveAspectRatio: 'xMidYMid slice' } : {})} />
}

