import { beforeEach, describe, expect, it } from 'vitest'

import type { Driver, InventoryItem, Order, Product } from '@/types'

import { isActiveAssignment, assignOrders, autoAssignPendingOrders } from './dispatch'
import { translateAction } from './actionLabel'
import { tryCreateOrder, mutateOrder } from './orders'
import { db, clearAllData, history, newId } from './store'

/**
 * Assignment rules:
 * - assignOrders hands a batch of pending orders to one driver in ONE
 *   undoable step; only pending orders are touched (others skipped),
 * - off_duty drivers are refused outright (error label, no writes, no
 *   history entry), unknown drivers too,
 * - assignment alone never changes the driver's status,
 * - reassignment moves the order between drivers and both counts change,
 * - auto-assign: no pending → error; no available drivers (none or all
 *   off_duty) → error; otherwise EVERY pending order gets exactly one
 *   driver and off_duty drivers never receive an order; the whole batch
 *   is one undo entry.
 */

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function seedProduct(name = 'Assign Product', stock = 100): Product {
  const product: Product = {
    id: newId('prd'),
    name,
    sku: `A-${newId('')}`,
    price: 5,
    unit: 'pc',
  }
  db.products.add(product)
  db.inventory.add({ productId: product.id, quantity: stock, lowStockThreshold: 5 } satisfies InventoryItem)
  return product
}

function seedDriver(name: string, status: Driver['status']): Driver {
  const driver: Driver = { id: newId('drv'), name, phone: '+21260000000', vehicle: 'V', status }
  db.drivers.add(driver)
  return driver
}

