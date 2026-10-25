import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function storage(): StorageShim {
  return globalThis.localStorage as unknown as StorageShim
}

describe('location-data sanitizer', () => {
  it('wipes orders, drivers and route plans when a Casablanca order is present', async () => {
    const s = storage()
    s.setItem('nexatrack:v4:orders', JSON.stringify([
      { id: 'ord_old', customerName: 'X', address: 'Casablanca', lat: 33.57, lng: -7.59, items: [], status: 'pending', createdAt: new Date().toISOString() },
    ]))
    s.setItem('nexatrack:v4:drivers', JSON.stringify([{ id: 'drv_old', name: 'Old', phone: '+212 6 00 00 00 00', vehicle: 'x', status: 'available' }]))
    s.setItem('nexatrack:v4:routePlans', JSON.stringify([{ driverId: 'drv_old', plan: { distanceKm: 0, estimatedMinutes: 0, stops: [] } }]))
    s.setItem('nexatrack:v4:products', '[]')
    s.setItem('nexatrack:v4:inventory', '[]')

    await loadStore()

    const { db } = await import('./store')
    expect(db.orders.all()).toEqual([])
    expect(db.drivers.all()).toEqual([])
    expect(db.routePlans.all()).toEqual([])
    expect(db.products.all()).toEqual([])
  })

  it('wipes when coordinates are out of bounds even without Casablanca text', async () => {
    const s = storage()
    s.setItem('nexatrack:v4:orders', JSON.stringify([
      { id: 'ord_old', customerName: 'X', address: 'Somewhere', lat: 33.57, lng: -7.59, items: [], status: 'pending', createdAt: new Date().toISOString() },
    ]))
    s.setItem('nexatrack:v4:drivers', '[]')
    s.setItem('nexatrack:v4:routePlans', '[]')
    s.setItem('nexatrack:v4:products', '[]')
    s.setItem('nexatrack:v4:inventory', '[]')

    await loadStore()
    const { db } = await import('./store')
    expect(db.orders.all()).toEqual([])
  })

  it('keeps valid Laayoune data untouched', async () => {
    const s = storage()
    const order = { id: 'ord_ok', customerName: 'A', address: 'Centre-ville', lat: 27.15, lng: -13.20, items: [], status: 'pending', createdAt: new Date().toISOString() }
    s.setItem('nexatrack:v4:orders', JSON.stringify([order]))
    s.setItem('nexatrack:v4:drivers', '[]')
    s.setItem('nexatrack:v4:routePlans', '[]')
    s.setItem('nexatrack:v4:products', '[]')
    s.setItem('nexatrack:v4:inventory', '[]')

    await loadStore()
    const { db } = await import('./store')
    expect(db.orders.all()).toHaveLength(1)
  })
})
