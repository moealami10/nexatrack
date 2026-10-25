import { describe, expect, it } from 'vitest'

import { location } from '@/config/location'
import { seedDrivers, seedInventory, seedOrders, seedProducts } from './seed'

/**
 * Pages rely on these invariants (foreign keys between products,
 * inventory, drivers, and orders; plausible coordinates). Keeping them
 * as tests means a broken seed breaks the build, not the UI.
 */

const products = seedProducts('en')
const productIds = new Set(products.map((product) => product.id))
const skuSet = new Set(products.map((product) => product.sku))
const drivers = seedDrivers
const driverIds = new Set(drivers.map((driver) => driver.id))
const orders = seedOrders()

// The configured operating area (Laâyoune) — seed coords must stay inside.
const { bounds } = location

const phoneRe = /^\+212 [67] \d{2} \d{2} \d{2} \d{2}$/
describe('seed integrity', () => {
  it('has 15 unique products', () => {
    expect(products).toHaveLength(15)
    expect(productIds.size).toBe(15)
    expect(skuSet.size).toBe(15)
    for (const product of products) {
      expect(product.name).toMatch(/\S/)
      expect(product.unit).toMatch(/\S/)
      expect(product.price).toBeGreaterThan(0)
    }
  })

  it('has exactly one inventory row per product', () => {
    expect(seedInventory).toHaveLength(products.length)
    const inventoryProductIds = new Set(seedInventory.map((item) => item.productId))
    expect([...inventoryProductIds].sort()).toEqual([...productIds].sort())
    for (const item of seedInventory) {
      expect(item.quantity).toBeGreaterThanOrEqual(0)
      expect(item.lowStockThreshold).toBeGreaterThan(0)
    }
  })

  it('has at least one low-stock row', () => {
    expect(seedInventory.some((item) => item.quantity <= item.lowStockThreshold)).toBe(true)
  })

  it('has 5 fully described drivers with valid phones and plates', () => {
    expect(drivers).toHaveLength(5)
    expect(driverIds.size).toBe(5)
    for (const driver of drivers) {
      expect(driver.phone).toMatch(phoneRe)
      expect(driver.vehicle).toMatch(/\d{4,5}-[A-Z]-17/)
    }
  })

  it('has 20 orders with valid products, optional drivers, and city coordinates', () => {
    expect(orders).toHaveLength(20)
    const coordSet = new Set<string>()
    for (const order of orders) {
      expect(order.customerName.length).toBeGreaterThan(0)
      expect(order.address.length).toBeGreaterThan(0)
      expect(order.items.length).toBeGreaterThan(0)
      for (const item of order.items) {
        expect(productIds.has(item.productId)).toBe(true)
        expect(item.qty).toBeGreaterThan(0)
      }
      if (order.driverId !== undefined) {
        expect(driverIds.has(order.driverId)).toBe(true)
      }
      expect(order.lat).toBeGreaterThan(bounds.minLat)
      expect(order.lat).toBeLessThan(bounds.maxLat)
      expect(order.lng).toBeGreaterThan(bounds.minLng)
      expect(order.lng).toBeLessThan(bounds.maxLng)
      const key = `${order.lat},${order.lng}`
      expect(coordSet.has(key)).toBe(false)
      coordSet.add(key)
    }
  })

  it('has orders spread across at least 6 neighborhoods (distinct address prefixes)', () => {
    const quarters = new Set(orders.map((order) => order.address.split(',')[0]?.trim()))
    expect(quarters.size).toBeGreaterThanOrEqual(6)
  })

  it('keeps driver status consistent with assigned orders', () => {
    const activeStatuses = new Set(['assigned', 'in_transit'])
    for (const driver of drivers) {
      const assigned = orders.filter((order) => order.driverId === driver.id)
      const hasActive = assigned.some((order) => activeStatuses.has(order.status))
      if (driver.status === 'off_duty') {
        expect(assigned.every((order) => !activeStatuses.has(order.status))).toBe(true)
      }
      if (hasActive) {
        expect(driver.status).not.toBe('off_duty')
      }
    }
  })

  it('returns bilingual product names', () => {
    const fr = seedProducts('fr')
    const en = seedProducts('en')
    expect(fr[0]?.name).not.toBe(en[0]?.name)
  })
})
