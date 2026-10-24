import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { db, newId, runTransaction } from '@/lib/store'
import type { Product } from '@/types'

const UNIT_OPTIONS = ['L', 'kg', 'pc', 'pack'] as const

/** Default low-stock threshold for the auto-created inventory row. */
const DEFAULT_LOW_STOCK_THRESHOLD = 10

function randomSku(): string {
  return `SKU-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

/** Add-or-edit form for a product. `product === null` means "add new". */
export default function ProductFormModal({
  product,
  onClose,
}: {
  product: Product | null
  onClose: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [unit, setUnit] = useState(product?.unit ?? 'pc')
  const [price, setPrice] = useState(product ? String(product.price) : '')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    const cleanSku = sku.trim()
    const cleanPrice = Number.parseFloat(price) || 0

    if (product) {
      db.products.update(
        product.id,
        {
          name: trimmedName,
          sku: cleanSku || product.sku,
          unit,
          price: cleanPrice,
        },
        `Updated product ${trimmedName}`,
      )
    } else {
      const created: Product = {
        id: newId('prd'),
        name: trimmedName,
        sku: cleanSku || randomSku(),
        unit,
        price: cleanPrice,
      }
      // Product + its inventory row are ONE undoable step: a single undo
      // removes both together.
      runTransaction(`Added product ${trimmedName}`, () => {
        db.products.add(created)
        db.inventory.add({
          productId: created.id,
          quantity: 0,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
        })
      })
    }
    onClose()
  }

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Greek Yogurt 500g"
            className={inputClasses}
            autoFocus
          />
        </Field>
        <Field label="SKU (auto-generated if empty)">
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder="SKU-A1B2C"
            className={inputClasses}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (MAD)">
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              placeholder="16.00"
              className={inputClasses}
            />
          </Field>
          <Field label="Unit">
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className={inputClasses}
            >
              {UNIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{product ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
    </Modal>
  )
}
