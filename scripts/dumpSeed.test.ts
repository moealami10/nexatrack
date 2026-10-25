import { writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { seedDrivers, seedInventory, seedOrders, seedProducts } from '@/lib/seed'

/**
 * One-off generator (not part of the suite): dumps the demo dataset to
 * e2e/seed.json so the Playwright screenshot script can seed the app's
 * localStorage before it boots. Run with:
 *   npx vitest run scripts/dumpSeed.test.ts
 */
describe('dump seed data', () => {
  it('writes the demo dataset as JSON', () => {
    writeFileSync(
      new URL('../e2e/seed.json', import.meta.url),
      JSON.stringify({
        products: seedProducts,
        inventory: seedInventory,
        orders: seedOrders,
        drivers: seedDrivers,
        routePlans: [],
      }),
    )
    expect(true).toBe(true)
  })
})
