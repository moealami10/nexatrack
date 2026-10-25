import { useEffect } from 'react'

/**
 * While an overlay (Modal/Drawer/sheet) is open: lock page scroll behind
 * it and close it on Escape. The mobile bottom sheets scroll their own
 * content, so the page underneath must not scroll along with them.
 */
export function useOverlayLock(onClose: () => void) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])
}
