import type { BadgeTone } from '@/components/ui/Badge'
import type {
  DriverStatus,
  OrderStatus,
} from '@/types'

/** Presentation maps shared by order-related pages, drawer, and timeline. */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'amber',
  assigned: 'violet',
  in_transit: 'blue',
  delivered: 'green',
  failed: 'red',
  cancelled: 'gray',
}

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  available: 'Available',
  on_route: 'On route',
  off_duty: 'Off duty',
}

export const DRIVER_STATUS_TONE: Record<DriverStatus, BadgeTone> = {
  available: 'green',
  on_route: 'blue',
  off_duty: 'gray',
}
