import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { formatDate, formatCurrency } from '@/lib/format'
import { buildProductIndex, getOrderTotal, summarizeOrderItems } from '@/lib/orders'
import { ORDER_STATUS_TONE, orderStatusLabel } from '@/lib/status'
import { db, useCollection } from '@/lib/store'
import { useIsMobile } from '@/lib/useIsMobile'
import type { OrderStatus } from '@/types'

import NewOrderModal from './NewOrderModal'
import OrderDetailDrawer from './OrderDetailDrawer'

type Filter = 'all' | OrderStatus

export default function OrdersPage() {
  // Subscribes to the language so status chips re-render instantly on switch.
  const { t } = useTranslation()
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const isMobile = useIsMobile()

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
    { key: 'all', label: t('orders.chipAll') },
    { key: 'pending', label: orderStatusLabel('pending') },
    { key: 'assigned', label: orderStatusLabel('assigned') },
    { key: 'in_transit', label: orderStatusLabel('in_transit') },
    { key: 'delivered', label: orderStatusLabel('delivered') },
    { key: 'failed', label: orderStatusLabel('failed') },
    { key: 'cancelled', label: orderStatusLabel('cancelled') },
  ]

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        description={t('orders.description')}
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('orders.searchPlaceholder')}
              className={`${inputClasses} w-full sm:w-64`}
            />
            <Button onClick={() => setModalOpen(true)}>{t('orders.addNew')}</Button>
          </>
        }
      />

      <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:py-0">
        {chips.map((chip) => {
          const active = filter === chip.key
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition md:min-h-0 ${
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
              message={t('orders.noOrders')}
              action={
                <div className="flex flex-col items-center gap-2">
                  <Button
                    onClick={() => setModalOpen(true)}
                    disabled={!canCreate}
                    title={
                      noProducts
                        ? t('orders.blockedNoStockShort')
                        : noStock
                          ? t('orders.blockedNoStockQtyShort')
                          : undefined
                    }
                  >
                    {t('orders.addNew')}
                  </Button>
                  {!canCreate && (
                    <p className="max-w-xs text-center text-xs text-slate-400">
                      {noProducts
                        ? t('orders.blockedNoStockInfo')
                        : t('orders.blockedNoStockQtyInfo')}
                    </p>
                  )}
                </div>
              }
            />
          )
        })()
      ) : visibleOrders.length === 0 ? (
        <EmptyState icon="🔍" message={t('orders.noMatchFilter')} />
      ) : isMobile ? (
        /* Phone: tappable cards open the detail sheet. */
        <ul className="flex flex-col gap-3">
          {visibleOrders.map((order) => (
            <li
              key={order.id}
              onClick={() => setDetailId(order.id)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{order.id}</span>
                <Badge tone={ORDER_STATUS_TONE[order.status]}>
                  {orderStatusLabel(order.status)}
                </Badge>
              </div>
              <div className="mt-1.5 flex min-w-0 items-baseline justify-between gap-2">
                <h2 className="truncate font-medium text-slate-900">{order.customerName}</h2>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatCurrency(getOrderTotal(order, productIndex))}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-500">{order.address}</p>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
                <span className="truncate">
                  {summarizeOrderItems(order, productIndex, t('common.unknownItem'))}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span>{driverName(order.driverId)}</span>
                  <span>{formatDate(order.createdAt)}</span>
                  <span className="font-medium text-slate-600">{t('orders.view')}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Table
          columns={[
            t('orders.columnOrder'),
            t('orders.columnCustomer'),
            t('orders.columnAddress'),
            t('orders.columnItems'),
            t('orders.columnDriver'),
            t('orders.columnStatus'),
            t('orders.columnDate'),
            t('orders.columnTotal'),
            '',
          ]}
        >
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
                {summarizeOrderItems(order, productIndex, t('common.unknownItem'))}
              </Td>
              <Td className="text-slate-500">{driverName(order.driverId)}</Td>
              <Td>
                <Badge tone={ORDER_STATUS_TONE[order.status]}>
                  {orderStatusLabel(order.status)}
                </Badge>
              </Td>
              <Td className="text-slate-500">{formatDate(order.createdAt)}</Td>
              <Td>{formatCurrency(getOrderTotal(order, productIndex))}</Td>
              <Td className="text-right">
                <span className="text-sm font-medium text-slate-600">{t('orders.view')}</span>
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
