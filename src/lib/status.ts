import i18n from '@/i18n'

import type { BadgeTone } from '@/components/ui/Badge'
import type {
  DriverStatus,
  OrderStatus,
} from '@/types'

/** Presentation maps shared by order-related pages, drawer, and timeline. */

/** i18next keys for each status — translated labels read the active language at call time. */
export const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  pending: 'status.order.pending',
  assigned: 'status.order.assigned',
  in_transit: 'status.order.in_transit',
  delivered: 'status.order.delivered',
  failed: 'status.order.failed',
  cancelled: 'status.order.cancelled',
}

export const DRIVER_STATUS_KEYS: Record<DriverStatus, string> = {
  available: 'status.driver.available',
  on_route: 'status.driver.on_route',
  off_duty: 'status.driver.off_duty',
}

/** Translated label for the UI (reads the active language live). */
export function orderStatusLabel(status: OrderStatus): string {
  return i18n.t(ORDER_STATUS_KEYS[status])
}

/** Translated label for the UI (reads the active language live). */
export function driverStatusLabel(status: DriverStatus): string {
  return i18n.t(DRIVER_STATUS_KEYS[status])
}

/**
 * Static English labels for the LIB layer only — store-precision labels
 * (history entries, toasts) stay English until a dedicated pass wires
 * them through translation keys. Never render these in components.
 */
export const ORDER_STATUS_LABEL_EN: Record<OrderStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const DRIVER_STATUS_LABEL_EN: Record<DriverStatus, string> = {
  available: 'Available',
  on_route: 'On route',
  off_duty: 'Off duty',
}

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'amber',
  assigned: 'violet',
  in_transit: 'blue',
  delivered: 'green',
  failed: 'red',
  cancelled: 'gray',
}

export const DRIVER_STATUS_TONE: Record<DriverStatus, BadgeTone> = {
  available: 'green',
  on_route: 'blue',
  off_duty: 'gray',
}
