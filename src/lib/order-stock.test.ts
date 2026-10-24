import { beforeEach, describe, expect, it } from 'vitest'

import type { InventoryItem, Order, Product } from '@/types'

import {
  cancelOrder,
  markOrderFailed,
  reactivateOrder,
  tryCreateOrder,
} from './orders'
import { translateAction } from './actionLabel'
import { db, history, newId } from './store'

/**
 * Inventory-aware order status changes:
 * - failing/cancelling an active order returns its stock exactly once,
 * - reactivating deducts it again (refused without data writes when stock
 *   is insufficient),
 * - every transition is ONE history entry and undo/redo reverses both the
 *   status and the stock change.
 * Each test gets its own product+inventory row so scenarios stay isolated.
 */

/** Ends the current synchronous tick → the next action starts a new entry. */
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const stockOf = (productId: string): number | undefined =>
  db.inventory.all().find((item) => item.productId === productId)?.quantity

const orderOf = (order: Order): Order | undefined =>
  db.orders.all().find((entry) => entry.id === order.id)

const stats = () => history.stats()

describe('order status & inventory sync', () => {
  beforeEach(async () => {
    // A mutation in a previous test must not bleed into the next tick.
    await tick()
  })

  function setup(quantity = 100): { product: Product; inventory: InventoryItem } {
    const product: Product = {
      id: newId('prd_t'),
      name: `Stock Probe ${newId('')}`,
      sku: `T-STK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      price: 5,
      unit: 'pc',
    }
    db.products.add(product)
    const inventory: InventoryItem = {
      productId: product.id,
      quantity,
      lowStockThreshold: 10,
    }
    db.inventory.add(inventory)
    return { product, inventory }
  }

  function mkOrder(productId: string, qty: number, name = 'Stock Buyer'): Order {
    return {
      id: newId('ord_t'),
      customerName: name,
      address: '1 Test Lane, Casablanca',
      lat: 33.5,
      lng: -7.6,
      items: [{ productId, qty }],
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  }

  it('failing an order returns its stock in ONE undoable step', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!
    const order = mkOrder(product.id, 2)
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()
    expect(stockOf(product.id)).toBe(seed - 2)

    const before = stats()
    markOrderFailed(orderOf(order)!)
    await tick()

    // Status + stock in exactly one entry.
    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true)
    expect(stockOf(product.id)).toBe(seed) // deducted 2, returned 2
    expect(translateAction(history.undoLabel()!)).toBe(
      "Marked Stock Buyer's order as failed — returned 2 items to stock",
    )

    // Undo reverses BOTH parts; redo re-applies BOTH parts.
    expect(history.undo()).toBe(true)
    expect(orderOf(order)!.status).toBe('pending')
    expect(orderOf(order)!.restocked).toBeUndefined()
    expect(stockOf(product.id)).toBe(seed - 2)
    expect(history.redo()).toBe(true)
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true)
    expect(stockOf(product.id)).toBe(seed)
  })

  it('cancelling behaves like failing: one entry, stock back, undo/redo', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!
    const order = mkOrder(product.id, 3, 'Cancel Buyer')
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()

    const before = stats()
    cancelOrder(orderOf(order)!)
    await tick()

    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(orderOf(order)!.status).toBe('cancelled')
    expect(orderOf(order)!.restocked).toBe(true)
    expect(stockOf(product.id)).toBe(seed)
    expect(translateAction(history.undoLabel()!)).toBe(
      "Cancelled Cancel Buyer's order — returned 3 items to stock",
    )

    expect(history.undo()).toBe(true)
    expect(orderOf(order)!.status).toBe('pending')
    expect(stockOf(product.id)).toBe(seed - 3)
    expect(history.redo()).toBe(true)
    expect(orderOf(order)!.status).toBe('cancelled')
    expect(stockOf(product.id)).toBe(seed)
    history.undo()
  })

  it('reactivates with enough stock: deducts again, ONE undoable step', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!
    const order = mkOrder(product.id, 2, 'Return Buyer')
    expect(tryCreateOrder(order).ok).toBe(true)
    markOrderFailed(orderOf(order)!)
    await tick()

    const before = stats()
    const result = reactivateOrder(orderOf(order)!)
    await tick()

    expect(result.ok).toBe(true)
    expect(result.units).toBe(2)
    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(orderOf(order)!.status).toBe('pending')
    expect(orderOf(order)!.restocked).toBe(false)
    expect(orderOf(order)!.driverId).toBeUndefined()
    expect(stockOf(product.id)).toBe(seed - 2)
    expect(translateAction(history.undoLabel()!)).toBe(
      "Reactivated Return Buyer's order — deducted 2 items from stock",
    )

    expect(history.undo()).toBe(true)
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true)
    expect(stockOf(product.id)).toBe(seed)
    expect(history.redo()).toBe(true)
    expect(orderOf(order)!.status).toBe('pending')
    expect(stockOf(product.id)).toBe(seed - 2)
    history.undo()
  })

  it('refuses to reactivate when stock is insufficient — no writes, no history entry', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!
    const order = mkOrder(product.id, 5, 'Blocked Buyer')
    expect(tryCreateOrder(order).ok).toBe(true)
    markOrderFailed(orderOf(order)!)
    await tick()
    expect(stockOf(product.id)).toBe(seed)

    // Drive available stock under the order's need: 1 < 5.
    db.inventory.update(product.id, { quantity: 1 })
    await tick()
    expect(stockOf(product.id)).toBe(1)

    const before = stats()
    const result = reactivateOrder(orderOf(order)!)
    await tick()

    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toMatch(
      /^Not enough stock to reactivate:.*need 5, only 1 left/,
    )
    // Blocked transition changed nothing: status, stock, and history.
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true)
    expect(stockOf(product.id)).toBe(1)
    expect(stats().undoCount - before.undoCount).toBe(0)
    expect(stats().redoCount).toBe(before.redoCount)
  })

  it('never restocks twice: repeat calls, fail/reactivate cycles stay balanced', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!
    const order = mkOrder(product.id, 4, 'Cycle Buyer')
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()
    expect(stockOf(product.id)).toBe(seed - 4)

    markOrderFailed(orderOf(order)!)
    await tick()
    expect(stockOf(product.id)).toBe(seed)

    // A second fail call on the failed order is a no-op — no stock, no entry.
    const before = stats()
    markOrderFailed(orderOf(order)!)
    await tick()
    expect(stockOf(product.id)).toBe(seed)
    expect(stats().undoCount - before.undoCount).toBe(0)

    // A full fail → reactivate → fail cycle returns stock exactly once each time.
    expect(reactivateOrder(orderOf(order)!).ok).toBe(true)
    await tick()
    expect(stockOf(product.id)).toBe(seed - 4)

    markOrderFailed(orderOf(order)!)
    await tick()
    expect(stockOf(product.id)).toBe(seed)
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true)
  })

  it('reactivating a legacy failed order (never restocked) does not deduct', async () => {
    const { product } = setup()
    const seed = stockOf(product.id)!

    // Seed-era failed orders were written without the `restocked` flag and
    // never had stock returned for them — reactivating must not deduct twice.
    const order = mkOrder(product.id, 6, 'Legacy Buyer')
    db.orders.add({ ...order, status: 'failed' })
    await tick()

    const before = stats()
    const result = reactivateOrder(orderOf(order)!)
    await tick()

    expect(result.ok).toBe(true)
    expect(result.units).toBe(0)
    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(orderOf(order)!.status).toBe('pending')
    expect(orderOf(order)!.restocked).toBe(false)
    expect(stockOf(product.id)).toBe(seed) // untouched
    expect(translateAction(history.undoLabel()!)).toBe(
      "Reactivated Legacy Buyer's order",
    )
  })
})
