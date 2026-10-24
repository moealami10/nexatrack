/**
 * One-at-a-time action toast state (rendering lives in components/ui/Toast).
 *
 * Shows what just happened with an Undo button, auto-dismisses after 6 s.
 * A new action replaces the current toast (and restarts its timer), so the
 * Undo button always matches the label on screen.
 */

import type { TranslatableLabel } from './actionLabel'
import { onActionAnnounced } from './store'

const TOAST_MS = 6000

export interface ActionToast {
  id: number
  /** Structured (key + params) or plain; resolved at display time. */
  label: string | TranslatableLabel
  undoable: boolean
}

const listeners = new Set<() => void>()
let current: ActionToast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let nextId = 1

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ActionToast | null {
  return current
}

export { getSnapshot, subscribe }

export function dismissActionToast(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  current = null
  notify()
}

function show(label: string | TranslatableLabel, undoable: boolean): void {
  if (timer !== undefined) clearTimeout(timer)
  current = { id: nextId++, label, undoable }
  timer = setTimeout(dismissActionToast, TOAST_MS)
  notify()
}

/** Show a toast manually (e.g. the in-memory route optimization). */
export function showActionToast(
  label: string | TranslatableLabel,
  options: { undoable?: boolean } = {},
): void {
  show(label, options.undoable ?? false)
}

/** Store announcements drive toasts automatically; transactions announce
 * exactly once, after their label is finalized. */
onActionAnnounced((label) => {
  show(label, true)
})
