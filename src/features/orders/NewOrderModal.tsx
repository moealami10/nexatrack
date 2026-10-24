import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import type { ActionLabel } from '@/lib/actionLabel'
import { translateAction } from '@/lib/actionLabel'
import { tryCreateOrder } from '@/lib/orders'
import { DEFAULT_SERVICE_MINUTES, parseHhmm } from '@/lib/routing'
import { db, newId, useCollection } from '@/lib/store'
import type { Product } from '@/types'

/** Casablanca city center as the default drop-off point. */
const DEFAULT_LAT = '33.5731'
const DEFAULT_LNG = '-7.5898'

interface Row {
  productId: string
  qty: string
}

export default function NewOrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const products = useCollection(db.products)

  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const [rows, setRows] = useState<Row[]>([
    { productId: products[0]?.id ?? '', qty: '1' },
  ])
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [serviceMinutes, setServiceMinutes] = useState('5')
  const [error, setError] = useState<ActionLabel | null>(null)

  function setRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setRows((current) => [...current, { productId: products[0]?.id ?? '', qty: '1' }])
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const items = rows.flatMap((row) => {
      const qty = Math.floor(Number(row.qty) || 0)
      return qty > 0 && row.productId ? [{ productId: row.productId, qty }] : []
    })
    const name = customerName.trim()
    const destination = address.trim()

    if (!name || !destination || items.length === 0) {
      setError({ key: 'errors.orderFieldsRequired' })
      return
    }

    // Delivery window: optional, but complete and sensible when given.
    if ((windowStart && !windowEnd) || (!windowStart && windowEnd)) {
      setError({ key: 'errors.windowIncomplete' })
      return
    }
    if (windowStart && windowEnd) {
      const start = parseHhmm(windowStart)
      const end = parseHhmm(windowEnd)
      if (start === null || end === null || start >= end) {
        setError({ key: 'errors.windowInvalid' })
        return
      }
    }

    // Service time: optional override of the 5-minute default.
    const service =
      serviceMinutes.trim() === '' ? undefined : Math.floor(Number(serviceMinutes) || 0)
    if (service !== undefined && (service < 0 || service > 240)) {
      setError({ key: 'errors.serviceRange' })
      return
    }

    const result = tryCreateOrder({
      id: newId('ord'),
      customerName: name,
      address: destination,
      lat: Number.parseFloat(lat) || 0,
      lng: Number.parseFloat(lng) || 0,
      items,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deliveryWindowStart: windowStart || undefined,
      deliveryWindowEnd: windowEnd || undefined,
      serviceMinutes: service ?? DEFAULT_SERVICE_MINUTES,
    })

    if (result.ok) {
      onClose()
    } else {
      setError(result.error ?? { key: 'errors.cannotCreateOrder' })
    }
  }

  return (
    <Modal title={t('orders.formTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-300">
            {translateAction(error)}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('orders.fieldName')}>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={t('orders.fieldNamePlaceholder')}
              className={inputClasses}
              autoFocus
            />
          </Field>
          <Field label={t('orders.fieldAddress')}>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t('orders.fieldAddressPlaceholder')}
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('orders.fieldLat')}>
            <input value={lat} onChange={(event) => setLat(event.target.value)} className={inputClasses} />
          </Field>
          <Field label={t('orders.fieldLng')}>
            <input value={lng} onChange={(event) => setLng(event.target.value)} className={inputClasses} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label={t('orders.fieldWindowStart')}>
            <input
              type="time"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label={t('orders.fieldWindowEnd')}>
            <input
              type="time"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label={t('orders.fieldService')}>
            <input
              value={serviceMinutes}
              onChange={(event) => setServiceMinutes(event.target.value)}
              inputMode="numeric"
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('orders.itemsTitle')}
          </p>
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={row.productId}
                  onChange={(event) => setRow(index, { productId: event.target.value })}
                  className={inputClasses}
                  aria-label={t('orders.productAria')}
                >
                  {products.map((product: Product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.qty}
                  onChange={(event) => setRow(index, { qty: event.target.value })}
                  inputMode="numeric"
                  aria-label={t('orders.quantityAria')}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={t('orders.removeItemAria')}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  disabled={rows.length === 1}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-3 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            {t('orders.addAnotherItem')}
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={products.length === 0}>
            {t('orders.createOrder')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
