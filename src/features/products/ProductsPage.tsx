import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/format'
import { db, useCollection } from '@/lib/store'
import type { Product } from '@/types'

import ProductFormModal from './ProductFormModal'

type FormState = { mode: 'add' } | { mode: 'edit'; product: Product } | null

export default function ProductsPage() {
  const { t } = useTranslation()
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)

  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState>(null)

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

      {form && (
        <ProductFormModal
          product={form.mode === 'edit' ? form.product : null}
          onClose={() => setForm(null)}
        />
      )}
    </>
  )
}
