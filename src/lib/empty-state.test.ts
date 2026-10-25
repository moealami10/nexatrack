import { beforeEach, describe, expect, it, vi } from 'vitest'

import { translateAction } from './actionLabel'

/**
 * Empty-start behavior: the app ships with no data; the demo dataset only
 * enters via the explicit `installDemoData()` action (sidebar "Load demo
 * data"), and "Clear all data" empties everything in a non-undoable way.
 */

type StorageShim = ReturnType<typeof createMemoryStorage>

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    entries: () => [...map.entries()],
  }
}

beforeEach(() => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
})

async function freshStore() {
  const [store, demoData] = await Promise.all([
    import('./store'),
    import('./demoData'),
  ])
  return { store, demoData }
}

function storage(): StorageShim {
  return globalThis.localStorage as unknown as StorageShim
}

describe('demo data install', () => {
  it('is a single undoable entry whose label summarizes the load, and undo returns to empty', async () => {
    const { store, demoData } = await freshStore()
    const { db, history } = store

    expect(history.canUndo()).toBe(false)

    demoData.installDemoData()

    expect(history.stats().undoCount).toBe(1)
    expect(translateAction(history.undoLabel() ?? undefined)).toContain('Loaded demo data')
    expect(translateAction(history.undoLabel() ?? undefined)).toContain('products')
    expect(translateAction(history.undoLabel() ?? undefined)).toContain('drivers')

    expect(db.products.all().length).toBeGreaterThan(0)
    expect(db.inventory.all().length).toBe(db.products.all().length)
    expect(db.orders.all().length).toBeGreaterThan(0)
    expect(db.drivers.all().length).toBeGreaterThan(0)
    expect(db.routePlans.all()).toEqual([])

    // One undo reverts the whole load back to the empty start.
    expect(history.undo()).toBe(true)
    expect(db.products.all()).toEqual([])
    expect(db.inventory.all()).toEqual([])
    expect(db.orders.all()).toEqual([])
    expect(db.drivers.all()).toEqual([])
    expect(history.canUndo()).toBe(false)
  })

  it('persists the loaded demo data under the v3 keys', async () => {
    const { demoData } = await freshStore()

    demoData.installDemoData()

    expect(JSON.parse(storage().getItem('nexatrack:v4:products')!).length).toBeGreaterThan(0)
    expect(JSON.parse(storage().getItem('nexatrack:v4:orders')!).length).toBeGreaterThan(0)
  })
})

describe('clear all data', () => {
  it('empties every collection, persists [] baselines, and resets the undo history', async () => {
    const { store, demoData } = await freshStore()
    const { db, history } = store

    demoData.installDemoData()
    expect(db.products.all().length).toBeGreaterThan(0)

    store.clearAllData()

    expect(db.products.all()).toEqual([])
    expect(db.inventory.all()).toEqual([])
    expect(db.orders.all()).toEqual([])
    expect(db.drivers.all()).toEqual([])
    expect(db.routePlans.all()).toEqual([])

    // NOT undoable: history is wiped in both directions.
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
    expect(history.undoLabel()).toBeNull()

    // Storage reflects the empty state, not deleted keys.
    for (const key of [
      'nexatrack:v4:products',
      'nexatrack:v4:inventory',
      'nexatrack:v4:orders',
      'nexatrack:v4:drivers',
      'nexatrack:v4:routePlans',
    ]) {
      expect(storage().getItem(key)).toBe('[]')
    }
  })

  it('an empty app also becomes empty after clearAllData (idempotent, no crash)', async () => {
    const { store } = await freshStore()
    const { db, history } = store

    store.clearAllData()

    expect(db.products.all()).toEqual([])
    expect(db.drivers.all()).toEqual([])
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
  })
})
