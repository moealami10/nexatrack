import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
      setError(t('errors.driverNameRequired'))
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
        { key: 'actions.updatedDriver', params: { name: trimmedName } },
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
        { key: 'actions.addedDriver', params: { name: trimmedName } },
      )
    }
    onClose()
  }

  return (
    <Modal title={driver ? t('drivers.formTitleEdit') : t('drivers.formTitleAdd')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-300">
            {error}
          </p>
        )}
        <Field label={t('drivers.fieldName')}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('drivers.placeholderName')}
            className={inputClasses}
            autoFocus
          />
        </Field>
        <Field label={t('drivers.fieldPhone')}>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('drivers.placeholderPhone')}
            className={inputClasses}
          />
        </Field>
        <Field label={t('drivers.fieldVehicle')}>
          <input
            value={vehicle}
            onChange={(event) => setVehicle(event.target.value)}
            placeholder={t('drivers.placeholderVehicle')}
            className={inputClasses}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">
            {driver ? t('common.saveChanges') : t('drivers.addDriver')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
