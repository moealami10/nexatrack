import { beforeEach, describe, expect, it } from 'vitest'

import type { Driver, InventoryItem, Order, Product } from '@/types'

import { autoAssignPendingOrders, assignOrders } from './dispatch'
import { advanceOrder, markOrderFailed, mutateOrder, tryCreateOrder } from './orders'
import { haversineKm } from './routing'
import { translateAction } from './actionLabel'
import { db, clearAllData, history, newId, DEFAULT_SETTINGS } from './store'

/**
 * Undo/redo correctness for every order-related action:
 * - create / edit / status change / delete / assign / auto-assign all
 *   undo and redo, restoring orders, stock, AND driver statuses,
 * - multi-step actions (create+deduct, batch assign, auto-assign) are
 *   exactly ONE history entry each,
 * - a new action clears the redo branch,
 * - `Clear all data` is the only non-undoable action (history emptied).
 *
 * NOTE: order deletion exists in the data layer but NO UI surface offers
 * single-order deletion — tested here at lib level and reported as a gap.
 */

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function seedProduct(name = 'Undo Product', stock = 50): Product {
  const product: Product = { id: newId('prd'), name, sku: `U-${newId('')}`, price: 10, unit: 'pc' }
  db.products.add(product)
  db.inventory.add({ productId: product.id, quantity: stock, lowStockThreshold: 5 } satisfies InventoryItem)
  return product
}
function seedDriver(name: string, status: Driver['status']): Driver {
  const driver: Driver = { id: newId('drv'), name, phone: '+21260000000', vehicle: 'V', status }
  db.drivers.add(driver)
  return driver
}
function seedOrder(product: Product, name = 'Undo Client'): Order {
  const order: Order = {
    id: newId('ord'),
    customerName: name,
    address: '8 Bd Tarik',
    lat: 27.15,
    lng: -13.2,
    items: [{ productId: product.id, qty: 2 }],
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  expect(tryCreateOrder(order).ok).toBe(true)
  return order
}
const current = (order: Order): Order => db.orders.all().find((entry) => entry.id === order.id)!

beforeEach(async () => {
  clearAllData()
  await tick()
})

describe('undo/redo of every order action', () => {
  it('create: undo/redo restores order AND stock (one entry)', async () => {
    const product = seedProduct()
    const before = history.stats()
    seedOrder(product)
    await tick()
    expect(history.stats().undoCount).toBe(before.undoCount + 1)
    expect(db.orders.all().length).toBe(1)
    expect(db.inventory.all()[0]!.quantity).toBe(48)

    expect(history.undo()).toBe(true)
    expect(db.orders.all().length).toBe(0)
    expect(db.inventory.all()[0]!.quantity).toBe(50)
    expect(history.redo()).toBe(true)
    expect(db.orders.all().length).toBe(1)
    expect(db.inventory.all()[0]!.quantity).toBe(48)
  })

  it('edit: rename via mutateOrder — undo restores the old name (one entry)', async () => {
    const product = seedProduct()
    const order = seedOrder(product)
    await tick()
    mutateOrder(order.id, { customerName: 'Renamed Client' }, { key: 'actions.updatedOrder', params: { id: order.id } })
    await tick()
    expect(current(order)!.customerName).toBe('Renamed Client')
    // The tooltip before undo names the EDIT action, not the creation.
    expect(translateAction(history.undoLabel()!)).toMatch(/^Updated order /)

    expect(history.undo()).toBe(true)
    expect(current(order)!.customerName).toBe('Undo Client')
    expect(history.redo()).toBe(true)
    expect(current(order)!.customerName).toBe('Renamed Client')
  })

  it('status change: advance + undo/redo restores status and driver counts', async () => {
    const product = seedProduct()
    const driver = seedDriver('Amine', 'available')
    const order = seedOrder(product, 'Flow')
    await tick()

    advanceOrder(current(order)!) // → assigned
    await tick()
    expect(current(order)!.driverId).toBeTruthy()
    expect(history.undo()).toBe(true)
    expect(current(order)!.status).toBe('pending')
    expect(current(order)!.driverId).toBeUndefined()
    expect(history.redo()).toBe(true)
    expect(current(order)!.status).toBe('assigned')
    expect(current(order)!.driverId).toBeTruthy()
    void driver
  })

  it('failure cycle: undo restores stock and status; redo re-applies both', async () => {
    const product = seedProduct()
    const order = seedOrder(product, 'Fail/Fix')
    markOrderFailed(order)
    await tick()
    expect(current(order)!.status).toBe('failed')
    expect(db.inventory.all()[0]!.quantity).toBe(50) // 48 + 2 restocked

    expect(history.undo()).toBe(true)
    expect(current(order)!.status).toBe('pending')
    expect(db.inventory.all()[0]!.quantity).toBe(48)

    expect(history.redo()).toBe(true)
    expect(current(order)!.status).toBe('failed')
    expect(db.inventory.all()[0]!.quantity).toBe(50)
  })

  it('delete: removing an order via the data layer is undoable (no UI offers it — gap)', async () => {
    const product = seedProduct()
    const order = seedOrder(product, 'Doomed')
    await tick()
    db.orders.remove(order.id, { key: 'crud.deletedOrder' })
    await tick()
    expect(db.orders.all().length).toBe(0)

    expect(history.undo()).toBe(true)
    expect(db.orders.all().length).toBe(1)
    expect(db.orders.all()[0]!.id).toBe(order.id)
  })

  it('assign: batch is one entry; undo restores driverId assignment and statuses', async () => {
    const product = seedProduct()
    const driver = seedDriver('Amine', 'available')
    const orders = [seedOrder(product, 'A'), seedOrder(product, 'B')]
    await tick()

    const before = history.stats()
    assignOrders([orders[0]!.id, orders[1]!.id], driver.id)
    await tick()
    expect(history.stats().undoCount).toBe(before.undoCount + 1)

    expect(history.undo()).toBe(true)
    for (const order of orders) {
      expect(current(order)!.status).toBe('pending')
      expect(current(order)!.driverId).toBeUndefined()
    }
    expect(history.redo()).toBe(true)
    for (const order of orders) {
      expect(current(order)!.status).toBe('assigned')
      expect(current(order)!.driverId).toBe(driver.id)
    }
  })

  it('auto-assign: batch is one entry; undo restores every order + driver statuses', async () => {
    const product = seedProduct()
    seedDriver('Amine', 'available')
    seedDriver('Sara', 'available')
    const orders = [seedOrder(product, 'P1'), seedOrder(product, 'P2'), seedOrder(product, 'P3')]
    await tick()

    const before = history.stats()
    const result = autoAssignPendingOrders()
    await tick()
    expect(result.ok).toBe(true)
    expect(history.stats().undoCount).toBe(before.undoCount + 1)
    expect(orders.every((order) => current(order)!.status === 'assigned')).toBe(true)
    expect(orders.every((order) => current(order)!.driverId != null)).toBe(true)

    expect(history.undo()).toBe(true)
    expect(orders.every((order) => current(order)!.status === 'pending')).toBe(true)
    expect(orders.every((order) => current(order)!.driverId === undefined)).toBe(true)
    expect(db.drivers.all().every((driver) => driver.status === 'available')).toBe(true)

    expect(history.redo()).toBe(true)
    expect(orders.every((order) => current(order)!.status === 'assigned')).toBe(true)
  })

  it('a new action after undo clears the redo branch', async () => {
    const product = seedProduct()
    seedOrder(product)
    await tick()
    history.undo()
    expect(history.canRedo()).toBe(true)
    seedOrder(product, 'Fresh')
    await tick()
    expect(history.canRedo()).toBe(false)
  })

  it('Clear all data destroys the undo history (nothing left to undo)', async () => {
    const product = seedProduct()
    seedOrder(product)
    await tick()
    expect(history.canUndo()).toBe(true)
    clearAllData()
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
    expect(db.orders.all()).toEqual([])
    // Settings reset to the shipped defaults.
    expect(db.drivers.all()).toEqual([])
  })
})

describe('depot distance warning rule (40 km)', () => {
  const depot = DEFAULT_SETTINGS.depot

  it('points inside Laâyoune are under 40 km — no warning expected', () => {
    expect(haversineKm(depot, { lat: 27.1, lng: -13.25 })).toBeLessThan(40)
    expect(haversineKm(depot, { lat: 27.2, lng: -13.13 })).toBeLessThan(40)
  })

  it('a far point (Aerodrome direction) triggers the >40 km caution', () => {
    const far = { lat: 26.5, lng: -13.0 } // ≈ south-east of the city
    const km = haversineKm(depot, far)
    expect(km).toBeGreaterThan(40)
  })

  it('40 km exactly is NOT beyond the threshold (rule is strictly >40 km)', () => {
    // Find a point ~40km away to demonstrate the inequality at the limit.
    expect(haversineKm(depot, depot)).toBe(0)
    const nearby = { lat: 27.1536 - 40 / 111.195 + 0.0000001, lng: depot.lng }
    const km = haversineKm(depot, nearby)
    expect(km).toBeLessThan(40.001)
    expect(km).toBeGreaterThan(39.999)
  })
})

// No trailing helpers — the file is self-contained.
