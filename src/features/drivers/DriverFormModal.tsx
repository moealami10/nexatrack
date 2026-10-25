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
    <Modal
      title={driver ? t('drivers.formTitleEdit') : t('drivers.formTitleAdd')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="driver-form">
            {driver ? t('common.saveChanges') : t('drivers.addDriver')}
          </Button>
        </>
      }
    >
      <form id="driver-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field label={t('drivers.fieldPhone')}>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('drivers.placeholderPhone')}
            className={inputClasses}
            autoComplete="off"
          />
        </Field>
        <Field label={t('drivers.fieldVehicle')}>
          <input
            value={vehicle}
            onChange={(event) => setVehicle(event.target.value)}
            placeholder={t('drivers.placeholderVehicle')}
            className={inputClasses}
            autoComplete="off"
          />
        </Field>
      </form>
    </Modal>
  )
}
