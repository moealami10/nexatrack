import { useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { formatDateTime, formatCurrency } from '@/lib/format'
import {
  advanceOrder,
  buildProductIndex,
  cancelOrder,
  getOrderTotal,
  historyIndex,
  markOrderFailed,
  reactivateOrder,
} from '@/lib/orders'
import { driverStatusLabel, orderStatusLabel } from '@/lib/status'
import { db, useCollection } from '@/lib/store'
import type { OrderStatus } from '@/types'

import { useTranslation } from 'react-i18next'

import { StatusTimeline } from './StatusTimeline'

const SECTION_TITLE = 'mb-2 text-xs font-medium uppercase tracking-wide text-slate-500'

export default function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: string
  onClose: () => void
}) {
  // Subscribes to the language so the status badge updates instantly on switch.
  useTranslation()
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const products = useCollection(db.products)
  const [error, setError] = useState<string | null>(null)

  const order = orders.find((entry) => entry.id === orderId)
  if (!order) return null

  const productIndex = buildProductIndex(products)
  const assignedDriver = drivers.find((driver) => driver.id === order.driverId)
  const candidates = drivers.filter(
    (driver) => driver.status !== 'off_duty' && driver.id !== order.driverId,
  )

  const nextLabel =
    order.status === 'pending'
      ? 'Assign driver'
      : order.status === 'assigned'
        ? 'Start delivery'
        : order.status === 'in_transit'
          ? 'Mark delivered'
          : null
  const canFail: OrderStatus[] = ['pending', 'assigned', 'in_transit']
  const isTerminal = order.status === 'failed' || order.status === 'cancelled'

  const handleFail = () => {
    setError(null)
    markOrderFailed(order)
  }

  const handleCancel = () => {
    setError(null)
    cancelOrder(order)
  }

  const handleReactivate = () => {
    setError(null)
    const result = reactivateOrder(order)
    if (!result.ok) setError(result.error ?? 'Could not reactivate the order.')
  }

  return (
    <Drawer title={`Order ${order.id}`} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{order.customerName}</h3>
        <Badge>{orderStatusLabel(order.status)}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">{order.address}</p>
      <p className="text-xs text-slate-400">
        {order.lat.toFixed(4)}, {order.lng.toFixed(4)}
      </p>
      {(order.deliveryWindowStart || order.serviceMinutes != null) && (
        <p className="mt-2 text-sm text-slate-600">
          {order.deliveryWindowStart && order.deliveryWindowEnd && (
            <>🪟 Window {order.deliveryWindowStart}–{order.deliveryWindowEnd} · </>
          )}
          Serviced in {order.serviceMinutes ?? 5} min at the stop
        </p>
      )}

      {/* Driver assignment (only while the order can still change hands) */}
      {(order.status === 'pending' || order.status === 'assigned') && (
        <div className="mt-5">
          <p className={SECTION_TITLE}>Driver</p>
          <select
            value={order.driverId ?? ''}
            onChange={(event) => {
              const value = event.target.value
              const chosen = candidates.find((driver) => driver.id === value)
              db.orders.update(
                order.id,
                { driverId: value || undefined },
                value && chosen
                  ? `Assigned ${order.customerName}'s order to ${chosen.name}`
                  : `Unassigned ${order.customerName}'s order`,
              )
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {candidates.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} ({driverStatusLabel(driver.status)})
              </option>
            ))}
          </select>
        </div>
      )}
      {assignedDriver && order.status !== 'pending' && order.status !== 'assigned' && (
        <p className="mt-3 text-sm text-slate-600">
          Driver: <span className="font-medium">{assignedDriver.name}</span>
        </p>
      )}

      {/* Timeline */}
      <div className="mt-6">
        <p className={SECTION_TITLE}>Timeline</p>
        <StatusTimeline order={order} />
      </div>

      {/* Items */}
      <div className="mt-6">
        <p className={SECTION_TITLE}>Items</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {order.items.map((item) => {
            const product = productIndex.get(item.productId)
            return (
              <li key={item.productId} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span>
                  <span className="text-slate-400">{item.qty}× </span>
                  <span className="font-medium text-slate-800">{product?.name ?? 'Unknown item'}</span>
                  <span className="text-slate-400"> {product?.unit}</span>
                </span>
                <span className="text-slate-600">
                  {formatCurrency((product?.price ?? 0) * item.qty)}
                </span>
              </li>
            )
          })}
          <li className="flex items-center justify-between bg-slate-50 px-3 py-2.5 text-sm font-semibold">
            <span>Total</span>
            <span>{formatCurrency(getOrderTotal(order, productIndex))}</span>
          </li>
        </ul>
      </div>

      {/* Actions */}
      {(nextLabel || canFail.includes(order.status) || isTerminal) && (
        <div className="mt-6 flex gap-2">
          {nextLabel && <Button onClick={() => advanceOrder(order)}>{nextLabel}</Button>}
          {canFail.includes(order.status) && (
            <Button variant="danger" onClick={handleFail}>
              Mark failed
            </Button>
          )}
          {canFail.includes(order.status) && (
            <Button variant="secondary" onClick={handleCancel}>
              Cancel order
            </Button>
          )}
          {isTerminal && <Button onClick={handleReactivate}>Reactivate order</Button>}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20"
        >
          {error}
        </div>
      )}
      {isTerminal && (
        <p className="mt-6 text-sm text-slate-400">
          {order.restocked
            ? 'Stock for this order was returned to inventory.'
            : 'This order was closed under the old stock model; its stock was not returned.'}
        </p>
      )}
      {order.status === 'delivered' && (
        <p className="mt-6 text-sm text-slate-400">
          Delivered on {formatDateTime(historyIndex(order).get('delivered') ?? order.createdAt)}.
        </p>
      )}
    </Drawer>
  )
}