function seedPendingOrder(product: Product, name = 'Pending Client'): Order {
  const order: Order = {
    id: newId('ord'),
    customerName: name,
    address: '12 Rue Azrou',
    lat: 27.15,
    lng: -13.2,
    items: [{ productId: product.id, qty: 1 }],
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  expect(tryCreateOrder(order).ok).toBe(true)
  return order
}

const current = (order: Order): Order => db.orders.all().find((entry) => entry.id === order.id)!
const driverNow = (driver: Driver): Driver => db.drivers.all().find((entry) => entry.id === driver.id)!

beforeEach(async () => {
  clearAllData()
  await tick()
})

describe('assignOrders', () => {
  it('assigns one and several pending orders in ONE undo entry', async () => {
    const product = seedProduct()
    const driver = seedDriver('Amine', 'available')
    const orders = [seedPendingOrder(product, 'A'), seedPendingOrder(product, 'B'), seedPendingOrder(product, 'C')]

    const before = history.stats()
    const single = assignOrders([orders[0]!.id], driver.id)
    await tick()
    expect(single.ok).toBe(true)
    expect(single.assigned).toBe(1)
    expect(current(orders[0]!).status).toBe('assigned')
    expect(current(orders[0]!).driverId).toBe(driver.id)
    expect(driverNow(driver).status).toBe('available') // status untouched by assignment
    expect(history.stats().undoCount).toBe(before.undoCount + 1)
    expect(translateAction(history.undoLabel()!)).toBe('Assigned 1 order to Amine')

    const beforeBatch = history.stats()
    const batch = assignOrders([orders[1]!.id, orders[2]!.id], driver.id)
    await tick()
    expect(batch.ok).toBe(true)
    expect(batch.assigned).toBe(2)
    expect(translateAction(history.undoLabel()!)).toBe('Assigned 2 orders to Amine')
    expect(history.stats().undoCount).toBe(beforeBatch.undoCount + 1) // one entry for the batch

    expect(history.undo()).toBe(true)
    expect(current(orders[1]!).status).toBe('pending')
    expect(current(orders[2]!).status).toBe('pending')
    expect(history.redo()).toBe(true)
    expect(current(orders[1]!).status).toBe('assigned')
    expect(current(orders[2]!).status).toBe('assigned')
  })

  it('skips orders that are not pending (they keep their status, driver, and counts)', async () => {
    const product = seedProduct()
    const driver = seedDriver('Amine', 'available')
    const other = seedDriver('Sara', 'available')
    const pending = seedPendingOrder(product, 'Pending')
    const delivered = seedPendingOrder(product, 'Done')
    mutateOrder(delivered.id, { status: 'assigned', driverId: other.id }, { key: 'actions.assignedOrderTo', params: { name: 'Done', driver: 'Sara' } })
    mutateOrder(delivered.id, { status: 'delivered' }, { key: 'actions.orderDelivered', params: { name: 'Done' } })

    const before = history.stats()
    const result = assignOrders([delivered.id, pending.id], driver.id)
    await tick()

    expect(result.ok).toBe(true)
    expect(result.assigned).toBe(1) // only the pending one
    expect(current(pending)!.driverId).toBe(driver.id)
    expect(current(delivered)!.driverId).toBe(other.id) // untouched
    expect(current(delivered)!.status).toBe('delivered')
    expect(history.stats().undoCount).toBe(before.undoCount + 1)
  })

  it('refuses off_duty drivers outright: error, zero writes, zero history', async () => {
    const product = seedProduct()
    const offDuty = seedDriver('Kareem', 'off_duty')
    const order = seedPendingOrder(product, 'Blocked')

    const before = history.stats()
    const result = assignOrders([order.id], offDuty.id)
    await tick()

    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe(
      'Kareem is off duty — set them back on the roster before assigning orders.',
    )
    expect(current(order)!.status).toBe('pending')
    expect(current(order)!.driverId).toBeUndefined()
    expect(history.stats().undoCount).toBe(before.undoCount)
  })

  it('refuses unknown drivers', async () => {
    const product = seedProduct()
    const order = seedPendingOrder(product, 'Any')
    const result = assignOrders([order.id], 'drv_unknown')
    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('Unknown driver.')
    expect(current(order)!.driverId).toBeUndefined()
  })

  it('counts follow reassignment between drivers (assigned/in_transit only)', async () => {
    const product = seedProduct()
    const amine = seedDriver('Amine', 'available')
    const sara = seedDriver('Sara', 'available')
    const order = seedPendingOrder(product, 'Moving')
    assignOrders([order.id], amine.id)
    await tick()

    const activeFor = (driverId: string) =>
      db.orders.all().filter((entry) => entry.driverId === driverId && isActiveAssignment(entry)).length
    expect(activeFor(amine.id)).toBe(1)
    expect(activeFor(sara.id)).toBe(0)

    // Reassign (the drawer does this with a plain update).
    db.orders.update(order.id, { driverId: sara.id }, { key: 'actions.assignedOrderTo', params: { name: 'Moving', driver: 'Sara' } })
    await tick()
    expect(current(order)!.driverId).toBe(sara.id)
    expect(activeFor(amine.id)).toBe(0)
    expect(activeFor(sara.id)).toBe(1)
    // Both drivers remain available: reassignment does not change status.
    expect(driverNow(amine)!.status).toBe('available')
    expect(driverNow(sara)!.status).toBe('available')
  })
})

describe('autoAssignPendingOrders', () => {
  it('with 0 pending orders: reports an error and changes nothing', async () => {
    seedDriver('Amine', 'available')
    const before = history.stats()
    const result = autoAssignPendingOrders()
    await tick()
    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('No pending orders to assign.')
    expect(db.orders.all().length).toBe(0)
    expect(history.stats().undoCount).toBe(before.undoCount)
  })

  it('with 0 drivers: reports an error and leaves pending orders pending', async () => {
    const product = seedProduct()
    const order = seedPendingOrder(product)
    const result = autoAssignPendingOrders()
    await tick()
    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('No available drivers right now.')
    expect(current(order)!.driverId).toBeUndefined()
  })

  it('with only off_duty drivers: reports "no available drivers"', async () => {
    const product = seedProduct()
    seedDriver('Kareem', 'off_duty')
    const order = seedPendingOrder(product)
    const result = autoAssignPendingOrders()
    await tick()
    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('No available drivers right now.')
    expect(current(order)!.driverId).toBeUndefined()
  })

  it('splits pending orders across two drivers: every order exactly one driver, off-duty excluded, ONE undo entry', async () => {
    const product = seedProduct()
    const amine = seedDriver('Amine', 'available')
    const sara = seedDriver('Sara', 'available')
    const kareem = seedDriver('Kareem', 'off_duty')
    void kareem

    const orders = [
      seedPendingOrder(product, 'North Far'), // lat 27.20
      seedPendingOrder(product, 'North Near'),
      seedPendingOrder(product, 'South'),
    ]
    // Set them at distinct locations: two north, one far south,
    // so clustering can separate them.
    const lats = [27.2, 27.19, 27.11]
    orders.forEach((order, index) => {
      db.orders.update(order.id, { lat: lats[index] }, { key: 'crud.updatedOrder' })
    })
    await tick()

    const before = history.stats()
    const result = autoAssignPendingOrders()
    await tick()

    expect(result.ok).toBe(true)
    expect(result.assigned).toBe(3)
    expect(result.driversUsed).toBe(2) // only two available drivers
    for (const order of orders) {
      expect(current(order)!.status).toBe('assigned')
      expect(current(order)!.driverId).toBeTruthy()
    }
    // Every pending order belongs to exactly one active driver; never to off-duty Kareem.
    const assigned = orders.map((order) => current(order)!.driverId)
    expect(assigned.every((id) => id !== kareem.id)).toBe(true)
    expect(new Set(assigned).size).toBeLessThanOrEqual(2)
    expect(driverNow(amine)!.status).toBe(amine.status)
    expect(driverNow(sara)!.status).toBe(sara.status)
    // Batch is one undo entry; undo gives all three back to pending.
    expect(history.stats().undoCount).toBe(before.undoCount + 1)
    expect(history.undo()).toBe(true)
    for (const order of orders) {
      expect(current(order)!.status).toBe('pending')
      expect(current(order)!.driverId).toBeUndefined()
    }
  })

  it('undo of auto-assign also restores statuses and nothing else changes', async () => {
    const product = seedProduct()
    seedDriver('Amine', 'available')
    const order = seedPendingOrder(product, 'Solo')
    autoAssignPendingOrders()
    await tick()
    expect(current(order)!.status).toBe('assigned')
    expect(history.undo()).toBe(true)
    expect(current(order)!.status).toBe('pending')
    expect(current(order)!.driverId).toBeUndefined()
    // Undo restores the PRE-assignment state; stock still reflects the
    // creation-time deduction (100 - 1 = 99) — assignment itself moved no stock.
    expect(db.inventory.all().find((row) => row.productId === product.id)!.quantity).toBe(99)
  })
})
