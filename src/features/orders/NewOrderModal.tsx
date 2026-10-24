import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
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
  const [error, setError] = useState<string | null>(null)

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
      setError('Customer name, address, and at least one item are required.')
      return
    }

    // Delivery window: optional, but complete and sensible when given.
    if ((windowStart && !windowEnd) || (!windowStart && windowEnd)) {
      setError('The delivery window needs both a start and an end time.')
      return
    }
    if (windowStart && windowEnd) {
      const start = parseHhmm(windowStart)
      const end = parseHhmm(windowEnd)
      if (start === null || end === null || start >= end) {
        setError('The delivery window must end after it starts.')
        return
      }
    }

    // Service time: optional override of the 5-minute default.
    const service =
      serviceMinutes.trim() === '' ? undefined : Math.floor(Number(serviceMinutes) || 0)
    if (service !== undefined && (service < 0 || service > 240)) {
      setError('Service time must be between 0 and 240 minutes.')
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
      setError(result.error ?? 'The order could not be created.')
    }
  }

  return (
    <Modal title="New order" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer name">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Anas Haddadi"
              className={inputClasses}
              autoFocus
            />
          </Field>
          <Field label="Address">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="31 Rue Al Andalous, Oasis"
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude">
            <input value={lat} onChange={(event) => setLat(event.target.value)} className={inputClasses} />
          </Field>
          <Field label="Longitude">
            <input value={lng} onChange={(event) => setLng(event.target.value)} className={inputClasses} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Window start (optional)">
            <input
              type="time"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Window end (optional)">
            <input
              type="time"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Service min.">
            <input
              value={serviceMinutes}
              onChange={(event) => setServiceMinutes(event.target.value)}
              inputMode="numeric"
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Items</p>
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={row.productId}
                  onChange={(event) => setRow(index, { productId: event.target.value })}
                  className={inputClasses}
                  aria-label="Product"
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
                  aria-label="Quantity"
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label="Remove item"
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
            + Add another item
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={products.length === 0}>
            Create order
          </Button>
        </div>
      </form>
    </Modal>
  )
}
