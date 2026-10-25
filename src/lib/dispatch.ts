import { location } from '@/config/location'
import { mutateOrder } from './orders'
import { db, runTransaction } from './store'
import type { TranslatableLabel } from './store'
import { DRIVER_STATUS_KEYS } from './status'
import type { DriverStatus, Order } from '@/types'

/** Dispatch helpers: assigning pending orders to drivers, incl. geo clustering. */

/** Orders that currently sit with a driver (counted on driver cards). */
export function isActiveAssignment(order: Order): boolean {
  return order.status === 'assigned' || order.status === 'in_transit'
}

// ---------------------------------------------------------------------------
// Driver status automation (manual status always wins when set by hand)
// ---------------------------------------------------------------------------

/** An order-level event that may require the driver's status to move. */
export type OrderRouteEvent =
  /** One of the driver's orders started moving (assigned → in_transit). */
  | { type: 'started_in_transit' }
  /** An order left the driver's active set (delivered/failed/cancelled/unassigned). */
  | { type: 'left_active' }

export interface DriverOrderCounts {
  /** Orders of this driver currently in transit. */
  inTransit: number
  /** Orders of this driver currently assigned or in transit. */
  active: number
}

/**
 * Pure status rule evaluated AFTER an order event, for one driver:
 * - any in-transit order puts an available driver on route,
 * - a driver on route with nothing left in hand goes back to available,
 * - `off_duty` is a manual decision and is NEVER overridden by automation.
 *
 * Returns the new status, or `null` when nothing should change.
 */
export function nextDriverStatus(
  driverStatus: DriverStatus,
  event: OrderRouteEvent,
  counts: DriverOrderCounts,
): DriverStatus | null {
  if (driverStatus === 'off_duty') return null
  if (event.type === 'started_in_transit') {
    return driverStatus === 'available' && counts.inTransit > 0 ? 'on_route' : null
  }
  return driverStatus === 'on_route' && counts.active === 0 ? 'available' : null
}

/**
 * Applies `nextDriverStatus` for one driver based on the CURRENT data.
 * Safe to call from inside a transaction (merges into the same undo entry)
 * or directly after an order mutation (its own labeled entry).
 */
export function syncDriverStatusAfterOrderEvent(
  driverId: string | undefined,
  event: OrderRouteEvent,
): void {
  if (!driverId) return
  const driver = db.drivers.all().find((entry) => entry.id === driverId)
  if (!driver) return

  const driverOrders = db.orders.all().filter((order) => order.driverId === driverId)
  const counts: DriverOrderCounts = {
    inTransit: driverOrders.filter((order) => order.status === 'in_transit').length,
    active: driverOrders.filter(isActiveAssignment).length,
  }
  const next = nextDriverStatus(driver.status, event, counts)
  if (next && next !== driver.status) {
    db.drivers.update(
      driver.id,
      { status: next },
      // Nested label: the status word resolves in the viewing language.
      {
        key: 'actions.setDriverStatus',
        params: { name: driver.name, status: { key: DRIVER_STATUS_KEYS[next] } },
      },
    )
  }
}

/**
 * Starts a driver's run: ALL of their assigned orders move to in transit,
 * in stop order, in ONE undoable step together with the on-route status
 * change. Returns how many stops went in transit.
 */
export function startDriverRoute(driverId: string): { started: number } {
  const driver = db.drivers.all().find((entry) => entry.id === driverId)
  if (!driver) return { started: 0 }

  let started = 0
  return runTransaction(
    () => ({ key: 'actions.startedRoute', params: { name: driver.name, count: started } }),
    () => {
      const stops = db.orders
        .all()
        .filter((order) => order.driverId === driverId && order.status === 'assigned')
      for (const order of stops) {
        mutateOrder(order.id, { status: 'in_transit' })
        started += 1
      }
      if (started > 0) {
        syncDriverStatusAfterOrderEvent(driverId, { type: 'started_in_transit' })
      }
      return { started }
    },
  )
}

/**
 * Hands a batch of pending orders to one driver. Assignment alone never
 * changes the driver's status (they start moving when a stop goes in
 * transit). Off-duty drivers are refused outright.
 */
export interface AssignResult {
  ok: boolean
  assigned?: number
  error?: TranslatableLabel
}

