import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { translateAction, type ActionLabel } from '@/lib/actionLabel'
import { assignOrders } from '@/lib/dispatch'
import { db, useCollection } from '@/lib/store'
import { driverStatusLabel } from '@/lib/status'

/** Pick several pending orders and hand them to one driver. */
export default function AssignOrdersModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)

  const pending = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((order) => order.status === 'pending')
  const availableDrivers = drivers.filter((driver) => driver.status === 'available')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [driverId, setDriverId] = useState('')
  /** Result notice (success or structured error), resolved at render time. */
  const [summary, setSummary] = useState<ActionLabel | null>(null)

  function toggle(orderId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === pending.length ? new Set() : new Set(pending.map((order) => order.id)),
    )
  }

  function handleConfirm() {
    const driver = drivers.find((candidate) => candidate.id === driverId)
    if (!driver) return
    const result = assignOrders([...selected], driver.id)
    setSummary(
      !result.ok
        ? (result.error ?? { key: 'errors.assignFailed' })
        : { key: 'actions.assignedOrders', params: { count: result.assigned ?? 0, name: driver.name } },
    )
  }

  const summaryContent = summary ? (
    <div className="flex flex-col items-center gap-4 py-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
        ✓
      </span>
      <p className="text-center text-sm text-slate-700">{translateAction(summary)}</p>
      <Button onClick={onClose}>{t('common.done')}</Button>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {pending.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          {t('drivers.assignNoPending')}
        </p>
      ) : (
        <>
          <div className="flex min-h-[44px] items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('drivers.assignSelected', { selected: selected.size, total: pending.length })}
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-slate-500 transition hover:text-slate-900 md:min-h-0"
            >
              {selected.size === pending.length
                ? t('drivers.assignClearAll')
                : t('drivers.assignSelectAll')}
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            {pending.map((order) => (
              <label
                key={order.id}
                className="flex min-h-[52px] cursor-pointer items-start gap-3 border-b border-slate-100 p-3 last:border-0 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(order.id)}
                  onChange={() => toggle(order.id)}
                  className="mt-0.5 h-5 w-5 accent-slate-900 md:h-4 md:w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">
                    {order.customerName}
                  </span>
                  <span className="block text-xs text-slate-500">{order.address}</span>
                  <span className="block font-mono text-xs text-slate-400">{order.id}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {t('orders.itemsCount', { count: order.items.length })}
                </span>
              </label>
            ))}
          </div>

          <Field label={t('orders.columnDriver')}>
            <select
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className={inputClasses}
            >
              <option value="">{t('drivers.chooseDriver')}</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driverStatusLabel(driver.status)})
                </option>
              ))}
            </select>
          </Field>

          {availableDrivers.length === 0 && (
            <p className="text-xs text-red-600">{t('drivers.noAvailableDrivers')}</p>
          )}
        </>
      )}
    </div>
  )

  const footer = summary ? (
    <Button onClick={onClose}>{t('common.done')}</Button>
  ) : pending.length === 0 ? (
    <Button variant="secondary" onClick={onClose}>
      {t('common.cancel')}
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button onClick={handleConfirm} disabled={selected.size === 0 || !driverId}>
        {t('drivers.assignConfirm')}
      </Button>
    </>
  )

  return (
    <Modal title={t('drivers.assignModalTitle')} onClose={onClose} footer={footer}>
      {summaryContent}
    </Modal>
  )
}
