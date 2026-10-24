import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { assignOrders } from '@/lib/dispatch'
import { db, useCollection } from '@/lib/store'
import { driverStatusLabel } from '@/lib/status'

/** Pick several pending orders and hand them to one driver. */
export default function AssignOrdersModal({ onClose }: { onClose: () => void }) {
  // Subscribes to the language so status badges update instantly on switch.
  useTranslation()
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)

  const pending = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((order) => order.status === 'pending')
  const availableDrivers = drivers.filter((driver) => driver.status === 'available')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [driverId, setDriverId] = useState('')
  const [summary, setSummary] = useState<string | null>(null)

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
        ? (result.error ?? 'Could not assign the orders.')
        : `Assigned ${result.assigned} order${result.assigned === 1 ? '' : 's'} to ${driver.name}.`,
    )
  }

  return (
    <Modal title="Assign orders" onClose={onClose}>
      {summary ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
            ✓
          </span>
          <p className="text-center text-sm text-slate-700">{summary}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              No pending orders — nothing to assign.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Pending orders ({selected.size}/{pending.length} selected)
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
                >
                  {selected.size === pending.length ? 'Clear all' : 'Select all'}
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {pending.map((order) => (
                  <label
                    key={order.id}
                    className="flex cursor-pointer items-start gap-3 border-b border-slate-100 p-3 last:border-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggle(order.id)}
                      className="mt-1 h-4 w-4 accent-slate-900"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-slate-800">
                        {order.customerName}
                      </span>
                      <span className="block text-xs text-slate-500">{order.address}</span>
                      <span className="block font-mono text-xs text-slate-400">{order.id}</span>
                    </span>
                    <span className="text-xs text-slate-400">{order.items.length} item(s)</span>
                  </label>
                ))}
              </div>

              <Field label="Driver">
                <select
                  value={driverId}
                  onChange={(event) => setDriverId(event.target.value)}
                  className={inputClasses}
                >
                  <option value="">— Choose a driver —</option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} ({driverStatusLabel(driver.status)})
                    </option>
                  ))}
                </select>
              </Field>

              {availableDrivers.length === 0 && (
                <p className="text-xs text-red-600">No available drivers right now.</p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleConfirm} disabled={selected.size === 0 || !driverId}>
                  Assign & confirm
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
