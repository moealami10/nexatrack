import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, Td } from '@/components/ui/Table'
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

export default function InventoryPage() {
  const { t } = useTranslation()
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)

  const productBy = (productId: string) =>
    products.find((product) => product.id === productId)

  /** Inline editing: clamp to a whole number, never below zero. */
  function setQuantity(productId: string, raw: string) {
    const quantity = Math.max(0, Math.floor(Number(raw) || 0))
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
