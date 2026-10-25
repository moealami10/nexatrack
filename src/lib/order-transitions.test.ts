import { beforeEach, describe, expect, it } from 'vitest'

import type { Driver, InventoryItem, Order, Product } from '@/types'

import { syncDriverStatusAfterOrderEvent, startDriverRoute, isActiveAssignment } from './dispatch'
import {
  advanceOrder,
  markOrderFailed,
  mutateOrder,
  tryCreateOrder,
} from './orders'
import { db, clearAllData, history, newId } from './store'

/**
 * Status-flow rules:
 * - forward chain pending → assigned → in_transit → delivered via advanceOrder,
 * - advancing from pending keeps an already-assigned available driver,
 *   otherwise auto-picks the FIRST available driver; off_duty never picked,
 * - assigned → in_transit puts the driver on_route (rule: any in-transit
 *   order moves an available driver),
 * - delivering the driver's LAST active order returns them to available,
 * - delivered/failed/cancelled orders are terminal for advanceOrder
 *   (no-op, no history event), and failing a delivered order is blocked,
 * - the status timeline: initial pending event at creation, one event per
 *   transition; historyIndex gives the last timestamp per status.
 * (Illegal transitions delivered→pending are gated by the UI, not the
 *   logic — asserted and reported as a design gap below.)
 */

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function makeProduct(price = 5, stock = 100): { product: Product; label: string } {
  const product: Product = {
    id: newId('prd'),
    name: 'Flow Product',
    sku: `F-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    price,
    unit: 'pc',
  }
  db.products.add(product)
  db.inventory.add({ productId: product.id, quantity: stock, lowStockThreshold: 10 })
  return { product, label: price.toString() }
}

function makeDriver(name: string, status: Driver['status']): Driver {
  const driver: Driver = {
    id: newId('drv'),
    name,
    phone: '+212 6 00 00 00',
    vehicle: 'Bike',
    status,
  }
  db.drivers.add(driver)
  return driver
}

function makeOrder(productId: string, overrides: Partial<Order> = {}): Order {
  return {
    id: newId('ord'),
    customerName: 'Zineb Alaoui',
    address: '23 Rue de la Poste',
    lat: 27.15,
    lng: -13.2,
    items: [{ productId, qty: 1 }],
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const current = (order: Order): Order | undefined =>
  db.orders.all().find((entry) => entry.id === order.id)
const driverNow = (driver: Driver): Driver | undefined =>
  db.drivers.all().find((entry) => entry.id === driver.id)

beforeEach(async () => {
  clearAllData()
  await tick()
})

describe('order status flow', () => {
  it('pending → assigned auto-picks the FIRST available driver (persisted order) for each pending order', async () => {
    const { product } = makeProduct()
    makeDriver('Amine', 'available')
    makeDriver('Sara', 'available')
    makeDriver('Kareem', 'off_duty')

    const orderA = makeOrder(product.id)
    const orderB = makeOrder(product.id)
    tryCreateOrder(orderA)
    tryCreateOrder(orderB)
    await tick()

    // "First available" means first in the persisted driver order.
    const availableNow = db.drivers.all().filter((driver) => driver.status === 'available')
    expect(availableNow.length).toBe(2)

    advanceOrder(current(orderA)!)
    advanceOrder(current(orderB)!)
    await tick()
    // Both land on the same first available driver (assignment does not
    // change driver status, so the pick is stable).
    expect(current(orderA)!.driverId).toBe(availableNow[0]!.id)
    expect(current(orderB)!.driverId).toBe(availableNow[0]!.id)
    expect(current(orderA)!.driverId).not.toBe('drv_nonexistent')
    // Assignment alone does not change driver status.
    expect(availableNow.every((driver) => driverNow(driver)!.status === 'available')).toBe(true)
  })

  it('off_duty drivers are never auto-picked; a ded order with an off-duty driver reassigned', async () => {
    const { product } = makeProduct()
    const offDuty = makeDriver('Kareem', 'off_duty')
    const available = makeDriver('Sara', 'available')

    const order = makeOrder(product.id, { driverId: offDuty.id })
    tryCreateOrder(order)
    await tick()

    advanceOrder(current(order)!)
    await tick()
    // The pre-set driver is off duty → not kept; the available driver wins.
    expect(current(order)!.driverId).toBe(available.id)
    expect(current(order)!.driverId).not.toBe(offDuty.id)
  })

  it('pending → assigned keeps the order driver when they are available', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'available')
    const sara = makeDriver('Sara', 'available')

    const order = makeOrder(product.id, { driverId: sara.id })
    tryCreateOrder(order)
    await tick()
    advanceOrder(current(order)!)
    await tick()
    expect(current(order)!.driverId).toBe(sara.id)
    void amine
  })

  it('assigned → in_transit turns the driver on_route; delivered returns the LAST active order driver to available', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'available')
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    await tick()

    advanceOrder(current(order)!) // → assigned (auto-picked amine)
    advanceOrder(current(order)!) // → in_transit
    await tick()
    expect(current(order)!.status).toBe('in_transit')
    expect(driverNow(amine)!.status).toBe('on_route')

    // A second order for the same driver keeps them on_route after delivering one.
    const second = makeOrder(product.id)
    tryCreateOrder(second)
    mutateOrder(second.id, { status: 'assigned', driverId: amine.id }, { key: 'actions.assignedOrderTo', params: { name: 'x', driver: 'Amine' } })
    advanceOrder(current(second)!) // → in_transit
    await tick()

    advanceOrder(current(order)!) // → delivered
    await tick()
    expect(current(order)!.status).toBe('delivered')
    expect(driverNow(amine)!.status).toBe('on_route') // second order still active

    advanceOrder(current(second)!) // → delivered (driver's LAST active order)
    await tick()
    expect(driverNow(amine)!.status).toBe('available')
  })

  it('advanceOrder on delivered / failed / cancelled is a no-op: no state, no history event', async () => {
    const { product } = makeProduct()
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    mutateOrder(order.id, { status: 'delivered' }, { key: 'actions.orderDelivered', params: { name: 'x' } })
    await tick()
    const historyLen = current(order)!.statusHistory!.length

    advanceOrder(current(order)!)
    await tick()
    expect(current(order)!.status).toBe('delivered')
    expect(current(order)!.statusHistory!.length).toBe(historyLen)

    const failed = makeOrder(product.id, { status: 'failed' })
    db.orders.add(failed)
    const failedLen = (current(failed)!.statusHistory ?? []).length
    advanceOrder(current(failed)!)
    expect(current(failed)!.status).toBe('failed')
    expect((current(failed)!.statusHistory ?? []).length).toBe(failedLen)
  })

  it('markOrderFailed on a delivered order is refused (no restock, no event)', async () => {
    const { product } = makeProduct()
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    mutateOrder(order.id, { status: 'delivered' }, { key: 'actions.orderDelivered', params: { name: 'x' } })
    await tick()

    const before = history.stats()
    markOrderFailed(current(order)!)
    await tick()

    expect(current(order)!.status).toBe('delivered')
    expect(current(order)!.restocked).toBeUndefined() // never restocked
    expect(history.stats().undoCount).toBe(before.undoCount - 0)
  })

  it('[documents a gap] the logic layer permits ANY transition — enforcement is UI-only', async () => {
    const { product } = makeProduct()
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    mutateOrder(order.id, { status: 'delivered' }, { key: 'actions.orderDelivered', params: { name: 'x' } })
    await tick()

    // A bug or future caller can push delivered → pending and nothing stops it.
    mutateOrder(order.id, { status: 'pending' }, { key: 'actions.updatedOrder', params: { id: order.id } })
    expect(current(order)!.status).toBe('pending')
  })

  it('failing an in-transit order restocks in the same step and returns the driver to available', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'available')
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    advanceOrder(current(order)!) // assigned → picks the first available
    advanceOrder(current(order)!) // in_transit
    await tick()
    expect(current(order)!.driverId).toBe(amine.id)
    expect(driverNow(amine)!.status).toBe('on_route')

    const stockBefore = db.inventory.all().find((r) => r.productId === product.id)!.quantity
    markOrderFailed(order) // cancelOrder equivalents covered in order-stock.test.ts
    await tick()
    expect(current(order)!.status).toBe('failed')
    expect(current(order)!.restocked).toBe(true)
    expect(db.inventory.all().find((r) => r.productId === product.id)!.quantity).toBe(stockBefore + 1)
    expect(driverNow(amine)!.status).toBe('available') // lost their last active order
  })

  it('delivering via deliver-status history keeps the full timeline in order', async () => {
    const { product } = makeProduct()
    const order = makeOrder(product.id)
    tryCreateOrder(order)
    await tick()

    const statuses = ['assigned', 'in_transit', 'delivered'] as const
    for (const s of statuses) {
      advanceOrder(current(order)!)
      expect(current(order)!.status).toBe(s)
    }
    await tick()

    const events = current(order)!.statusHistory!
    expect(events.map((event) => event.status)).toEqual([
      'pending',
      'assigned',
      'in_transit',
      'delivered',
    ])
    const at = events.map((event) => event.at)
    expect(at.every((stamp, index) => stamp >= at[Math.max(0, index - 1)])).toBe(true)
  })
})

describe('driver route automation', () => {
  it('startDriverRoute moves ALL of that driver\'s assigned stops in ONE undo entry and sets on_route', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'available')
    const sara = makeDriver('Sara', 'available')

    const orders = [makeOrder(product.id), makeOrder(product.id)]
    for (const order of orders) {
      tryCreateOrder(order)
      await tick()
    }
    // Explicitly hand one stop to each driver (bypassing auto-pick, whose
    // ordering is asserted separately).
    mutateOrder(orders[0]!.id, { status: 'assigned', driverId: amine.id }, { key: 'actions.assignedOrderTo', params: { name: 'x', driver: 'Amine' } })
    mutateOrder(orders[1]!.id, { status: 'assigned', driverId: sara.id }, { key: 'actions.assignedOrderTo', params: { name: 'x', driver: 'Sara' } })
    await tick()

    const before = history.stats()
    const result = startDriverRoute(amine.id)
    await tick()

    expect(result.started).toBe(1)
    expect(current(orders[0]!)!.status).toBe('in_transit')
    expect(current(orders[1]!)!.status).toBe('assigned') // Sara's, untouched
    expect(driverNow(amine)!.status).toBe('on_route')
    expect(driverNow(sara)!.status).toBe('available')
    // Orders + driver status = one history entry.
    expect(history.stats().undoCount).toBe(before.undoCount + 1)

    expect(history.undo()).toBe(true)
    expect(current(orders[0]!)!.status).toBe('assigned')
    expect(driverNow(amine)!.status).toBe('available')
    expect(history.redo()).toBe(true)
    expect(current(orders[0]!)!.status).toBe('in_transit')
    expect(driverNow(amine)!.status).toBe('on_route')
  })

  it('startDriverRoute with nothing assigned does nothing (no entry, no status change)', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'available')
    makeProduct() // ensure some data exists so an empty run is meaningful
    const before = history.stats()

    const result = startDriverRoute(amine.id)
    await tick()

    expect(result.started).toBe(0)
    expect(driverNow(amine)!.status).toBe('available')
    expect(history.stats().undoCount).toBe(before.undoCount)
  })

  it('isActiveAssignment counts exactly assigned + in_transit (not pending, not delivered)', () => {
    const product = newId('prd')
    const base = { id: 'o', customerName: 'c', address: 'a', lat: 27.15, lng: -13.2, items: [{ productId: product, qty: 1 }], createdAt: '' }
    expect(isActiveAssignment({ ...base, id: '1', status: 'pending' })).toBe(false)
    expect(isActiveAssignment({ ...base, id: '2', status: 'assigned' })).toBe(true)
    expect(isActiveAssignment({ ...base, id: '3', status: 'in_transit' })).toBe(true)
    expect(isActiveAssignment({ ...base, id: '4', status: 'delivered' })).toBe(false)
    expect(isActiveAssignment({ ...base, id: '5', status: 'failed' })).toBe(false)
    expect(isActiveAssignment({ ...base, id: '6', status: 'cancelled' })).toBe(false)
  })

  it('syncDriverStatusAfterOrderEvent ignores missing drivers and never revives off_duty', async () => {
    const { product } = makeProduct()
    const amine = makeDriver('Amine', 'off_duty')
    const order = makeOrder(product.id, { driverId: amine.id, status: 'in_transit' })
    db.orders.add(order)
    makeProduct()

    syncDriverStatusAfterOrderEvent(amine.id, { type: 'started_in_transit' })
    expect(driverNow(amine)!.status).toBe('off_duty') // manual status wins

    syncDriverStatusAfterOrderEvent(undefined, { type: 'started_in_transit' }) // no driver — no crash
    syncDriverStatusAfterOrderEvent('drv_nonexistent', { type: 'left_active' }) // unknown — no crash
  })
})
