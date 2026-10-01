import { useEffect, useState } from 'react'

/**
 * Garde affiché le dernier élément quelques instants après sa fermeture, pour jouer une animation
 * de sortie : `leaving` est vrai pendant ce délai. Un nouvel élément s'affiche immédiatement.
 */
export function useDelayedUnmount<T>(value: T | null, ms: number): { item: T | null; leaving: boolean } {
  const [state, setState] = useState<{ item: T | null; leaving: boolean }>({ item: value, leaving: false })

  // Mise à jour immédiate pendant le rendu quand un élément apparaît ou change.
  if (value !== null && (state.item !== value || state.leaving)) {
    setState({ item: value, leaving: false })
  } else if (value === null && state.item !== null && !state.leaving) {
    setState({ item: state.item, leaving: true })
  }

  useEffect(() => {
    if (!state.leaving) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setState({ item: null, leaving: false }), reduce ? 0 : ms)
    return () => window.clearTimeout(timer)
  }, [state.leaving, ms])

  return state
}
