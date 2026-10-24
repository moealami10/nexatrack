import { beforeAll, describe, expect, it } from 'vitest'

import { installDemoData } from './demoData'
import { translateAction } from './actionLabel'
import type { Order, Product } from '@/types'

import { assignOrders, autoAssignPendingOrders } from './dispatch'
import { tryCreateOrder } from './orders'
import type { RoutePlanRecord } from '@/types'
import { db, history, newId, runTransaction } from './store'

/**
 * Undo/redo semantics of the store. Tests share one module instance, so
 * they run in sequence and always clean up after themselves (or use
 * unique entities so leftovers cannot affect other cases).
 */

/** Ends the current synchronous tick → the next action starts a new entry. */
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const mkProduct = (name: string): Product => ({
  id: newId('prd_t'),
  name,
  sku: `T-${name.replace(/\W+/g, '')}`,
  price: 12,
  unit: 'pack',
})

// The store starts empty by design; these tests exercise real workflows
// (stock deduction, assignment, plans), so load the demo dataset once as
// their shared fixture — exactly what the sidebar "Load demo data" does.
beforeAll(() => {
  installDemoData()
})

describe('undo/redo history', () => {
  it('undo after delete restores the deleted product', async () => {
    const product = mkProduct('Undo Cola')
    db.products.add(product, 'Added Undo Cola')
    await tick()

    db.products.remove(product.id, 'Deleted Undo Cola')
    expect(db.products.all().some((p) => p.id === product.id)).toBe(false)
    expect(history.undoLabel()).toBe('Deleted Undo Cola')

    expect(history.undo()).toBe(true)
    expect(db.products.all().some((p) => p.id === product.id)).toBe(true)
    expect(history.undoLabel()).toBe('Added Undo Cola')
  })

  it('order creation deducts stock and is reverted by ONE undo step', async () => {
    const inventoryRow = db.inventory.all()[0]!
    const stockBefore = inventoryRow.quantity
    expect(stockBefore).toBeGreaterThan(3)

    const draft: Order = {
      id: newId('ord_t'),
      customerName: 'Undo Buyer',
      address: '12 Test Street, Casablanca',
      lat: 33.5,
      lng: -7.6,
      items: [{ productId: inventoryRow.productId, qty: 3 }],
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    const statsBefore = history.stats()
    expect(tryCreateOrder(draft).ok).toBe(true)
    // Stock deduction + order must be a single history entry.
    expect(history.stats().undoCount - statsBefore.undoCount).toBe(1)
    expect(translateAction(history.undoLabel()!)).toBe('Created order for Undo Buyer')

    expect(
      db.inventory.all().find((entry) => entry.productId === inventoryRow.productId)!
        .quantity,
    ).toBe(stockBefore - 3)
    expect(db.orders.all().some((order) => order.id === draft.id)).toBe(true)

    history.undo()
    // One undo restores BOTH the stock and removes the order.
    expect(
      db.inventory.all().find((entry) => entry.productId === inventoryRow.productId)!
        .quantity,
    ).toBe(stockBefore)
    expect(db.orders.all().some((order) => order.id === draft.id)).toBe(false)
  })

  it('redo re-applies an undone action', async () => {
    const product = mkProduct('Redo Water')
    db.products.add(product, 'Added Redo Water')
    await tick()
    db.products.remove(product.id, 'Deleted Redo Water')
    await tick()

    history.undo()
    expect(db.products.all().some((p) => p.id === product.id)).toBe(true)
    expect(history.redoLabel()).toBe('Deleted Redo Water')

    expect(history.redo()).toBe(true)
    expect(db.products.all().some((p) => p.id === product.id)).toBe(false)
  })

  it('the redo stack clears on any new action', async () => {
    const driver = db.drivers.all()[0]!
    const originalVehicle = driver.vehicle

    db.drivers.update(driver.id, { vehicle: 'Temp Bike' }, 'Changed vehicle')
    await tick()
    history.undo()
    expect(history.canRedo()).toBe(true)
    await tick()

    // A new mutation invalidates the redo branch.
    db.drivers.update(driver.id, { vehicle: 'Temp Van' }, 'Changed vehicle again')
    await tick()
    expect(history.canRedo()).toBe(false)
    expect(history.stats().redoCount).toBe(0)
    expect(history.redo()).toBe(false)

    // Leave the seed value in place.
    db.drivers.update(driver.id, { vehicle: originalVehicle }, 'Restore vehicle')
    await tick()
  })

  it('a failed order creation (stock shortage) records no history entry', () => {
    const inventoryRow = db.inventory.all()[0]!
    const statsBefore = history.stats()
    const result = tryCreateOrder({
      id: newId('ord_t'),
      customerName: 'Greedy Buyer',
      address: 'Nowhere, Casablanca',
      lat: 33.55,
      lng: -7.62,
      items: [{ productId: inventoryRow.productId, qty: inventoryRow.quantity + 10_000 }],
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
    expect(result.ok).toBe(false)
    expect(history.stats().undoCount).toBe(statsBefore.undoCount)
  })

  it('bulk assignment is a single entry labeled with the final count', async () => {
    const pendingIds = db.orders
      .all()
      .filter((order) => order.status === 'pending')
      .map((order) => order.id)
      .slice(0, 2)
    expect(pendingIds.length).toBeGreaterThan(0)
    const driver = db.drivers.all().find((entry) => entry.status === 'available')!

    const statsBefore = history.stats()
    const { assigned } = assignOrders(pendingIds, driver.id)
    expect(assigned).toBe(pendingIds.length)
    // N mutateOrder calls collapse into one entry.
    expect(history.stats().undoCount - statsBefore.undoCount).toBe(1)
    expect(translateAction(history.undoLabel()!)).toBe(
      `Assigned ${assigned} order${assigned === 1 ? '' : 's'} to ${driver.name}`,
    )

    // Undo reverts the entire batch back to pending.
    history.undo()
    const reverted = db.orders.all().find((order) => order.id === pendingIds[0])!
    expect(reverted.status).toBe('pending')
    expect(reverted.driverId).toBeUndefined()
  })

  it('auto-assign is a single entry, not one per order', async () => {
    const pendingBefore = db.orders.all().filter((order) => order.status === 'pending').length
    expect(pendingBefore).toBeGreaterThan(0)

    const statsBefore = history.stats()
    const result = autoAssignPendingOrders()
    expect(result.ok).toBe(true)
    expect(history.stats().undoCount - statsBefore.undoCount).toBe(1)
    // Nested plural keys: "Auto-assigned 2 orders across 2 drivers".
    expect(translateAction(history.undoLabel()!)).toBe(
      `Auto-assigned ${result.assigned} order${result.assigned === 1 ? '' : 's'} across ${result.driversUsed} driver${result.driversUsed === 1 ? '' : 's'}`,
    )

    history.undo()
    expect(db.orders.all().filter((order) => order.status === 'pending').length).toBe(
      pendingBefore,
    )
  })

  it('full-state snapshots also revert sibling collections (tick grouping)', async () => {
    const product = mkProduct('Slot Chip')
    const statsBefore = history.stats()

    // Two collections mutated in the same synchronous tick → one entry.
    db.products.add(product, 'Added Slot Chip')
    db.inventory.add({ productId: product.id, quantity: 5, lowStockThreshold: 2 })
    expect(history.stats().undoCount - statsBefore.undoCount).toBe(1)

    history.undo()
    expect(db.products.all().some((p) => p.id === product.id)).toBe(false)
    expect(db.inventory.all().some((entry) => entry.productId === product.id)).toBe(false)
  })

  it('a saved route plan is one undoable step and survives undo/redo', async () => {
    const driver = db.drivers.all()[0]!
    const plan: RoutePlanRecord['plan'] = {
      distanceKm: 5,
      estimatedMinutes: 10,
      stops: [{ id: 'ord_x', lat: 33.5, lng: -7.6, label: 'Plan Stop' }],
    }

    const statsBefore = history.stats()
    runTransaction(() => `Saved plan for ${driver.name}`, () => {
      db.routePlans.add({ driverId: driver.id, plan })
    })
    expect(history.stats().undoCount - statsBefore.undoCount).toBe(1)
    expect(history.undoLabel()).toBe(`Saved plan for ${driver.name}`)
    expect(db.routePlans.all().some((record) => record.driverId === driver.id)).toBe(true)

    history.undo()
    expect(db.routePlans.all().some((record) => record.driverId === driver.id)).toBe(false)
    history.redo()
    expect(
      db.routePlans.all().find((record) => record.driverId === driver.id)!.plan.distanceKm,
    ).toBe(5)

    // Leave the store clean for later tests.
    history.undo()
  })

  it('keeps at most 50 history entries', async () => {
    const driver = db.drivers.all()[0]!
    const originalVehicle = driver.vehicle

    // 55 distinct ticks → 55 pushes → the oldest five fall off the cap.
    for (let i = 0; i < 55; i++) {
      db.drivers.update(driver.id, { vehicle: `Undo Test Van ${i}` }, `Change ${i}`)
      await tick()
    }
    const stats = history.stats()
    expect(stats.undoCount).toBeLessThanOrEqual(50)
    expect(stats.undoCount).toBe(50)
    expect(history.undoLabel()).toBe('Change 54')

    let undos = 0
    while (history.undo()) undos++
    expect(undos).toBe(50)
    expect(history.canUndo()).toBe(false)

    // Redoing everything restores the most recent state.
    let redos = 0
    while (history.redo()) redos++
    expect(redos).toBe(50)
    expect(
      db.drivers.all().find((entry) => entry.id === driver.id)!.vehicle,
    ).toBe('Undo Test Van 54')

    // Leave the seed value in place.
    db.drivers.update(driver.id, { vehicle: originalVehicle }, 'Restore vehicle')
    await tick()
  })
})
