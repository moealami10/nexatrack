import { formatDateTime } from '@/lib/format'
import { historyIndex } from '@/lib/orders'
import { ORDER_STATUS_LABEL } from '@/lib/status'
import type { Order, OrderStatus } from '@/types'

const STEPS = [
  { status: 'pending', label: ORDER_STATUS_LABEL.pending },
  { status: 'assigned', label: ORDER_STATUS_LABEL.assigned },
  { status: 'in_transit', label: ORDER_STATUS_LABEL.in_transit },
  { status: 'delivered', label: ORDER_STATUS_LABEL.delivered },
] as const satisfies Array<{ status: OrderStatus; label: string }>

type StepStatus = (typeof STEPS)[number]['status']

/** Reached steps are solid in their own color; the current one is outlined. */
const DONE_DOT: Record<StepStatus, string> = {
  pending: 'bg-amber-500',
  assigned: 'bg-violet-500',
  in_transit: 'bg-sky-500',
  delivered: 'bg-emerald-600',
}

const CURRENT_DOT: Record<StepStatus, string> = {
  pending: 'bg-white border-[3px] border-amber-500',
  assigned: 'bg-white border-[3px] border-violet-500',
  in_transit: 'bg-white border-[3px] border-sky-500',
  delivered: 'bg-white border-[3px] border-emerald-600',
}

/**
 * Vertical status timeline. A failed/cancelled order shows its reached steps
 * followed by a red/gray terminal node.
 */
export function StatusTimeline({ order }: { order: Order }) {
  const isFailed = order.status === 'failed'
  const isTerminal = isFailed || order.status === 'cancelled'
  const currentIndex = STEPS.findIndex((step) => step.status === order.status)
  const timestamps = historyIndex(order)
  const placedAt = timestamps.get('pending') ?? order.createdAt

  const reached: OrderStatus[] = isFailed
    ? order.driverId
      ? ['pending', 'assigned']
      : ['pending']
    : order.status === 'cancelled'
      ? ['pending']
      : currentIndex < 0
        ? [] // defensive: unknown status shows the plain steps
        : STEPS.slice(0, currentIndex).map((step) => step.status)

  const rows = STEPS.map((step) => ({
    ...step,
    at: timestamps.get(step.status),
    isCurrent: order.status === step.status,
    isDone: reached.includes(step.status),
  }))

  return (
    <ol className="border-l-2 border-slate-100 pl-6">
      {rows.map((row) => (
        <li key={row.status} className="relative pb-6 last:pb-0">
          <span
            aria-hidden="true"
            className={`absolute -left-[33px] top-0 h-4 w-4 rounded-full ring-2 ring-white ${
              row.isCurrent ? CURRENT_DOT[row.status] : row.isDone ? DONE_DOT[row.status] : 'bg-slate-200'
            }`}
          />
          <p
            className={`text-sm font-medium ${
              row.isCurrent ? 'text-slate-900' : row.isDone ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            {row.label}
            {row.isCurrent && <span className="ml-2 text-xs font-normal text-slate-400">current</span>}
          </p>
          {(row.isDone || row.isCurrent) && row.at && (
            <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(row.at)}</p>
          )}
        </li>
      ))}

      {isTerminal && (
        <li className="relative pt-2">
          <span
            aria-hidden="true"
            className={`absolute -left-[33px] top-2 h-4 w-4 rounded-full ring-2 ring-white ${
              isFailed ? 'bg-red-600' : 'bg-slate-400'
            }`}
          />
          <p className={`text-sm font-semibold ${isFailed ? 'text-red-700' : 'text-slate-600'}`}>
            {isFailed ? 'Delivery failed' : 'Order cancelled'}
          </p>
          {timestamps.get(order.status) && (
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDateTime(timestamps.get(order.status)!)}
            </p>
          )}
        </li>
      )}

      {!isTerminal && (
        <p className="mt-4 text-xs text-slate-400">Placed {formatDateTime(placedAt)}</p>
      )}
    </ol>
  )
}
