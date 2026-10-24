import { db, runTransaction } from './store'
import type { ActionLabel, TranslatableLabel } from './store'
import { syncDriverStatusAfterOrderEvent, type OrderRouteEvent } from './dispatch'
import type { Order, OrderItem, OrderStatus, Product, StatusEvent } from '@/types'

/** Small query helpers shared by order-related pages. */

export function buildProductIndex(products: Product[]): Map<string, Product> {
  return new Map(products.map((product) => [product.id, product]))
}

export function getOrderTotal(
  order: Order,
  productIndex: Map<string, Product>,
): number {
  return order.items.reduce(
    (sum, item) => sum + (productIndex.get(item.productId)?.price ?? 0) * item.qty,
    0,
  )
}

/**
 * "2× Whole Milk, 1× Baguette" style summary. The fallback for a deleted
 * product must already be translated — pass t('common.unknownItem').
 */
export function summarizeOrderItems(
  order: Order,
  productIndex: Map<string, Product>,
  unknownName: string = 'Unknown item',
): string {
  return order.items
    .map((item) => `${item.qty}× ${productIndex.get(item.productId)?.name ?? unknownName}`)
    .join(', ')
}

export interface OrderCreationResult {
  ok: boolean
  /** Structured error label, resolved at display time. */
  error?: TranslatableLabel
}

/** One "{name} — need X, only Y left" line of a stock shortage report. */
function shortageLine(name: string, need: number, have: number): TranslatableLabel {
  return { key: 'errors.shortageLine', params: { name, need, have } }
}

/**
 * Creates an order and keeps inventory in sync by deducting stock.
 * If any item exceeds available stock, nothing is written and the
 * shortfall is reported back to the caller for display.
 */
export function tryCreateOrder(draft: Order): OrderCreationResult {
  // Quantity needed per product, in case the same product appears twice.
  const required = requiredQuantities(draft.items)

  const products = db.products.all()
  const inventory = db.inventory.all()

  const shortages: TranslatableLabel[] = []
  for (const [productId, qty] of required) {
    const available =
      inventory.find((entry) => entry.productId === productId)?.quantity ?? 0
    if (qty > available) {
      const name = products.find((product) => product.id === productId)?.name ?? productId
      shortages.push(shortageLine(name, qty, available))
    }
  }
  if (shortages.length > 0) {
    return { ok: false, error: { key: 'errors.notEnoughStock', params: { list: shortages } } }
  }

  // Order + stock deduction are one undoable step: a single undo reverts both.
  return runTransaction(
    { key: 'actions.createdOrder', params: { name: draft.customerName } },
    () => {
      addStock(required, -1)
      // Record the initial status so the detail timeline has a starting point.
      const statusHistory: StatusEvent[] =
        draft.statusHistory ?? [{ status: 'pending', at: draft.createdAt }]
      db.orders.add({ ...draft, statusHistory })
      return { ok: true }
    },
  )
}

/** Applies a status change (if any) to the order and appends to its history. */
export function mutateOrder(
  orderId: string,
  patch: Partial<Order>,
  label?: ActionLabel,
): void {
  const order = db.orders.all().find((entry) => entry.id === orderId)
  if (!order) return

  const now = new Date().toISOString()
  const status = patch.status ?? order.status
  db.orders.update(
    orderId,
    {
      ...patch,
      statusHistory: [
        ...(order.statusHistory ?? [{ status: order.status, at: order.createdAt }]),
        { status, at: now },
      ],
    },
    label ?? { key: 'actions.updatedOrder', params: { id: orderId } },
  )
}

// ---------------------------------------------------------------------------
// Inventory-aware status changes
// ---------------------------------------------------------------------------

export const TERMINAL_STATUSES: OrderStatus[] = ['failed', 'cancelled']

const isTerminal = (status: OrderStatus): boolean =>
  status === 'failed' || status === 'cancelled'

/** Total units across an order (for readable labels). */
const unitsOf = (order: Order): number =>
  order.items.reduce((sum, item) => sum + item.qty, 0)

export interface TransitionResult {
  ok: boolean
  /** Units moved to/from inventory (0 when stock didn't change). */
  units?: number
  /** Structured error label, resolved at display time. */
  error?: TranslatableLabel
}

/**
 * Marks a delivery as failed: the order leaves circulation and its item
 * quantities go back to inventory. One undoable step covers both the status
 * and the stock change. Idempotent: failing an already-failed order does
 * nothing (the restock-once guard prevents ever returning stock twice).
 */
export function markOrderFailed(order: Order): void {
  leaveTerminalStatus(order, 'failed')
}

/**
 * Cancels an active order: same inventory handling as failing it — stock
 * returns to inventory exactly once, in the same undo step as the status.
 */
export function cancelOrder(order: Order): void {
  leaveTerminalStatus(order, 'cancelled')
}

/**
 * Shared body of fail/cancel: re-entering a terminal status returns the
 * order's stock, in the same undo step as the status itself — together with
 * the driver-status automation (a driver who just lost their last active
 * order becomes available again).
 */
