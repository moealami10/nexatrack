import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionSheet } from '@/components/ui/ActionSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/format'
import { useIsMobile } from '@/lib/useIsMobile'
import { db, useCollection } from '@/lib/store'
import type { Product } from '@/types'

import ProductFormModal from './ProductFormModal'

type FormState = { mode: 'add' } | { mode: 'edit'; product: Product } | null

const CARD_DETAIL = 'flex justify-between gap-2 text-sm'

export default function ProductsPage() {
  const { t } = useTranslation()
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)
  const isMobile = useIsMobile()

  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState>(null)
  /** Card whose "⋯" overflow sheet is open (mobile only). */
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null)

  const stockFor = (productId: string) =>
    inventory.find((item) => item.productId === productId)

  const query = search.trim().toLowerCase()
  const visibleProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query),
  )

  function handleDelete(product: Product) {
    db.products.remove(product.id, {
      key: 'actions.deletedProduct',
      params: { name: product.name },
    })
    db.inventory.remove(product.id)
  }

  return (
    <>
      <PageHeader
        title={t('products.title')}
        description={t('products.description')}
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('products.searchPlaceholder')}
              className={`${inputClasses} w-full sm:w-56`}
            />
            <Button onClick={() => setForm({ mode: 'add' })}>{t('products.addProduct')}</Button>
          </>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon="📦"
          message={t('products.emptyMessage')}
          action={
            <Button onClick={() => setForm({ mode: 'add' })}>{t('products.addProduct')}</Button>
          }
        />
      ) : visibleProducts.length === 0 ? (
        <EmptyState icon="🔍" message={t('products.noMatch', { query: search.trim() })} />
      ) : isMobile ? (
        /* Phone: stacked cards with an overflow "⋯" action sheet. */
        <div className="flex flex-col gap-3">
          {visibleProducts.map((product) => {
            const stock = stockFor(product.id)
            return (
              <div
                key={product.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium text-slate-900">{product.name}</h2>
                    <p className="font-mono text-xs text-slate-500">{product.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheetProduct(product)}
                    aria-label={t('common.actionsMenu')}
                    className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-slate-100"
                  >
                    ⋯
                  </button>
                </div>
                <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  <div className={CARD_DETAIL}>
                    <dt className="text-slate-400">{t('products.columnPrice')}</dt>
                    <dd className="text-slate-700">{formatCurrency(product.price)}</dd>
                  </div>
                  <div className={CARD_DETAIL}>
                    <dt className="text-slate-400">{t('products.columnUnit')}</dt>
                    <dd className="text-slate-700">{product.unit}</dd>
                  </div>
                  <div className={CARD_DETAIL}>
                    <dt className="text-slate-400">{t('products.columnStock')}</dt>
                    <dd className="text-slate-700">{stock ? stock.quantity : '—'}</dd>
                  </div>
                </dl>
              </div>
            )
          })}
        </div>
      ) : (
        <Table
          columns={[
            t('products.columnSku'),
            t('products.columnName'),
            t('products.columnUnit'),
            t('products.columnPrice'),
            t('products.columnStock'),
            t('products.columnActions'),
          ]}
        >
          {visibleProducts.map((product) => {
            const stock = stockFor(product.id)
            return (
              <tr key={product.id}>
                <Td className="font-mono text-xs text-slate-500">{product.sku}</Td>
                <Td className="font-medium">{product.name}</Td>
                <Td className="text-slate-500">{product.unit}</Td>
                <Td>{formatCurrency(product.price)}</Td>
                <Td className="text-slate-500">{stock ? stock.quantity : '—'}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setForm({ mode: 'edit', product })}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(product)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </Td>
              </tr>
            )
          })}
        </Table>
      )}

      {sheetProduct && (
        <ActionSheet
          title={sheetProduct.name}
          onClose={() => setSheetProduct(null)}
          actions={[
            {
              label: t('common.edit'),
              onSelect: () => setForm({ mode: 'edit', product: sheetProduct }),
            },
            {
              label: t('common.delete'),
              danger: true,
              onSelect: () => handleDelete(sheetProduct),
            },
          ]}
        />
      )}

      {form && (
        <ProductFormModal
          product={form.mode === 'edit' ? form.product : null}
          onClose={() => setForm(null)}
        />
      )}
    </>
  )
}
