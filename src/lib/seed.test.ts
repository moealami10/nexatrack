import { describe, expect, it } from 'vitest'

import { seedDrivers, seedInventory, seedOrders, seedProducts } from './seed'

/**
 * Pages rely on these invariants (foreign keys between products,
 * inventory, drivers, and orders; plausible coordinates). Keeping them
 * as tests means a broken seed breaks the build, not the UI.
 */

const productIds = new Set(seedProducts.map((product) => product.id))
const skuSet = new Set(seedProducts.map((product) => product.sku))
const driverIds = new Set(seedDrivers.map((driver) => driver.id))

// Loose bounding box around the Casablanca metro area.
const CASABLANCA_BOUNDS = { minLat: 33.4, maxLat: 33.75, minLng: -7.9, maxLng: -7.4 }

describe('seed integrity', () => {
  it('has 12 unique products', () => {
    expect(seedProducts).toHaveLength(12)
    expect(productIds.size).toBe(12)
    expect(skuSet.size).toBe(12)
    for (const product of seedProducts) {
      expect(product.name).toMatch(/\S/)
      expect(product.unit).toMatch(/\S/)
      expect(product.price).toBeGreaterThan(0)
    }
  })

  it('has exactly one inventory row per product', () => {
    expect(seedInventory).toHaveLength(seedProducts.length)
    const inventoryProductIds = new Set(seedInventory.map((item) => item.productId))
    // Spread → ignore insertion-order differences between the two sets.
    expect([...inventoryProductIds].sort()).toEqual([...productIds].sort())
    for (const item of seedInventory) {
      expect(item.quantity).toBeGreaterThanOrEqual(0)
      expect(item.lowStockThreshold).toBeGreaterThan(0)
    }
  })

  it('has 5 fully described drivers', () => {
    expect(seedDrivers).toHaveLength(5)
    expect(driverIds.size).toBe(5)
    for (const driver of seedDrivers) {
      expect(driver.phone.length).toBeGreaterThan(0)
      expect(driver.vehicle.length).toBeGreaterThan(0)
    }
  })

  it('has 20 orders with valid products, optional drivers, and city coordinates', () => {
    expect(seedOrders).toHaveLength(20)
    for (const order of seedOrders) {
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
      expect(order.lat).toBeGreaterThan(CASABLANCA_BOUNDS.minLat)
      expect(order.lat).toBeLessThan(CASABLANCA_BOUNDS.maxLat)
      expect(order.lng).toBeGreaterThan(CASABLANCA_BOUNDS.minLng)
      expect(order.lng).toBeLessThan(CASABLANCA_BOUNDS.maxLng)
    }
  })
})
