import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
        { key: 'actions.updatedProduct', params: { name: trimmedName } },
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
      runTransaction(
        { key: 'actions.addedProduct', params: { name: trimmedName } },
        () => {
          db.products.add(created)
          db.inventory.add({
            productId: created.id,
            quantity: 0,
            lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
          })
        },
      )
    }
    onClose()
  }

  return (
    <Modal
      title={product ? t('products.formTitleEdit') : t('products.formTitleAdd')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="product-form">
            {product ? t('common.saveChanges') : t('products.addProduct')}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={t('products.fieldName')}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('products.placeholderName')}
            className={inputClasses}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field label={t('products.fieldSku')}>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder={t('products.placeholderSku')}
            className={inputClasses}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('products.fieldPrice')}>
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('products.placeholderPrice')}
              className={inputClasses}
            />
          </Field>
          <Field label={t('products.fieldUnit')}>
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
      </form>
    </Modal>
  )
}
