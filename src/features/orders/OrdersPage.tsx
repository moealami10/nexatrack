import { useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { formatDate, formatCurrency } from '@/lib/format'
import { buildProductIndex, getOrderTotal, summarizeOrderItems } from '@/lib/orders'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/status'
import { db, useCollection } from '@/lib/store'
import type { OrderStatus } from '@/types'

import NewOrderModal from './NewOrderModal'
import OrderDetailDrawer from './OrderDetailDrawer'

type Filter = 'all' | OrderStatus

export default function OrdersPage() {
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const productIndex = buildProductIndex(products)
  const driverName = (driverId?: string) =>
    drivers.find((driver) => driver.id === driverId)?.name ?? '—'

  const query = search.trim().toLowerCase()
  const visibleOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(
      (order) =>
        (filter === 'all' || order.status === filter) &&
        (!query ||
          order.customerName.toLowerCase().includes(query) ||
          order.address.toLowerCase().includes(query) ||
          order.id.toLowerCase().includes(query)),
    )

  const countFor = (status: Filter) =>
    status === 'all' ? orders.length : orders.filter((order) => order.status === status).length

  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: ORDER_STATUS_LABEL.pending },
    { key: 'assigned', label: ORDER_STATUS_LABEL.assigned },
    { key: 'in_transit', label: ORDER_STATUS_LABEL.in_transit },
    { key: 'delivered', label: ORDER_STATUS_LABEL.delivered },
    { key: 'failed', label: ORDER_STATUS_LABEL.failed },
    { key: 'cancelled', label: ORDER_STATUS_LABEL.cancelled },
  ]

  return (
    <>
      <PageHeader
        title="Orders"
        description="Track orders from intake to delivery. Stock is deducted on creation and returned on cancel/fail."
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, address, or ID…"
              className={`${inputClasses} w-full sm:w-64`}
            />
            <Button onClick={() => setModalOpen(true)}>+ New order</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const active = filter === chip.key
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
                active
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {chip.label}
              <span className={`ml-1.5 text-xs ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                {countFor(chip.key)}
              </span>
            </button>
          )
        })}
      </div>

      {orders.length === 0 ? (
        (() => {
          const noProducts = products.length === 0
          const noStock = !noProducts && !inventory.some((item) => item.quantity > 0)
          const canCreate = !noProducts && !noStock
          return (
            <EmptyState
              icon="🧾"
              message="No orders yet."
              action={
                <div className="flex flex-col items-center gap-2">
                  <Button
                    onClick={() => setModalOpen(true)}
                    disabled={!canCreate}
                    title={
                      noProducts
                        ? 'Add products first — orders need at least one product'
                        : noStock
                          ? 'Set a stock quantity above zero first — orders are blocked without stock'
                          : undefined
                    }
                  >
                    + New order
                  </Button>
                  {!canCreate && (
                    <p className="max-w-xs text-center text-xs text-slate-400">
                      {noProducts
                        ? 'Add at least one product before creating orders.'
                        : 'Set at least one product’s stock above zero to create orders.'}
                    </p>
                  )}
                </div>
              }
            />
          )
        })()
      ) : visibleOrders.length === 0 ? (
        <EmptyState icon="🔍" message="No orders match the current filter." />
      ) : (
        <Table columns={['Order', 'Customer', 'Address', 'Items', 'Driver', 'Status', 'Date', 'Total', '']}>
          {visibleOrders.map((order) => (
            <tr
              key={order.id}
              onClick={() => setDetailId(order.id)}
              className="cursor-pointer transition hover:bg-slate-50"
            >
              <Td className="font-mono text-xs text-slate-500">{order.id}</Td>
              <Td className="font-medium">{order.customerName}</Td>
              <Td className="text-slate-500">
                {order.address}
                <div className="text-xs text-slate-400">
                  {order.lat.toFixed(4)}, {order.lng.toFixed(4)}
                </div>
              </Td>
              <Td className="max-w-56 truncate text-slate-500">
                {summarizeOrderItems(order, productIndex)}
              </Td>
              <Td className="text-slate-500">{driverName(order.driverId)}</Td>
              <Td>
                <Badge tone={ORDER_STATUS_TONE[order.status]}>
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
              </Td>
              <Td className="text-slate-500">{formatDate(order.createdAt)}</Td>
              <Td>{formatCurrency(getOrderTotal(order, productIndex))}</Td>
              <Td className="text-right">
                <span className="text-sm font-medium text-slate-600">View →</span>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {modalOpen && <NewOrderModal onClose={() => setModalOpen(false)} />}
      {detailId && <OrderDetailDrawer orderId={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
