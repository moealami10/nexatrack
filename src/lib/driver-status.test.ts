import { beforeEach, describe, expect, it } from 'vitest'

import type { Driver, DriverStatus, Order, Product } from '@/types'

import { autoAssignPendingOrders, isActiveAssignment, assignOrders, nextDriverStatus, startDriverRoute } from './dispatch'
import { advanceOrder, cancelOrder, markOrderFailed, reactivateOrder, tryCreateOrder } from './orders'
import { translateAction } from './actionLabel'
import { db, history, newId } from './store'

/**
 * Driver-status automation. The status is DERIVED from order events:
 * assignment alone never moves a driver; the first in-transit stop makes an
 * available driver "on route"; a driver left with no active orders returns
 * to "available". A manual "off duty" is never touched by automation.
 * Everything routes through the pure `nextDriverStatus` rule in dispatch.ts.
 */

/** Ends the current synchronous tick → the next action starts a new entry. */
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const stats = () => history.stats()
const driverOf = (driver: Driver): Driver => db.drivers.all().find((d) => d.id === driver.id)!
const orderOf = (order: Order): Order | undefined => db.orders.all().find((o) => o.id === order.id)

const nextStatusOf = (
  status: DriverStatus,
  event: Parameters<typeof nextDriverStatus>[1],
  inTransit: number,
  active: number,
) => nextDriverStatus(status, event, { inTransit, active })