function leaveTerminalStatus(order: Order, next: 'failed' | 'cancelled'): void {
  const current = db.orders.all().find((entry) => entry.id === order.id)
  if (!current || isTerminal(current.status) || current.status === 'delivered') return
  if (current.restocked === true) return // stock already back in inventory

  const units = unitsOf(current)
  const count = units
  const label = () =>
    next === 'cancelled'
      ? { key: 'actions.cancelledOrder', params: { name: current.customerName, count } }
      : { key: 'actions.failedOrder', params: { name: current.customerName, count } }

  runTransaction(label, () => {
    addStock(requiredQuantities(current.items), +1)
    mutateOrder(current.id, { status: next, restocked: true })
    syncDriverStatusAfterOrderEvent(current.driverId, { type: 'left_active' })
  })
}

/**
 * Sends a failed/cancelled order back to intake (pending, driver cleared).
 * If the order's stock was returned when it failed, that stock is deducted
 * again — and the whole change is refused without touching data or history
 * when inventory can't cover it.
 *
 * Legacy orders (registered before `restocked` existed) never had stock
 * returned, so reactivating them needs no deduction at all.
 */
export function reactivateOrder(order: Order): TransitionResult {
  const current = db.orders.all().find((entry) => entry.id === order.id)
  if (!current || !isTerminal(current.status)) {
    return { ok: false, error: { key: 'errors.reactivateNotAllowed' } }
  }

  const wasReturned = current.restocked === true
  const required = requiredQuantities(current.items)

  if (wasReturned) {
    const products = db.products.all()
    const inventory = db.inventory.all()
    const shortages: TranslatableLabel[] = []
    for (const [productId, qty] of required) {
      const available =
        inventory.find((entry) => entry.productId === productId)?.quantity ?? 0
      if (qty > available) {
        const name = products.find((product) => product.id === productId)?.name ?? productId
        shortages.push(shortageLine(name, qty, available))
      }
    }
    if (shortages.length > 0) {
      return {
        ok: false,
        error: { key: 'errors.notEnoughStockReactivate', params: { list: shortages } },
      }
    }
  }

  const units = unitsOf(current)
  runTransaction(
    wasReturned
      ? { key: 'actions.reactivatedOrderRestock', params: { name: current.customerName, count: units } }
      : { key: 'actions.reactivatedOrder', params: { name: current.customerName } },
    () => {
      if (wasReturned) addStock(required, -1)
      mutateOrder(current.id, { status: 'pending', driverId: undefined, restocked: false })
      // The old driver may have just lost their last active order.
      syncDriverStatusAfterOrderEvent(current.driverId, { type: 'left_active' })
    },
  )
  return { ok: true, units: wasReturned ? units : 0 }
}

/** Quantity needed per product, in case the same product appears twice. */
function requiredQuantities(items: OrderItem[]): Map<string, number> {
  const required = new Map<string, number>()
  for (const item of items) {
    required.set(item.productId, (required.get(item.productId) ?? 0) + item.qty)
  }
  return required
}

/** Moves inventory rows by `qty × direction` for every product in `required`. */
function addStock(required: Map<string, number>, direction: 1 | -1): void {
  const inventory = db.inventory.all()
  for (const [productId, qty] of required) {
    const row = inventory.find((entry) => entry.productId === productId)
    if (row) db.inventory.update(row.productId, { quantity: row.quantity + direction * qty })
  }
}

/**
 * Advances the status: pending → assigned → in transit → delivered.
 * A pending order is auto-assigned to the first available driver
 * unless one is already set on the order.
 *
 * Each active-run transition bundles the driver-status automation
 * (available → on route on the first departure; back to available when the
 * last active order leaves) into the SAME undo entry as the order itself.
 */
export function advanceOrder(order: Order): void {
  // Customer name drives a readable label, e.g. "Marked Chaimae Toumi's
  // order as delivered".
  const name = order.customerName
  switch (order.status) {
    case 'pending': {
      const current = order.driverId
        ? db.drivers.all().find((driver) => driver.id === order.driverId)
        : undefined
      const chosenDriverId =
        current && current.status === 'available'
          ? current.id
          : db.drivers.all().find((driver) => driver.status === 'available')?.id
      mutateOrder(
        order.id,
        { status: 'assigned', driverId: chosenDriverId },
        { key: 'actions.assignedOrderAuto', params: { name } },
      )
      break
    }
    case 'assigned': {
      const event: OrderRouteEvent = { type: 'started_in_transit' }
      runTransaction(
        { key: 'actions.orderInTransit', params: { name } },
        () => {
          mutateOrder(order.id, { status: 'in_transit' })
          syncDriverStatusAfterOrderEvent(order.driverId, event)
        },
      )
      break
    }
    case 'in_transit': {
      const event: OrderRouteEvent = { type: 'left_active' }
      runTransaction(
        { key: 'actions.orderDelivered', params: { name } },
        () => {
          mutateOrder(order.id, { status: 'delivered' })
          syncDriverStatusAfterOrderEvent(order.driverId, event)
        },
      )
      break
    }
    default:
      break
  }
}

/** Find the timestamp of the last transition to each status. */
export function historyIndex(order: Order): Map<OrderStatus, string> {
  const timestamps = new Map<OrderStatus, string>()
  for (const event of order.statusHistory ?? []) {
    timestamps.set(event.status, event.at)
  }
  return timestamps
}
