// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useIsMobile } from './useIsMobile'

if (!('matchMedia' in window) || typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

/**
 * Minimal hook harness (the project has no @testing-library): mounts the
 * hook into jsdom and lets the test read the latest value.
 */
const container = document.createElement('div')
let root: Root | null = null
let latest: boolean | null = null

function Probe() {
  // Plain module assignment (no setState), so reading is synchronous and safe.
  // eslint-disable-next-line -- harness writes to a module-scoped probe, not render state
  latest = useIsMobile()
  return null
}

function renderHook() {
  latest = null
  act(() => {
    root = createRoot(container)
    root.render(<Probe />)
  })
}

/**
 * The phone/desktop boundary: true below the `md` breakpoint (767px and
 * under), false from 768px up, and reactively updated when the viewport
 * crosses the breakpoint.
 */
describe('useIsMobile', () => {
  afterEach(() => {
    act(() => root?.unmount())
    root = null
    vi.restoreAllMocks()
  })

  /** matchMedia stub that records change listeners; fire() simulates resize. */
  function stubMatchMedia() {
    const listeners: Array<(event: { matches: boolean }) => void> = []
    const mql = {
      matches: false,
      media: '(max-width: 767px)',
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        listeners.push(listener),
      removeEventListener: vi.fn(),
    }
    const fire = (matches: boolean) => {
      mql.matches = matches
      listeners.forEach((listener) => listener({ matches }))
    }
    // jsdom's matchMedia is unusable for resize events; replace it directly.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (_query: string) => mql,
    })
    return { mql, fire }
  }

  it('reports false at desktop widths', () => {
    stubMatchMedia()
    renderHook()
    expect(latest).toBe(false)
  })

  it('reports true at phone widths', () => {
    const { mql } = stubMatchMedia()
    mql.matches = true
    renderHook()
    expect(latest).toBe(true)
  })

  it('follows the breakpoint when the viewport crosses it', () => {
    const { fire } = stubMatchMedia()
    renderHook()
    expect(latest).toBe(false)

    act(() => fire(true))
    expect(latest).toBe(true)

    act(() => fire(false))
    expect(latest).toBe(false)
  })
})
