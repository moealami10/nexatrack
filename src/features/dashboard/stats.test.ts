import { describe, expect, it } from 'vitest'

import { getDashboardStats, type DashboardInput } from './stats'
import type { Driver, InventoryItem, Order } from '@/types'

import type { DashboardStats } from './stats'

const DAY_PAD = (value: number) => String(value).padStart(2, '0')

/** Today's local date as an ISO timestamp, computed at runtime — the
 * fixture date must never be hardcoded, or the suite breaks at midnight. */
function todayIso(time: string): string {
  const now = new Date()
  return `${now.getFullYear()}-${DAY_PAD(now.getMonth() + 1)}-${DAY_PAD(now.getDate())}T${time}:00`
}

/** Minimal fixtures — dashboard math only touches the shown fields. */
function mkOrder(status: Order['status'], createdAt: string): Order {
  return {
    id: `ord_${createdAt}_${status}`,
    customerName: 'Test Customer',
    address: 'Anywhere',
    lat: 33.5,
    lng: -7.6,
    items: [],
    status,
    createdAt,
  }
}

const EMPTY_INPUT: DashboardInput = {
  products: [],
  inventory: [],
  orders: [],
  drivers: [],
}

describe('getDashboardStats', () => {
  it('returns all zeros with completely empty data — no NaN, no Infinity', () => {
    const stats: DashboardStats = getDashboardStats(EMPTY_INPUT)

    expect(stats.ordersToday).toBe(0)
    expect(stats.deliveredCount).toBe(0)
    expect(stats.deliveredPercent).toBe(0) // never NaN with 0 orders
    expect(stats.activeDrivers).toBe(0)
    expect(stats.availableDrivers).toBe(0)
    expect(stats.lowStockCount).toBe(0)
    expect(stats.latestOrders).toEqual([])
    // All six statuses are present so the chart never renders missing bars.
    expect(stats.chartData.map((bar) => bar.count)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('computes 50% delivered with one delivered order of two', () => {
    const orders: Order[] = [
      mkOrder('delivered', todayIso('08:00')),
      mkOrder('pending', todayIso('09:00')),
    ]

    const stats = getDashboardStats({ ...EMPTY_INPUT, orders })

    expect(stats.deliveredCount).toBe(1)
    expect(stats.deliveredPercent).toBe(50)
    expect(stats.ordersToday).toBe(2)
    expect(stats.chartData.find((bar) => bar.status === 'delivered')?.count).toBe(1)
    expect(stats.chartData.find((bar) => bar.status === 'pending')?.count).toBe(1)
  })

  it('counts inventory rows at or below their threshold as low stock', () => {
    const inventory: InventoryItem[] = [
      { productId: 'prd_a', quantity: 2, lowStockThreshold: 5 }, // below → low
      { productId: 'prd_b', quantity: 5, lowStockThreshold: 5 }, // at → low
      { productId: 'prd_c', quantity: 6, lowStockThreshold: 5 }, // fine
    ]

    expect(getDashboardStats({ ...EMPTY_INPUT, inventory }).lowStockCount).toBe(2)
  })

  it('separates available from active (on route) drivers', () => {
    const drivers: Driver[] = [
      { id: 'drv_a', name: 'A', phone: '', vehicle: '', status: 'available' },
      { id: 'drv_b', name: 'B', phone: '', vehicle: '', status: 'on_route' },
      { id: 'drv_c', name: 'C', phone: '', vehicle: '', status: 'off_duty' },
    ]

    const stats = getDashboardStats({ ...EMPTY_INPUT, drivers })
    expect(stats.availableDrivers).toBe(1)
    expect(stats.activeDrivers).toBe(1)
  })

  it('lists the 5 newest orders first', () => {
    const orders = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'].map(
      (time) => mkOrder('pending', `2026-10-24T${time}:00`),
    )

    const stats = getDashboardStats({ ...EMPTY_INPUT, orders })
    expect(stats.latestOrders.map((order) => order.createdAt)).toEqual([
      '2026-10-24T12:00:00',
      '2026-10-24T11:00:00',
      '2026-10-24T10:00:00',
      '2026-10-24T09:00:00',
      '2026-10-24T08:00:00',
    ])
  })
})
