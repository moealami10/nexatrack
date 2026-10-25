import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The app previously stored its data under `nexatrack:v2:` (and, even
 * earlier, `deliveryhub:`) keys. store.ts now runs a WIPE migration at
 * module load: every key under a legacy prefix is DELETED, never copied,
 * so stale demo or user data can't resurface. These tests re-import the
 * module against a fresh in-memory localStorage to exercise that purge.
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
    clear: () => void map.clear(),
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

async function loadStore() {
  await import('./store')
}

/** The five v3 collection keys every fresh install must persist. */
const V4_COLLECTION_KEYS = [
  'nexatrack:v4:products',
  'nexatrack:v4:inventory',
  'nexatrack:v4:orders',
  'nexatrack:v4:drivers',
  'nexatrack:v4:routePlans',
]

function storage(): StorageShim {
  return globalThis.localStorage as unknown as StorageShim
}

describe('legacy data migration (wipe semantics)', () => {
  it('a fresh install loads empty collections and persists [] baselines', async () => {
    await loadStore()

    for (const key of V4_COLLECTION_KEYS) {
      expect(storage().getItem(key)).toBe('[]')
    }
  })

  it('wipes ALL legacy v2 keys instead of copying them (old demo data never returns)', async () => {
    const legacyDemo = JSON.stringify([
      { id: 'prd_old', name: 'Legacy Cola', sku: 'OLD-1', unit: 'pc', price: 9 },
    ])
    const legacy = storage()
    legacy.setItem('nexatrack:v2:products', legacyDemo)
    legacy.setItem('nexatrack:v2:orders', '[{"id":"ord_old"}]')
    legacy.setItem('nexatrack:v2:routePlans', '[{"driverId":"drv_old","plan":{}}]')

    await loadStore()

    // Every legacy key is gone…
    const remainingLegacy = legacy
      .entries()
      .filter(([key]) => key.startsWith('nexatrack:v2:'))
    expect(remainingLegacy).toEqual([])
    // …and the new collections are empty, not seeded with the old data.
    expect(storage().getItem('nexatrack:v4:products')).toBe('[]')
    expect(storage().getItem('nexatrack:v4:orders')).toBe('[]')
    expect(storage().getItem('nexatrack:v4:routePlans')).toBe('[]')
  })

  it('also purges the earliest deliveryhub keys (v1/v2 alike)', async () => {
    const legacy = storage()
    legacy.setItem('deliveryhub:v1:cart', '[{"productId":1}]')
    legacy.setItem('deliveryhub:v2:products', '[{"id":"prd_dh"}]')

    await loadStore()

    expect(legacy.entries().filter(([key]) => key.startsWith('deliveryhub:'))).toEqual([])
  })

  it('purges legacy keys even when the new v3 keys already exist', async () => {
    const legacy = storage()
    legacy.setItem('nexatrack:v2:drivers', '[{"id":"drv_old","name":"Old"}]')
    legacy.setItem('nexatrack:v4:drivers', '[]')

    await loadStore()

    expect(legacy.getItem('nexatrack:v2:drivers')).toBeNull()
    expect(legacy.getItem('nexatrack:v4:drivers')).toBe('[]')
  })

  it('leaves unrelated keys untouched', async () => {
    const legacy = storage()
    legacy.setItem('theme', 'dark')
    legacy.setItem('my-tracker:v2:products', '[{"id":"prd_other"}]')

    await loadStore()

    expect(legacy.getItem('theme')).toBe('dark')
    expect(legacy.getItem('my-tracker:v2:products')).toBe('[{"id":"prd_other"}]')
  })

  it('in-memory collections start empty after the purge (no crash, no seed)', async () => {
    const { db, history } = await import('./store')

    expect(db.products.all()).toEqual([])
    expect(db.inventory.all()).toEqual([])
    expect(db.orders.all()).toEqual([])
    expect(db.drivers.all()).toEqual([])
    expect(db.routePlans.all()).toEqual([])

    // Undo history is never persisted, so it is empty on a fresh load too.
    expect(history.stats()).toEqual({ undoCount: 0, redoCount: 0 })
    expect(history.canUndo()).toBe(false)
  })
})
