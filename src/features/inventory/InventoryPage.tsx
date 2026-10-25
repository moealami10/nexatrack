import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { clampQuantity } from '@/lib/format'
import { useIsMobile } from '@/lib/useIsMobile'
import { db, useCollection } from '@/lib/store'
import type { InventoryItem } from '@/types'

/**
 * Stock badge per row — labels are TRANSLATION KEYS resolved by the
 * component (inside an i18n-reactive render), so a language switch
 * updates them instantly.
 */
function stockStatus(
  item: InventoryItem,
  hasProduct: boolean,
): { tone: BadgeTone; key: string } {
  if (!hasProduct) return { tone: 'amber', key: 'inventory.noProductEntry' }
  if (item.quantity === 0) return { tone: 'red', key: 'inventory.outOfStock' }
  if (item.quantity < item.lowStockThreshold) return { tone: 'red', key: 'inventory.belowThreshold' }
  if (item.quantity === item.lowStockThreshold) return { tone: 'amber', key: 'inventory.atThreshold' }
  return { tone: 'green', key: 'inventory.inStock' }
}

/**
 * Mobile stepper: − [qty] + with 44px buttons and ≥8px gaps; the number
 * input is editable too (inputMode numeric, 16px → no iOS zoom).
 * Desktop keeps the bare number input, unchanged.
 */
function QuantityStepper({
  item,
  unit,
  tone,
  quantityLabel,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  item: InventoryItem
  unit?: string
  tone: BadgeTone
  quantityLabel: string
  decreaseLabel: string
  increaseLabel: string
  onChange: (raw: string) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, item.quantity - 1)))}
        disabled={item.quantity === 0}
        aria-label={decreaseLabel}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        value={item.quantity}
        onChange={(event) => onChange(event.target.value)}
        aria-label={quantityLabel}
        inputMode="numeric"
        autoComplete="off"
        className={`h-11 w-16 rounded-lg border px-2 text-center text-base ${
          tone === 'red' ? 'border-red-300 bg-red-50' : 'border-slate-300'
        }`}
      />
      <button
        type="button"
        onClick={() => onChange(String(item.quantity + 1))}
        aria-label={increaseLabel}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl text-slate-700 transition hover:bg-slate-50"
      >
        +
      </button>
      <span className="shrink-0 text-xs text-slate-400">{unit}</span>
    </div>
  )
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)
  const isMobile = useIsMobile()

  const productBy = (productId: string) =>
    products.find((product) => product.id === productId)

  /** Inline editing: clamp to a whole number, never below zero. */
  function setQuantity(productId: string, raw: string) {
    const quantity = clampQuantity(raw)
    const name = productBy(productId)?.name ?? t('common.unknownProduct')
    db.inventory.update(
      productId,
      { quantity },
      { key: 'actions.updatedStock', params: { name } },
    )
  }

  return (
    <>
      <PageHeader
        title={t('inventory.title')}
        description={t('inventory.description')}
      />

      {products.length === 0 ? (
        <EmptyState
          icon="🗃️"
          message={t('inventory.emptyNoProducts')}
          action={
            <Link
              to="/products"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {t('inventory.goToProducts')}
            </Link>
          }
        />
      ) : inventory.length === 0 ? (
        <EmptyState icon="🗃️" message={t('inventory.emptyNoRows')} />
      ) : isMobile ? (
        /* Phone: stacked cards with a quantity stepper and full-width restock. */
        <div className="flex flex-col gap-3">
          {inventory.map((item) => {
            const product = productBy(item.productId)
            const status = stockStatus(item, Boolean(product))
            const name = product?.name ?? t('common.unknownProduct')
            return (
              <div
                key={item.productId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 font-medium text-slate-900">{name}</h2>
                  <Badge tone={status.tone}>{t(status.key)}</Badge>
                </div>
                <dl className="mt-1 space-y-0.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">{t('inventory.columnThreshold')}</dt>
                    <dd className="text-slate-600">{item.lowStockThreshold}</dd>
                  </div>
                </dl>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('inventory.columnQuantity')}
                  </p>
                  <QuantityStepper
                    item={item}
                    unit={product?.unit}
                    tone={status.tone}
                    quantityLabel={t('inventory.quantityFor', { name })}
                    decreaseLabel={t('inventory.decrease')}
                    increaseLabel={t('inventory.increase')}
                    onChange={(raw) => setQuantity(item.productId, raw)}
                  />
                  <Button
                    className="mt-2.5 w-full"
                    onClick={() =>
                      db.inventory.update(
                        item.productId,
                        { quantity: item.quantity + 50 },
                        { key: 'actions.restocked', params: { name } },
                      )
                    }
                  >
                    {t('inventory.restock')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Table
          columns={[
            t('inventory.columnProduct'),
            t('inventory.columnQuantity'),
            t('inventory.columnThreshold'),
            t('inventory.columnStatus'),
            t('inventory.columnActions'),
          ]}
        >
          {inventory.map((item) => {
            const product = productBy(item.productId)
            const status = stockStatus(item, Boolean(product))
            const name = product?.name ?? t('common.unknownProduct')
            return (
              <tr key={item.productId}>
                <Td className="font-medium">{name}</Td>
                <Td>
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) => setQuantity(item.productId, event.target.value)}
                    aria-label={t('inventory.quantityFor', { name })}
                    className={`w-24 rounded-lg border px-2 py-1.5 text-sm ${
                      status.tone === 'red' ? 'border-red-300 bg-red-50' : 'border-slate-300'
                    }`}
                  />
                  <span className="ml-2 text-xs text-slate-400">{product?.unit}</span>
                </Td>
                <Td className="text-slate-500">{item.lowStockThreshold}</Td>
                <Td>
                  <Badge tone={status.tone}>{t(status.key)}</Badge>
                </Td>
                <Td>
                  <Button
                    onClick={() =>
                      db.inventory.update(
                        item.productId,
                        { quantity: item.quantity + 50 },
                        { key: 'actions.restocked', params: { name } },
                      )
                    }
                  >
                    {t('inventory.restock')}
                  </Button>
                </Td>
              </tr>
            )
          })}
        </Table>
      )}
    </>
  )
}
