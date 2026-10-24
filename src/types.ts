/** Domain types shared across features. Swap to API contracts later. */

export interface Product {
  id: string
  name: string
  sku: string
  price: number
  unit: string
}

export interface InventoryItem {
  productId: string
  quantity: number
  lowStockThreshold: number
}

export type DriverStatus = 'available' | 'on_route' | 'off_duty'

export interface Driver {
  id: string
  name: string
  phone: string
  vehicle: string
  status: DriverStatus
}

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'

/** A status change event, used to build the order's timeline. */
export interface StatusEvent {
  status: OrderStatus
  at: string
}

export interface OrderItem {
  productId: string
  qty: number
}

export interface Order {
  id: string
  customerName: string
  address: string
  lat: number
  lng: number
  items: OrderItem[]
  status: OrderStatus
  driverId?: string
  createdAt: string
  /** Append-only log of status changes; drives the detail timeline. */
  statusHistory?: StatusEvent[]
  /**
   * True when this order's item quantities were returned to inventory on a
   * cancel/fail. Kept on the order so stock moves exactly once per cycle:
   * returned once on fail/cancel, deducted again when reactivated. Orders
   * from before this flag existed were never restocked, so `undefined`
   * correctly means "stock is still held by this order".
   */
  restocked?: boolean
  /** Earliest delivery time, "HH:MM" local. Absent = anytime. */
  deliveryWindowStart?: string
  /** Latest delivery time, "HH:MM" local. Absent = anytime. */
  deliveryWindowEnd?: string
  /** Minutes the driver spends at the stop (defaults to 5). */
  serviceMinutes?: number
}

import type { Stop } from '@/lib/routing'

/**
 * A saved route-optimization result for one driver (persisted so it can be
 * undone and survive reloads; computed by lib/routing.ts).
 */
export interface RoutePlanRecord {
  driverId: string
  plan: {
    distanceKm: number
    estimatedMinutes: number
    stops: Stop[]
    /** Total lateness across stops, in minutes (0 when everything fits). */
    totalLateMinutes?: number
    /** How many stops miss their window in the final tour. */
    lateCount?: number
  }
}