function setup(): { product: Product } {
  const product: Product = {
    id: newId('prd_t'),
    name: `Crew Probe ${newId('')}`,
    sku: `T-CRW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    price: 4,
    unit: 'pc',
  }
  db.products.add(product)
  db.inventory.add({ productId: product.id, quantity: 100, lowStockThreshold: 10 })
  return { product }
}

function mkDriver(name: string, status: DriverStatus = 'available'): Driver {
  const driver: Driver = {
    id: newId('drv_t'),
    name,
    phone: '+212 6 00 00 00',
    vehicle: 'Scooter',
    status,
  }
  db.drivers.add(driver)
  return driver
}

function mkOrder(
  productId: string,
  driver?: Driver,
  status: Order['status'] = driver ? 'assigned' : 'pending',
  name = 'Crew Buyer',
): Order {
  return {
    id: newId('ord_t'),
    customerName: name,
    address: '2 Test Road, Laayoune',
    lat: 27.15,
    lng: -13.2,
    items: [{ productId, qty: 1 }],
    status,
    driverId: driver?.id,
    createdAt: new Date().toISOString(),
  }
}

describe('driver status rule (pure)', () => {
  it('moves through every transition', () => {
    // First stop goes in transit: available driver starts their route.
    expect(nextStatusOf('available', { type: 'started_in_transit' }, 1, 1)).toBe('on_route')
    // More stops going in transit while on route: no change.
    expect(nextStatusOf('on_route', { type: 'started_in_transit' }, 2, 2)).toBeNull()
    // Starting in transit with nothing actually in transit (defensive): no change.
    expect(nextStatusOf('available', { type: 'started_in_transit' }, 0, 0)).toBeNull()
    // Last active order delivered/failed/cancelled: back to available.
    expect(nextStatusOf('on_route', { type: 'left_active' }, 0, 0)).toBe('available')
    // A driver still holding active orders stays on route.
    expect(nextStatusOf('on_route', { type: 'left_active' }, 1, 2)).toBeNull()
    // Manual "available" with no active orders is not a change either.
    expect(nextStatusOf('available', { type: 'left_active' }, 0, 0)).toBeNull()
    // Manual off duty always wins.
    expect(nextStatusOf('off_duty', { type: 'started_in_transit' }, 5, 5)).toBeNull()
    expect(nextStatusOf('off_duty', { type: 'left_active' }, 0, 0)).toBeNull()
  })
})

describe('driver status automation (integration)', () => {
  beforeEach(async () => {
    await tick()
  })

  it('assignment alone does not change the driver status', async () => {
    const { product } = setup()
    const driver = mkDriver('Steady Sam')
    const order = mkOrder(product.id)
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()

    const before = stats()
    const result = assignOrders([order.id], driver.id)
    await tick()

    expect(result.ok).toBe(true)
    expect(result.assigned).toBe(1)
    expect(driverOf(driver).status).toBe('available') // unchanged
    expect(orderOf(order)!.status).toBe('assigned')
    expect(orderOf(order)!.driverId).toBe(driver.id)
    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(translateAction(history.undoLabel()!)).toBe(`Assigned 1 order to Steady Sam`)
  })

  it('startDriverRoute moves all assigned stops in transit in ONE entry (driver too)', async () => {
    const { product } = setup()
    const driver = mkDriver('Rami Route')
    const a = mkOrder(product.id, driver, 'assigned', 'Crew Buyer A')
    const b = mkOrder(product.id, driver, 'assigned', 'Crew Buyer B')
    expect(tryCreateOrder(a).ok).toBe(true)
    expect(tryCreateOrder(b).ok).toBe(true)
    await tick()
    expect(driverOf(driver).status).toBe('available')

    const before = stats()
    const result = startDriverRoute(driver.id)
    await tick()

    expect(result.started).toBe(2)
    expect(orderOf(a)!.status).toBe('in_transit')
    expect(orderOf(b)!.status).toBe('in_transit')
    expect(driverOf(driver).status).toBe('on_route')
    // Stops + driver flip = exactly ONE history entry.
    expect(stats().undoCount - before.undoCount).toBe(1)
    expect(translateAction(history.undoLabel()!)).toBe(
      "Started Rami Route's route — moved 2 stops in transit",
    )

    // Undo puts everything back: stops assigned, driver available.
    expect(history.undo()).toBe(true)
    expect(orderOf(a)!.status).toBe('assigned')
    expect(orderOf(b)!.status).toBe('assigned')
    expect(driverOf(driver).status).toBe('available')
    expect(history.redo()).toBe(true)
    expect(orderOf(a)!.status).toBe('in_transit')
    expect(driverOf(driver).status).toBe('on_route')
    history.undo()
  })

  it('delivering the last stop returns the driver to available', async () => {
    const { product } = setup()
    const driver = mkDriver('Last Stop Leila')
    const order = mkOrder(product.id, driver, 'assigned', 'Crew Buyer C')
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()

    advanceOrder(orderOf(order)!) // assigned → in_transit
    await tick()
    expect(driverOf(driver).status).toBe('on_route')

    advanceOrder(orderOf(order)!) // in_transit → delivered
    await tick()
    expect(orderOf(order)!.status).toBe('delivered')
    expect(driverOf(driver).status).toBe('available')

    // Undo the delivery: the driver is back on route together with the stop.
    expect(history.undo()).toBe(true)
    expect(orderOf(order)!.status).toBe('in_transit')
    expect(driverOf(driver).status).toBe('on_route')
  })

  it('a driver stays on route until ALL their stops leave the active set', async () => {
    const { product } = setup()
    const driver = mkDriver('Multi Stop Moha')
    const a = mkOrder(product.id, driver, 'assigned', 'Crew Buyer D')
    const b = mkOrder(product.id, driver, 'assigned', 'Crew Buyer E')
    expect(tryCreateOrder(a).ok).toBe(true)
    expect(tryCreateOrder(b).ok).toBe(true)
    await tick()
    startDriverRoute(driver.id)
    await tick()
    expect(driverOf(driver).status).toBe('on_route')

    advanceOrder(orderOf(a)!)
    await tick()
    expect(driverOf(driver).status).toBe('on_route') // b still in transit

    cancelOrder(orderOf(b)!)
    await tick()
    expect(orderOf(b)!.status).toBe('cancelled')
    expect(driverOf(driver).status).toBe('available') // last active order gone
  })

  it('failing the last in-transit stop also frees the driver', async () => {
    const { product } = setup()
    const driver = mkDriver('Fail Fast Fahd')
    const order = mkOrder(product.id, driver, 'assigned', 'Crew Buyer F')
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()
    startDriverRoute(driver.id)
    await tick()
    expect(driverOf(driver).status).toBe('on_route')

    markOrderFailed(orderOf(order)!)
    await tick()
    expect(orderOf(order)!.status).toBe('failed')
    expect(orderOf(order)!.restocked).toBe(true) // stock flow preserved
    expect(driverOf(driver).status).toBe('available')
  })

  it('finishing a reactivate cycle keeps the remaining driver state sane', async () => {
    const { product } = setup()
    const driver = mkDriver('Backlog Baha')
    const keep = mkOrder(product.id, driver, 'assigned', 'Crew Buyer G')
    const reactivated = mkOrder(product.id, driver, 'assigned', 'Crew Buyer H')
    expect(tryCreateOrder(keep).ok).toBe(true)
    expect(tryCreateOrder(reactivated).ok).toBe(true)
    await tick()

    startDriverRoute(driver.id)
    await tick()
    expect(driverOf(driver).status).toBe('on_route')

    // Fail one stop, then send it back to intake: the driver keeps running.
    markOrderFailed(orderOf(reactivated)!)
    await tick()
    expect(reactivateOrder(orderOf(reactivated)!).ok).toBe(true)
    await tick()
    expect(orderOf(reactivated)!.status).toBe('pending')
    expect(orderOf(reactivated)!.driverId).toBeUndefined()
    expect(driverOf(driver).status).toBe('on_route') // keep is still in transit
    expect(
      db.orders.all().filter((o) => o.driverId === driver.id && isActiveAssignment(o)).length,
    ).toBe(1)

    advanceOrder(orderOf(keep)!)
    await tick()
    expect(driverOf(driver).status).toBe('available')
  })

  it('off_duty is never overridden by automation', async () => {
    const { product } = setup()
    const driver = mkDriver('Resting Rania', 'off_duty')
    // Fixture: an order already sitting with the off-duty driver.
    const order = mkOrder(product.id, driver, 'assigned', 'Crew Buyer I')
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()
    expect(driverOf(driver).status).toBe('off_duty')

    advanceOrder(orderOf(order)!)
    await tick()
    expect(orderOf(order)!.status).toBe('in_transit')
    expect(driverOf(driver).status).toBe('off_duty') // untouched

    advanceOrder(orderOf(order)!)
    await tick()
    expect(orderOf(order)!.status).toBe('delivered')
    expect(driverOf(driver).status).toBe('off_duty') // still untouched
  })

  it('assignOrders refuses off-duty drivers with a clear message and no changes', async () => {
    const { product } = setup()
    const driver = mkDriver('Duty Dodger', 'off_duty')
    const order = mkOrder(product.id)
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()

    const before = stats()
    const result = assignOrders([order.id], driver.id)
    await tick()

    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toContain('Duty Dodger is off duty')
    expect(result.assigned).toBeUndefined()
    expect(orderOf(order)!.status).toBe('pending') // untouched
    expect(orderOf(order)!.driverId).toBeUndefined()
    expect(driverOf(driver).status).toBe('off_duty')
    expect(stats().undoCount - before.undoCount).toBe(0) // no history entry
  })

  it('auto-assign never picks off-duty drivers', async () => {
    const { product } = setup()
    const relieved = [...db.drivers.all()].map((driver) => {
      db.drivers.update(driver.id, { status: 'off_duty' })
      return driver
    })
    const order = mkOrder(product.id)
    expect(tryCreateOrder(order).ok).toBe(true)
    await tick()

    const result = autoAssignPendingOrders()
    await tick()

    expect(result.ok).toBe(false)
    expect(translateAction(result.error)).toBe('No available drivers right now.')
    expect(orderOf(order)!.status).toBe('pending')
    expect(orderOf(order)!.driverId).toBeUndefined()

    // Restore the roster for later tests.
    for (const driver of relieved) {
      db.drivers.update(driver.id, { status: 'available' })
    }
    await tick()
  })
})