export function assignOrders(
  orderIds: string[],
  driverId: string,
): AssignResult {
  let assigned = 0
  const driver = db.drivers.all().find((entry) => entry.id === driverId)
  if (!driver) return { ok: false, error: { key: 'errors.unknownDriver' } }
  if (driver.status === 'off_duty') {
    return {
      ok: false,
      error: { key: 'errors.driverOffDuty', params: { name: driver.name } },
    }
  }
  runTransaction(
    () => ({ key: 'actions.assignedOrders', params: { count: assigned, name: driver.name } }),
    () => {
      for (const orderId of orderIds) {
        const order = db.orders.all().find((entry) => entry.id === orderId)
        if (!order || order.status !== 'pending') continue
        mutateOrder(orderId, { status: 'assigned', driverId })
        assigned++
      }
      return { assigned }
    },
  )
  return { ok: true, assigned }
}

export interface AutoAssignResult {
  ok: boolean
  assigned?: number
  driversUsed?: number
  error?: TranslatableLabel
}

/** 1° longitude ≈ cos(latitude) of the km of 1° latitude, at the city. */
const LNG_SCALE = Math.cos((location.mapCenter.lat * Math.PI) / 180)

/**
 * Splits pending orders across available drivers with one-dimensional-ish
 * k-means clustering on coordinates. Longitude degrees are scaled by
 * cos(latitude) so distance is roughly uniform in kilometers.
 */
export function autoAssignPendingOrders(): AutoAssignResult {
  const pending = db.orders.all().filter((order) => order.status === 'pending')
  const available = db.drivers.all().filter((driver) => driver.status === 'available')

  if (pending.length === 0) return { ok: false, error: { key: 'errors.autoAssignNoPending' } }
  if (available.length === 0) return { ok: false, error: { key: 'errors.autoAssignNoDrivers' } }

  const clusterCount = Math.min(available.length, pending.length)
  let assignedTotal = 0
  let driversUsedTotal = 0

  // The entire clustering + assignment batch is ONE undoable step. The
  // two counts render via nested plural keys ("3 orders across 2 drivers").
  return runTransaction(
    () => ({
      key: 'actions.autoAssigned',
      params: {
        orders: { key: 'words.orderCount', count: assignedTotal },
        drivers: { key: 'words.driverCount', count: driversUsedTotal },
      },
    }),
    () => {
      // Seed centroids spread across the latitude range for a decent start.
      const sortedByLat = [...pending].sort((a, b) => a.lat - b.lat)
      const centroids = Array.from({ length: clusterCount }, (_, index) => {
        const order = sortedByLat[Math.floor((index * sortedByLat.length) / clusterCount)]
        return { lat: order.lat, lng: order.lng }
      })

      function distance(
        a: { lat: number; lng: number },
        b: { lat: number; lng: number },
      ): number {
        return Math.hypot(a.lat - b.lat, (a.lng - b.lng) * LNG_SCALE)
      }

      let groups: Array<string[]> = []
      for (let iteration = 0; iteration < 10; iteration++) {
        groups = Array.from({ length: clusterCount }, () => [])
        for (const order of pending) {
          let nearest = 0
          for (let i = 1; i < centroids.length; i++) {
            if (distance(order, centroids[i]) < distance(order, centroids[nearest])) nearest = i
          }
          groups[nearest]!.push(order.id)
        }
        for (let i = 0; i < clusterCount; i++) {
          const members = pending.filter((order) => groups[i]!.includes(order.id))
          if (members.length === 0) continue
          centroids[i] = {
            lat: members.reduce((sum, order) => sum + order.lat, 0) / members.length,
            lng: members.reduce((sum, order) => sum + order.lng, 0) / members.length,
          }
        }
      }

      let assigned = 0
      let driversUsed = 0
      for (let i = 0; i < clusterCount; i++) {
        const driver = available[i]
        const orderIds = groups[i] ?? []
        if (!driver || orderIds.length === 0) continue
        assignOrders(orderIds, driver.id)
        assigned += orderIds.length
        driversUsed++
      }
      assignedTotal = assigned
      driversUsedTotal = driversUsed

      if (assigned === 0) return { ok: false, error: { key: 'errors.autoAssignFailed' } }
      return { ok: true, assigned, driversUsed }
    },
  )
}
