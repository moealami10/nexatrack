import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { formatDateTime, formatCurrency } from '@/lib/format'
import { buildProductIndex, getOrderTotal, summarizeOrderItems } from '@/lib/orders'
import { ORDER_STATUS_TONE, orderStatusLabel } from '@/lib/status'
import { useIsMobile } from '@/lib/useIsMobile'
import { db, useCollection } from '@/lib/store'
import type { OrderStatus } from '@/types'

import { getDashboardStats } from './stats'

/** Chart colors echoing the badge tones. */
const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#f59e0b',
  assigned: '#8b5cf6',
  in_transit: '#0ea5e9',
  delivered: '#059669',
  failed: '#ef4444',
  cancelled: '#64748b',
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const routePlans = useCollection(db.routePlans)

  const productIndex = buildProductIndex(products)

  const stats = getDashboardStats({ products, inventory, orders, drivers })
  const {
    ordersToday,
    deliveredCount,
    deliveredPercent,
    activeDrivers,
    availableDrivers,
    lowStockCount,
    chartData,
    latestOrders,
  } = stats

  // Getting-started checklist: ticks off automatically as data appears,
  // and hides completely once every step is done.
  const steps = [
    { label: t('dashboard.stepProducts'), done: products.length > 0, to: '/products' },
    { label: t('dashboard.stepStock'), done: inventory.some((item) => item.quantity > 0), to: '/inventory' },
    { label: t('dashboard.stepDrivers'), done: drivers.length > 0, to: '/drivers' },
    { label: t('dashboard.stepOrders'), done: orders.length > 0, to: '/orders' },
    { label: t('dashboard.stepRoutes'), done: routePlans.length > 0, to: '/routes' },
  ]
  const allStepsDone = steps.every((step) => step.done)

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
      />

      {/* 2-col KPI grid on phones, unchanged 4-col from `lg` up */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon="🧾" label={t('dashboard.ordersToday')} value={ordersToday} accent="sky" />
        <StatCard
          icon="✅"
          label={t('dashboard.delivered')}
          value={`${deliveredPercent}%`}
          hint={t('dashboard.deliveredHint_other', { delivered: deliveredCount, total: orders.length })}
          accent="emerald"
        />
        <StatCard
          icon="🛵"
          label={t('dashboard.activeDrivers')}
          value={activeDrivers}
          hint={
            availableDrivers === 1
              ? t('dashboard.availableHint_one', { count: availableDrivers })
              : t('dashboard.availableHint_other', { count: availableDrivers })
          }
          accent="violet"
        />
        <StatCard
          icon="⚠️"
          label={t('dashboard.lowStock')}
          value={lowStockCount}
          hint={t('dashboard.lowStockHint')}
          accent="amber"
        />
      </div>

      {/* Getting started: only visible while something is missing. */}
      {!allStepsDone && (
        <section className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-sky-700">
            {t('dashboard.gettingStarted')}
          </h2>
          <ol className="mt-3 space-y-2">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.done ? 'bg-emerald-500 text-white' : 'bg-white text-sky-700 ring-1 ring-inset ring-sky-300'
                  }`}
                >
                  {step.done ? '✓' : index + 1}
                </span>
                <Link
                  to={step.to}
                  className={
                    step.done
                      ? 'text-emerald-700 line-through decoration-emerald-300'
                      : 'font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-600'
                  }
                >
                  {step.label}
                </Link>
                {step.done && <span className="text-xs text-emerald-600">{t('dashboard.stepDone')}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* grid-cols-1: explicit minmax(0,1fr) tracks, so children can shrink
          below their content width instead of overflowing (auto tracks size
          to max-content and blow out narrow viewports). */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Orders by status */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {t('dashboard.ordersByStatus')}
          </h2>
          <div className="mt-4 h-60 min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={
                  isMobile
                    ? { top: 8, right: 8, left: -24, bottom: 24 }
                    : { top: 8, right: 8, left: -18, bottom: 0 }
                }
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  /* Phone: long French labels rotate so 6 statuses don't collide. */
                  tick={
                    isMobile
                      ? { fontSize: 11, fill: '#64748b', angle: -35, textAnchor: 'end' as const }
                      : { fontSize: 12, fill: '#64748b' }
                  }
                  height={isMobile ? 76 : undefined}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'rgba(100, 116, 139, 0.08)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Latest orders */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.latestOrders')}
            </h2>
            <Link
              to="/orders"
              className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
            >
              {t('dashboard.viewAll')}
            </Link>
          </div>

          {latestOrders.length === 0 ? (
            <EmptyState icon="🧾" message={t('dashboard.noOrders')} />
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {latestOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {order.customerName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {summarizeOrderItems(order, productIndex)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={ORDER_STATUS_TONE[order.status]}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                    <p className="mt-1 text-xs font-medium text-slate-700">
                      {formatCurrency(getOrderTotal(order, productIndex))}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
