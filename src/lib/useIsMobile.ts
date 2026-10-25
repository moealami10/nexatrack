import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/**
 * True below the `md` (768px) Tailwind breakpoint. Used for dual
 * rendering (cards vs tables) where CSS-only toggling would render
 * both and break semantics; pair with `md:`/`md:hidden` classes when
 * the difference is purely visual.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
