import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Masque un élément avec hidden="until-found" : invisible, mais la recherche du navigateur (Ctrl+F)
 * y trouve le texte. Sur une correspondance, le navigateur déclenche « beforematch » et retire
 * l'attribut ; onFound synchronise alors l'état (onglet, filtre…).
 * Navigateurs sans support : l'attribut se comporte comme un hidden classique.
 */
export function useUntilFound<T extends HTMLElement>(hidden: boolean, onFound: () => void) {
  const node = useRef<T | null>(null)
  const onFoundRef = useRef(onFound)
  useEffect(() => {
    onFoundRef.current = onFound
  })

  useLayoutEffect(() => {
    if (!node.current) return
    if (hidden) node.current.setAttribute('hidden', 'until-found')
    else node.current.removeAttribute('hidden')
  }, [hidden])

  return useCallback((el: T | null) => {
    node.current = el
    if (!el) return
    const handler = () => onFoundRef.current()
    el.addEventListener('beforematch', handler)
    return () => {
      el.removeEventListener('beforematch', handler)
      node.current = null
    }
  }, [])
}
