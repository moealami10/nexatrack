import { currentDayKey, localDayKey } from '@/lib/format'
import { orderStatusLabel } from '@/lib/status'
import type { Driver, InventoryItem, Order, OrderStatus } from '@/types'

/**
 * Pure dashboard aggregation — extracted from the page so empty-data
 * behavior (no division by zero, no chart errors) is unit-testable.
 */

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'assigned',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
]

export interface DashboardInput {
  products: unknown[]
  inventory: InventoryItem[]
  orders: Order[]
  drivers: Driver[]
}

export interface DashboardStats {
  /** Orders created today (local day). */
  ordersToday: number
  deliveredCount: number
  /** Percent of all orders delivered; 0 with no orders (never NaN). */
  deliveredPercent: number
  activeDrivers: number
  availableDrivers: number
  /** Inventory rows at or below their low-stock threshold. */
  lowStockCount: number
  /** One bar per status; always all six, count 0 included. */
  chartData: Array<{ status: OrderStatus; name: string; count: number }>
  /** 5 most recently created orders. */
  latestOrders: Order[]
}

export function getDashboardStats(input: DashboardInput): DashboardStats {
  const { inventory, orders, drivers } = input

  const today = currentDayKey()
  const ordersToday = orders.filter(
    (order) => localDayKey(order.createdAt) === today,
  ).length
  const deliveredCount = orders.filter((order) => order.status === 'delivered').length
  const deliveredPercent =
    orders.length === 0 ? 0 : Math.round((deliveredCount / orders.length) * 100)
  const activeDrivers = drivers.filter((driver) => driver.status === 'on_route').length
  const availableDrivers = drivers.filter((driver) => driver.status === 'available').length
  const lowStockCount = inventory.filter(
    (item) => item.quantity <= item.lowStockThreshold,
  ).length

  // Translated at compute time; components re-render on language change
  // and recompute these anyway.
  const chartData = ORDER_STATUSES.map((status) => ({
    status,
    name: orderStatusLabel(status),
    count: orders.filter((order) => order.status === status).length,
  }))

  const latestOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  return {
    ordersToday,
    deliveredCount,
    deliveredPercent,
    activeDrivers,
    availableDrivers,
    lowStockCount,
    chartData,
    latestOrders,
  }
}
