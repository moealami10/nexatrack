import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { db, newId } from '@/lib/store'
import type { Driver } from '@/types'

/** Add-or-edit form for a driver. `driver === null` means "add new". */
export default function DriverFormModal({
  driver,
  onClose,
}: {
  driver: Driver | null
  onClose: () => void
}) {
  const [name, setName] = useState(driver?.name ?? '')
  const [phone, setPhone] = useState(driver?.phone ?? '')
  const [vehicle, setVehicle] = useState(driver?.vehicle ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const trimmedVehicle = vehicle.trim()
    if (!trimmedName) {
      setError('The driver needs a name.')
      return
    }

    if (driver) {
      db.drivers.update(
        driver.id,
        {
          name: trimmedName,
          phone: trimmedPhone,
          vehicle: trimmedVehicle,
        },
        `Updated driver ${trimmedName}`,
      )
    } else {
      db.drivers.add(
        {
          id: newId('drv'),
          name: trimmedName,
          phone: trimmedPhone || '—',
          vehicle: trimmedVehicle || '—',
          status: 'available',
        },
        `Added driver ${trimmedName}`,
      )
    }
    onClose()
  }

  return (
    <Modal title={driver ? 'Edit driver' : 'Add driver'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-300">
            {error}
          </p>
        )}
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Amine Sbai"
            className={inputClasses}
            autoFocus
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+212 6 61 00 00 00"
            className={inputClasses}
          />
        </Field>
        <Field label="Vehicle">
          <input
            value={vehicle}
            onChange={(event) => setVehicle(event.target.value)}
            placeholder="Renault Kangoo — 1234-A-56"
            className={inputClasses}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{driver ? 'Save changes' : 'Add driver'}</Button>
        </div>
      </form>
    </Modal>
  )
}
