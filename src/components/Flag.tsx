import type { ComponentType } from 'react'
import {
  AD, AT, BE, BG, CN, CY, DE, EE, ES, FI, FR, GR, HR, IE, IN, IT, JP, LT, LU, LV, MC, MT, NL, PT, SI, SK, SM, VA,
} from 'country-flag-icons/react/3x2'

// Imports explicites : seuls ces drapeaux finissent dans le bundle.
const FLAGS: Record<string, ComponentType<{ className?: string; preserveAspectRatio?: string }>> = {
  ad: AD, at: AT, be: BE, bg: BG, cn: CN, cy: CY, de: DE, ee: EE, es: ES, fi: FI, fr: FR, gr: GR, hr: HR, ie: IE,
  in: IN, it: IT, jp: JP, lt: LT, lu: LU, lv: LV, mc: MC, mt: MT, nl: NL, pt: PT, si: SI, sk: SK, sm: SM, va: VA,
}

/**
 * Drapeau SVG d'un pays (code ISO en minuscules). Décoratif : le nom est donné à côté.
 * `cover` : remplit tout son cadre en rognant (fond de bandeau) au lieu de garder ses proportions.
 */
export function Flag({ id, cover = false }: { id: string; cover?: boolean }) {
  const Component = FLAGS[id]
  if (!Component) return null
  return <Component className="flag" {...(cover ? { preserveAspectRatio: 'xMidYMid slice' } : {})} />
}

