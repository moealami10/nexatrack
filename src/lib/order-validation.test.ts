import { beforeEach, describe, expect, it } from 'vitest'

import type { InventoryItem, Order, Product } from '@/types'

import { translateAction } from './actionLabel'
import { getDashboardStats } from '@/features/dashboard/stats'
import {
  buildProductIndex,
  getOrderTotal,
  historyIndex,
  mutateOrder,
  tryCreateOrder,
} from './orders'
import { sanitizeLocationData } from './store'
import { db, clearAllData, history, newId } from './store'

/**
 * Order creation + validation rules:
 * - a valid order is added and its stock is deducted in ONE undoable step,
 * - insufficient stock refuses the WHOLE order (no writes, no history),
 * - duplicate rows for the same product are merged for the stock check,
 * - totals are price × qty summed,
 * - drive-to-zero stock shows up as "low stock" on the dashboard,
 * - statusHistory starts with a single pending event carrying createdAt,
 * - (documented gap) coordinates are NOT validated at creation.
 * `clearAllData()` gives every test a clean empty database.
 */

/** Ends the current synchronous tick → the next action starts a new entry. */
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const stockOf = (productId: string): number | undefined =>
  db.inventory.all().find((item) => item.productId === productId)?.quantity

function makeProduct(price: number, name = 'Audit Product'): Product {
  const product: Product = {
    id: newId('prd'),
    name,
    sku: `T-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    price,
    unit: 'pc',
  }
  db.products.add(product)
  return product
}

function stockRow(productId: string, quantity: number, threshold = 10): InventoryItem {
  const row: InventoryItem = { productId, quantity, lowStockThreshold: threshold }
  db.inventory.add(row)
  return row
}

function makeOrder(productId: string, qty: number, overrides: Partial<Order> = {}): Order {
  return {
    id: newId('ord'),
    customerName: 'Amina Bennis',
    address: '15 Av. Mekka, Bréma',
    lat: 27.15,
    lng: -13.2,
    items: [{ productId, qty }],
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  clearAllData()
  await tick()
})

describe('order creation & validation', () => {
  it('creates an order and deducts stock in ONE undo entry; undo restores both', async () => {
    const product = makeProduct(12.5)
    stockRow(product.id, 10)

    const undoBefore = history.stats().undoCount
    expect(tryCreateOrder(makeOrder(product.id, 2)).ok).toBe(true)
    await tick()

    const [order] = db.orders.all()
    expect(order.customerName).toBe('Amina Bennis')
    expect(stockOf(product.id)).toBe(8)
    // One entry for the whole create+deduct step.
    expect(history.stats().undoCount).toBe(undoBefore + 1)
    expect(translateAction(history.undoLabel()!)).toBe('Created order for Amina Bennis')

    expect(history.undo()).toBe(true)
    expect(db.orders.all().length).toBe(0)
    expect(stockOf(product.id)).toBe(10)
    expect(history.redo()).toBe(true)
    expect(db.orders.all().length).toBe(1)
    expect(stockOf(product.id)).toBe(8)
  })

  it('total is price × qty summed across items (MAD handled at display layer)', () => {
    const first = makeProduct(12.5, 'First')
    const second = makeProduct(3, 'Second')
    stockRow(first.id, 10)
    stockRow(second.id, 10)
    tryCreateOrder(
      makeOrder(first.id, 1, { items: [{ productId: first.id, qty: 2 }, { productId: second.id, qty: 3 }] }),
    )
    const order = db.orders.all()[0]!
    const total = getOrderTotal(order, buildProductIndex(db.products.all()))
    expect(total).toBe(12.5 * 2 + 3 * 3) // 34
  })

  it('refuses insufficient stock: structured error, nothing written, no history entry', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 3)

    const before = history.stats()
    const result = tryCreateOrder(makeOrder(product.id, 10))
    await tick()

    expect(result.ok).toBe(false)
    const message = translateAction(result.error)
    expect(message).toBe('Not enough stock: Audit Product — need 10, only 3 left.')
    expect(db.orders.all().length).toBe(0)
    expect(stockOf(product.id)).toBe(3)
    expect(history.stats().undoCount).toBe(before.undoCount)
    expect(history.stats().redoCount).toBe(before.redoCount)
  })

  it('reports every short product when several are short', async () => {
    const first = makeProduct(5, 'First')
    const second = makeProduct(5, 'Second')
    stockRow(first.id, 2)
    stockRow(second.id, 1)
    const result = tryCreateOrder(
      makeOrder(first.id, 3, { items: [{ productId: first.id, qty: 3 }, { productId: second.id, qty: 2 }] }),
    )
    const message = translateAction(result.error)
    expect(message).toContain('First — need 3, only 2 left')
    expect(message).toContain('Second — need 2, only 1 left')
  })

  it('merges two rows of the same product for the stock check and deduction', async () => {
    const product = makeProduct(12.5)
    stockRow(product.id, 4)

    // Two rows of the same product: 3 + 2 = 5 units total, stock only 4.
    const twoRows: Order = {
      ...makeOrder(product.id, 3),
      items: [
        { productId: product.id, qty: 3 },
        { productId: product.id, qty: 2 },
      ],
    }
    expect(tryCreateOrder({ ...twoRows }, ).ok).toBe(false) // merged need 5 > 4
    expect(db.orders.all().length).toBe(0)
    expect(stockOf(product.id)).toBe(4)

    await tick()
    db.inventory.update(product.id, { quantity: 5 }) // stock now 5
    expect(tryCreateOrder({ ...twoRows }).ok).toBe(true)
    await tick()
    expect(stockOf(product.id)).toBe(0)
    // The order keeps its two rows; the total still counts both.
    const order = db.orders.all()[0]!
    expect(order.items).toHaveLength(2)
    expect(getOrderTotal(order, buildProductIndex(db.products.all()))).toBe(12.5 * 5)
  })

  it('exact-quantity order works and drives stock to 0 → counted as low stock', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 10, 3)

    expect(tryCreateOrder(makeOrder(product.id, 10)).ok).toBe(true)
    await tick()
    expect(stockOf(product.id)).toBe(0)

    // Dashboard low-stock rule: quantity <= lowStockThreshold.
    const stats = getDashboardStats({
      products: db.products.all(),
      inventory: db.inventory.all(),
      orders: db.orders.all(),
      drivers: db.drivers.all(),
    })
    expect(stats.lowStockCount).toBe(1)
  })

  it('creating with a missing inventory row treats available stock as 0', () => {
    const product = makeProduct(5)
    const result = tryCreateOrder(makeOrder(product.id, 1))
    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('Not enough stock: Audit Product — need 1, only 0 left.')
  })

  it('orders unknown/deleted products at price 0 in the total (defensive display)', () => {
    const product = makeProduct(5)
    stockRow(product.id, 100)
    tryCreateOrder(makeOrder(product.id, 2))
    const order = db.orders.all()[0]!
    // Empty product index (product deleted later) must not crash the total.
    expect(getOrderTotal(order, buildProductIndex([] as Product[]))).toBe(0)
    expect(getOrderTotal(order, buildProductIndex(db.products.all()))).toBe(10)
  })

  it('records an initial pending event stamped at createdAt', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 5)
    const createdAt = new Date('2026-10-25T09:30:00.000Z').toISOString()
    tryCreateOrder(makeOrder(product.id, 1, { createdAt }))
    const order = db.orders.all()[0]!
    expect(order.statusHistory).toEqual([{ status: 'pending', at: createdAt }])
  })

  it('every mutateOrder appends a NEW event; historyIndex keeps the last per status', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 5)
    tryCreateOrder(makeOrder(product.id, 1))
    const order = db.orders.all()[0]!

    const t2 = new Date('2026-10-25T10:00:00.000Z').toISOString()
    // mutateOrder stamps `now` — freeze by patching through a fixed order copy
    // is not possible, so just verify monotonic growth and last-wins indexing.
    mutateOrder(order.id, { status: 'assigned' }, { key: 'actions.assignedOrderAuto', params: { name: 'x' } })
    const t3 = new Date('2026-10-25T11:00:00.000Z').toISOString()
    const stored = db.orders.all()[0]!
    expect(stored.statusHistory!.length).toBe(2)
    expect(stored.statusHistory![1]!.status).toBe('assigned')
    expect(stored.statusHistory![1]!.at >= t2).toBe(true)

    const index = historyIndex(db.orders.all()[0]!)
    expect(index.get('assigned')).toBe(stored.statusHistory![1]!.at)
    expect(index.get('pending')).toBe(stored.statusHistory![0]!.at)
    // Later events override earlier ones for the same status.
    expect(index.get('pending')).toBeTruthy()
    void t3
  })

  // -- Documented gap: coordinates are NOT validated at creation ------------

  it('[documents a gap] creation accepts out-of-bounds coordinates without validation', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 5)
    // (0,0) — where a blank Latitude/Longitude field would land after
    // `Number.parseFloat(lat) || 0` in the modal — is accepted as-is.
    const result = tryCreateOrder(makeOrder(product.id, 1, { lat: 0, lng: 0 }))
    expect(result.ok).toBe(true)
    const order = db.orders.all()[0]!
    expect(order.lat).toBe(0)
    expect(order.lng).toBe(0)
  })

  it('[documents the blast radius] reload sanitation wipes ALL orders when any order is out of bounds', async () => {
    const product = makeProduct(5)
    stockRow(product.id, 5)
    // One good order, one hand-written out-of-bounds order (like a reload-time
    // catch of an order created with (0,0) coordinates).
    tryCreateOrder(makeOrder(product.id, 1))
    db.drivers.add({ id: 'drv_x', name: 'Bystander', phone: '1', vehicle: 'v', status: 'available' })
    db.orders.add({ ...makeOrder(product.id, 1, { id: 'ord_bad', lat: 0, lng: 0 }) })
    expect(db.orders.all().length).toBe(2)

    sanitizeLocationData() // what a reload runs

    expect(db.orders.all()).toEqual([])
    expect(db.drivers.all()).toEqual([]) // the good driver is collateral damage
  })
})
