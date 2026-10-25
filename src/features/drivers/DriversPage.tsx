import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { translateAction, type ActionLabel } from '@/lib/actionLabel'
import { autoAssignPendingOrders, isActiveAssignment } from '@/lib/dispatch'
import {
  DRIVER_STATUS_KEYS,
  driverStatusLabel,
  DRIVER_STATUS_TONE,
} from '@/lib/status'
import { db, useCollection } from '@/lib/store'
import type { Driver, DriverStatus } from '@/types'

import AssignOrdersModal from './AssignOrdersModal'
import DriverFormModal from './DriverFormModal'

type DriverForm = { mode: 'add' } | { mode: 'edit'; driver: Driver } | null

interface Notice {
  tone: 'green' | 'red'
  /** Structured or plain label, resolved at render time. */
  text: ActionLabel
}

/** The status a driver cycles to from the card button. */
function nextStatusOf(status: DriverStatus): DriverStatus {
  return status === 'available' ? 'on_route' : status === 'on_route' ? 'off_duty' : 'available'
}

export default function DriversPage() {
  // Subscribes to the language so driver status badges update instantly on switch.
  const { t } = useTranslation()
  const drivers = useCollection(db.drivers)
  const orders = useCollection(db.orders)

  const [modalOpen, setModalOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [driverForm, setDriverForm] = useState<DriverForm>(null)

  const activeOrdersFor = (driverId: string) =>
    orders.filter((order) => order.driverId === driverId && isActiveAssignment(order)).length
  const pendingCount = orders.filter((order) => order.status === 'pending').length
  const availableCount = drivers.filter((driver) => driver.status === 'available').length

  function handleAutoAssign() {
    const result = autoAssignPendingOrders()
    setNotice(
      result.ok
        ? {
            tone: 'green',
            text: {
              key: 'actions.autoAssigned',
              params: {
                orders: { key: 'words.orderCount', count: result.assigned ?? 0 },
                drivers: { key: 'words.driverCount', count: result.driversUsed ?? 0 },
              },
            },
          }
        : { tone: 'red', text: result.error ?? (t('errors.autoAssignFailed') as string) },
    )
  }

  return (
    <>
      <PageHeader
        title={t('drivers.title')}
        description={t('drivers.description')}
        actions={
          <>
            <Button variant="secondary" onClick={handleAutoAssign} disabled={pendingCount === 0}>
              {t('drivers.autoAssign')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(true)}
              disabled={availableCount === 0}
              title={availableCount === 0 ? t('drivers.noAvailableDriversHint') : undefined}
            >
              {t('drivers.assignOrders')}
            </Button>
            <Button onClick={() => setDriverForm({ mode: 'add' })}>{t('drivers.addDriver')}</Button>
          </>
        }
      />

      {notice && (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
            notice.tone === 'green'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
              : 'bg-red-50 text-red-700 ring-red-600/20'
          }`}
        >
          {translateAction(notice.text)}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('drivers.dismiss')}
            className="-mr-1 -my-2 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600 md:h-6 md:w-6"
          >
            ✕
          </button>
        </div>
      )}

      <p className="mb-3 text-xs text-slate-400">
        {t('words.pendingOrders', { count: pendingCount })} ·{' '}
        {t('words.driverCountAvailable', { count: availableCount })}
      </p>

      {drivers.length === 0 ? (
        <EmptyState
          icon="🛵"
          message={t('drivers.emptyMessage')}
          action={
            <Button onClick={() => setDriverForm({ mode: 'add' })}>{t('drivers.addDriver')}</Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drivers.map((driver) => {
            const activeOrders = activeOrdersFor(driver.id)
            const next = nextStatusOf(driver.status)
            return (
              <div key={driver.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">{driver.name}</h2>
                  <Badge tone={DRIVER_STATUS_TONE[driver.status]}>
                    {driverStatusLabel(driver.status)}
                  </Badge>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">{t('drivers.phoneLabel')}</dt>
                    <dd>{driver.phone}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">{t('drivers.vehicleLabel')}</dt>
                    <dd className="text-right">{driver.vehicle}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">{t('drivers.assignedOrdersLabel')}</dt>
                    <dd>
                      <span
                        className={`font-semibold ${activeOrders > 0 ? 'text-slate-900' : 'text-slate-400'}`}
                      >
                        {activeOrders}
                      </span>{' '}
                      <span className="text-xs text-slate-400">{t('drivers.assignmentNote')}</span>
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      db.drivers.update(
                        driver.id,
                        { status: next },
                        // Structured label with a nested status word: the
                        // history entry renders it in the viewing language.
                        {
                          key: 'actions.setDriverStatus',
                          params: { name: driver.name, status: { key: DRIVER_STATUS_KEYS[next] } },
                        },
                      )
                    }}
                  >
                    {t('drivers.setStatus', { status: driverStatusLabel(next) })}
                  </Button>
                  <Button variant="secondary" onClick={() => setDriverForm({ mode: 'edit', driver })}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      db.drivers.remove(driver.id, {
                        key: 'actions.deletedDriver',
                        params: { name: driver.name },
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && <AssignOrdersModal onClose={() => setModalOpen(false)} />}
      {driverForm && (
        <DriverFormModal
          driver={driverForm.mode === 'edit' ? driverForm.driver : null}
          onClose={() => setDriverForm(null)}
        />
      )}
    </>
  )
}
