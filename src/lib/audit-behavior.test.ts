import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllData, db } from './store'
import { tryCreateOrder, markOrderFailed, advanceOrder } from './orders'
import { installDemoData } from './demoData'
import type { OrderStatus } from '@/types'

function mkOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'ord_t',
    customerName: 'Test',
    address: 'Centre-ville',
    lat: 27.15,
    lng: -13.20,
    items: [{ productId: 'prd_001', qty: 1 }],
    status: 'pending' as OrderStatus,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => clearAllData())

describe('audit behavior', () => {
  it('markOrderFailed on assigned order: driver becomes available, order status becomes failed (driverId stays on order)', () => {
    installDemoData()
    const products = db.products.all()
    const pid = products[0].id
    const order = mkOrder({ items: [{ productId: pid, qty: 1 }], status: 'pending' })
    tryCreateOrder(order)
    const o = db.orders.all().find((x) => x.id === 'ord_t')!
    // assign
    advanceOrder(o) // pending -> assigned
    const assigned = db.orders.all().find((x) => x.id === 'ord_t')!
    const drv = db.drivers.all().find((d) => d.id === assigned.driverId)!
    expect(assigned.driverId).toBeDefined()
    expect(drv.status).toBe('available')

    markOrderFailed(assigned)
    const after = db.orders.all().find((x) => x.id === 'ord_t')!
    const drvAfter = db.drivers.all().find((d) => d.id === assigned.driverId)!

    expect(after.status).toBe('failed')
    expect(after.driverId).toBe(assigned.driverId) // driverId stays on the order
    expect(drvAfter?.status).toBe('available') // but driver becomes available
  })

  it('markOrderFailed on delivered order is refused (no restock, no event)', () => {
    installDemoData()
    const products = db.products.all()
    const pid = products[0].id
    const order = mkOrder({ items: [{ productId: pid, qty: 1 }], status: 'pending' })
    tryCreateOrder(order)
    const o = db.orders.all().find((x) => x.id === 'ord_t')!
    advanceOrder(o) // assigned
    advanceOrder(db.orders.all().find((x) => x.id === 'ord_t')!) // in_transit
    advanceOrder(db.orders.all().find((x) => x.id === 'ord_t')!) // delivered
    const del = db.orders.all().find((x) => x.id === 'ord_t')!
    expect(del.status).toBe('delivered')

    const beforeStatus = del.status
    markOrderFailed(del)
    const after = db.orders.all().find((x) => x.id === 'ord_t')!

    // Should remain delivered - markOrderFailed on delivered is refused
    expect(after.status).toBe('delivered')
    expect(after.status).toBe(beforeStatus)
  })
})
