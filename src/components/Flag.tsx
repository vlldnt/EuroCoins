import type { ComponentType } from 'react'
import {
  AD, AT, BE, BG, CN, CY, DE, EE, ES, FI, FR, GR, HR, IE, IN, IT, JP, LT, LU, LV, MC, MT, NL, PT, SI, SK, SM, VA,
} from 'country-flag-icons/react/3x2'

// Imports explicites : seuls ces drapeaux finissent dans le bundle.
const FLAGS: Record<string, ComponentType<{ className?: string; title?: string }>> = {
  ad: AD, at: AT, be: BE, bg: BG, cn: CN, cy: CY, de: DE, ee: EE, es: ES, fi: FI, fr: FR, gr: GR, hr: HR, ie: IE,
  in: IN, it: IT, jp: JP, lt: LT, lu: LU, lv: LV, mc: MC, mt: MT, nl: NL, pt: PT, si: SI, sk: SK, sm: SM, va: VA,
}

/** Drapeau SVG d'un pays (code ISO en minuscules). Décoratif : le nom est donné à côté. */
export function Flag({ id }: { id: string }) {
  const Component = FLAGS[id]
  return Component ? <Component className="flag" /> : null
}

