import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { autoAssignPendingOrders, isActiveAssignment } from '@/lib/dispatch'
import { driverStatusLabel, DRIVER_STATUS_LABEL_EN, DRIVER_STATUS_TONE } from '@/lib/status'
import { db, useCollection } from '@/lib/store'
import type { Driver } from '@/types'

import AssignOrdersModal from './AssignOrdersModal'
import DriverFormModal from './DriverFormModal'

type DriverForm = { mode: 'add' } | { mode: 'edit'; driver: Driver } | null

interface Notice {
  tone: 'green' | 'red'
  text: string
}

export default function DriversPage() {
  // Subscribes to the language so driver status badges update instantly on switch.
  useTranslation()
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
            text: `Auto-assigned ${result.assigned} pending order${result.assigned === 1 ? '' : 's'} across ${result.driversUsed} driver${result.driversUsed === 1 ? '' : 's'} by proximity.`,
          }
        : { tone: 'red', text: result.error ?? 'Auto-assign failed.' },
    )
  }

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Your delivery crew, their vehicles, and current workload."
        actions={
          <>
            <Button variant="secondary" onClick={handleAutoAssign} disabled={pendingCount === 0}>
              ✨ Auto-assign by proximity
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(true)}
              disabled={availableCount === 0}
              title={availableCount === 0 ? 'No available drivers — add one first' : undefined}
            >
              Assign orders
            </Button>
            <Button onClick={() => setDriverForm({ mode: 'add' })}>+ Add driver</Button>
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
          {notice.text}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="ml-4 text-slate-400 transition hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      <p className="mb-3 text-xs text-slate-400">
        {pendingCount} pending order{pendingCount === 1 ? '' : 's'} · {availableCount} driver
        {availableCount === 1 ? '' : 's'} available
      </p>

      {drivers.length === 0 ? (
        <EmptyState
          icon="🛵"
          message="No drivers on the roster yet."
          action={<Button onClick={() => setDriverForm({ mode: 'add' })}>+ Add driver</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drivers.map((driver) => {
            const activeOrders = activeOrdersFor(driver.id)
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
                    <dt className="text-slate-400">Phone</dt>
                    <dd>{driver.phone}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Vehicle</dt>
                    <dd className="text-right">{driver.vehicle}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Assigned orders</dt>
                    <dd>
                      <span
                        className={`font-semibold ${activeOrders > 0 ? 'text-slate-900' : 'text-slate-400'}`}
                      >
                        {activeOrders}
                      </span>{' '}
                      <span className="text-xs text-slate-400">(assigned or in transit)</span>
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next =
                        driver.status === 'available'
                          ? 'on_route'
                          : driver.status === 'on_route'
                            ? 'off_duty'
                            : 'available'
                      db.drivers.update(
                        driver.id,
                        { status: next },
                        `Set ${driver.name} to ${DRIVER_STATUS_LABEL_EN[next]}`,
                      )
                    }}
                  >
                    Set {DRIVER_STATUS_LABEL_EN[driver.status === 'available' ? 'on_route' : driver.status === 'on_route' ? 'off_duty' : 'available'].toLowerCase()}
                  </Button>
                  <Button variant="secondary" onClick={() => setDriverForm({ mode: 'edit', driver })}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      db.drivers.remove(driver.id, `Deleted driver ${driver.name}`)
                    }
                  >
                    Delete
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
