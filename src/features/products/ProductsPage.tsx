import { useState } from 'react'

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
    db.products.remove(product.id, `Deleted product ${product.name}`)
    db.inventory.remove(product.id)
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog of everything you deliver."
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or SKU…"
              className={`${inputClasses} w-full sm:w-56`}
            />
            <Button onClick={() => setForm({ mode: 'add' })}>+ Add product</Button>
          </>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon="📦"
          message="No products yet. Add your first one."
          action={<Button onClick={() => setForm({ mode: 'add' })}>+ Add product</Button>}
        />
      ) : visibleProducts.length === 0 ? (
        <EmptyState icon="🔍" message={`No products match "${search}".`} />
      ) : (
        <Table columns={['SKU', 'Name', 'Unit', 'Price', 'Stock', 'Actions']}>
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
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(product)}>
                      Delete
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
