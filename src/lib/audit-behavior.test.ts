import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllData, db, runTransaction } from './store'
import { tryCreateOrder, markOrderFailed, cancelOrder, reactivateOrder, advanceOrder } from './orders'
import { installDemoData } from './demoData'

function mkOrder(overrides: any = {}) {
  return {
    id: 'ord_t',
    customerName: 'Test',
    address: 'Centre-ville',
    lat: 27.15,
    lng: -13.20,
    items: [{ productId: 'prd_001', qty: 1 }],
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => clearAllData())

describe('audit behavior', () => {
  it('assigned order fail clears driverId? check', () => {
    installDemoData()
    // create a product? use existing seed products
    const products = db.products.all()
    const pid = products[0].id
    // ensure stock
    const order = mkOrder({ items: [{ productId: pid, qty: 1 }], status: 'pending' })
    tryCreateOrder(order)
    const o = db.orders.all().find((x) => x.id === 'ord_t')!
    // assign
    advanceOrder(o) // pending -> assigned
    const assigned = db.orders.all().find((x) => x.id === 'ord_t')!
    const drv = db.drivers.all().find((d) => d.id === assigned.driverId)!
    markOrderFailed(assigned)
    const after = db.orders.all().find((x) => x.id === 'ord_t')!
    const drvAfter = db.drivers.all().find((d) => d.id === assigned.driverId)!
    reactivateOrder(after)
    const re = db.orders.all().find((x) => x.id === 'ord_t')!
    throw new Error(`assigned=${assigned.driverId} drvBefore=${drv.status} afterFail=${after.status} driverId=${after.driverId} drvAfter=${drvAfter?.status ?? 'n/a'} reactivated=${re.status} reDriverId=${re.driverId}`)
  })

  it('delivered order can be marked failed?', () => {
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
    console.log('delivered', del.status)
    markOrderFailed(del)
    const after = db.orders.all().find((x) => x.id === 'ord_t')!
    console.log('after markOrderFailed on delivered:', after.status)
  })
})
