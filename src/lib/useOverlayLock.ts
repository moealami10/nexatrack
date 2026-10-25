import { useEffect, useSyncExternalStore } from 'react'

/**
 * While an overlay (Modal/Drawer/sheet) is open: lock page scroll behind
 * it and close it on Escape. The mobile bottom sheets scroll their own
 * content, so the page underneath must not scroll along with them.
 *
 * A module-level counter tracks how many overlays are open so the map
 * (and any other component) can react to "an overlay is open" without
 * prop drilling.
 */

let openCount = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function useOverlayActive(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => openCount > 0,
    () => false,
  )
}

export function useOverlayLock(onClose: () => void) {
  useEffect(() => {
    openCount += 1
    emit()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openCount = Math.max(0, openCount - 1)
      emit()
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])
}