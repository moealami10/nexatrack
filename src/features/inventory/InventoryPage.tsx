import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
import { db, useCollection } from '@/lib/store'
import type { InventoryItem } from '@/types'

function stockStatus(
  item: InventoryItem,
  hasProduct: boolean,
): { tone: BadgeTone; label: string } {
  if (!hasProduct) return { tone: 'amber', label: 'No product entry' }
  if (item.quantity === 0) return { tone: 'red', label: 'Out of stock' }
  if (item.quantity < item.lowStockThreshold) return { tone: 'red', label: 'Below threshold' }
  if (item.quantity === item.lowStockThreshold) return { tone: 'amber', label: 'At threshold' }
  return { tone: 'green', label: 'In stock' }
}

export default function InventoryPage() {
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)

  const productBy = (productId: string) =>
    products.find((product) => product.id === productId)

  /** Inline editing: clamp to a whole number, never below zero. */
  function setQuantity(productId: string, raw: string) {
    const quantity = Math.max(0, Math.floor(Number(raw) || 0))
    const name = productBy(productId)?.name ?? 'item'
    db.inventory.update(productId, { quantity }, `Updated stock for ${name}`)
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels per warehouse item. Click a quantity to edit it."
      />

      {products.length === 0 ? (
        <EmptyState
          icon="🗃️"
          message="Add a product first — stock rows appear when you create products."
          action={
            <Link
              to="/products"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Go to Products →
            </Link>
          }
        />
      ) : inventory.length === 0 ? (
        <EmptyState icon="🗃️" message="No inventory rows. Adding products creates stock entries automatically." />
      ) : (
        <Table columns={['Product', 'Quantity', 'Low-stock threshold', 'Status', 'Actions']}>
          {inventory.map((item) => {
            const product = productBy(item.productId)
            const status = stockStatus(item, Boolean(product))
            return (
              <tr key={item.productId}>
                <Td className="font-medium">{product?.name ?? 'Unknown product'}</Td>
                <Td>
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) => setQuantity(item.productId, event.target.value)}
                    aria-label={`Quantity for ${product?.name ?? 'item'}`}
                    className={`w-24 rounded-lg border px-2 py-1.5 text-sm ${
                      status.tone === 'red' ? 'border-red-300 bg-red-50' : 'border-slate-300'
                    }`}
                  />
                  <span className="ml-2 text-xs text-slate-400">{product?.unit}</span>
                </Td>
                <Td className="text-slate-500">{item.lowStockThreshold}</Td>
                <Td>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Td>
                <Td>
                  <Button
                    onClick={() =>
                      db.inventory.update(
                        item.productId,
                        { quantity: item.quantity + 50 },
                        `Restocked ${product?.name ?? 'item'} +50`,
                      )
                    }
                  >
                    Restock +50
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
