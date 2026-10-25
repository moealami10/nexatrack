// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { location } from '@/config/location'
import { translateAction } from './actionLabel'
import {
  DEFAULT_SETTINGS,
  clearAllData,
  history,
  resetSettings,
  updateSettings,
  useSettings,
} from './store'

// React's act() needs this explicit opt-in (no testing-library here).
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** The settings singleton: shipped defaults equal src/config/location.ts,
 * updates are ONE undoable step, "reset to defaults" is undoable too, and
 * clearAllData hands the shipped defaults back. Uses the same minimal
 * React harness as useIsMobile.test.tsx.
 */

/** Ends the current synchronous tick → the next action starts a new entry. */
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const container = document.createElement('div')
let root: Root | null = null
let latest: ReturnType<typeof useSettings> | null = null

function Probe() {
  // Plain module assignment (no setState), so reading is synchronous and safe.
  // eslint-disable-next-line -- harness writes to a module-scoped probe, not render state
  latest = useSettings()
  return null
}

function renderHook() {
  latest = null
  act(() => {
    root = createRoot(container)
    root.render(<Probe />)
  })
}

/** The defaults assert themselves against the single source of truth. */
describe('settings store', () => {
  afterEach(() => {
    act(() => root?.unmount())
    root = null
    // Leave the shipped defaults for whatever comes next.
    act(() => resetSettings())
  })

  it('starts at the defaults from src/config/location.ts', () => {
    renderHook()
    expect(latest).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({
      cityName: location.cityName,
      depotName: location.defaultDepotName,
      depot: location.defaultDepot,
    })
  })

  it('updateSettings replaces name and depot live, as ONE undoable step', () => {
    renderHook()
    const before = history.stats().undoCount

    act(() =>
      updateSettings({
        cityName: 'Smara',
        depotName: 'Bd el Fath depot',
        depot: { lat: 26.7, lng: -14.26 },
      }),
    )
    // One history entry for the whole save.
    expect(history.stats().undoCount).toBe(before + 1)
    expect(translateAction(history.undoLabel()!)).toBe('Updated location settings')
    // The hook sees the new values immediately.
    expect(latest).toEqual({
      cityName: 'Smara',
      depotName: 'Bd el Fath depot',
      depot: { lat: 26.7, lng: -14.26 },
    })

    // Undo restores the previous object wholesale.
    act(() => history.undo())
    expect(latest).toEqual(DEFAULT_SETTINGS)
    // …and redo re-applies it.
    act(() => history.redo())
    expect(latest).toEqual({
      cityName: 'Smara',
      depotName: 'Bd el Fath depot',
      depot: { lat: 26.7, lng: -14.26 },
    })
  })

  it('resetSettings restores the shipped defaults, also as ONE undoable step', async () => {
    renderHook()
    act(() => {
      updateSettings({
        cityName: 'Dakhla',
        depotName: 'Second depot',
        depot: { lat: 23.68, lng: -15.94 },
      })
    })
    // New synchronous tick → resetSettings becomes its OWN entry.
    await tick()

    act(() => resetSettings())
    expect(translateAction(history.undoLabel()!)).toBe(
      'Reset location settings to defaults',
    )
    expect(latest).toEqual(DEFAULT_SETTINGS)

    act(() => history.undo())
    expect(latest).toEqual({
      cityName: 'Dakhla',
      depotName: 'Second depot',
      depot: { lat: 23.68, lng: -15.94 },
    })
  })

  it('clearAllData resets settings to the defaults and empties the history', () => {
    renderHook()
    act(() =>
      updateSettings({
        cityName: 'Dakhla',
        depotName: 'Second depot',
        depot: { lat: 23.68, lng: -15.94 },
      }),
    )
    expect(latest).not.toEqual(DEFAULT_SETTINGS)

    act(() => clearAllData())
    // Re-mount the probe: the harness above doesn't re-render on clear.
    renderHook()
    expect(latest).toEqual(DEFAULT_SETTINGS)
    expect(history.stats()).toEqual({ undoCount: 0, redoCount: 0 })
    expect(history.canRedo()).toBe(false)
  })
})
