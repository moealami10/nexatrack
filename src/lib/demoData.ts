import { seedDrivers, seedInventory, seedOrders, seedProducts } from './seed'
import { db, runTransaction } from './store'

/**
 * Optional "Load demo data" action — the ONLY way demo data enters the
 * app, requested explicitly from the sidebar and never run automatically.
 * Fills every collection (route plans cleared) in ONE undoable step, so a
 * single undo returns to whatever the app looked like before.
 */
export function installDemoData(): void {
  runTransaction(
    () => ({
      key: 'actions.demoLoaded',
      params: {
        products: seedProducts.length,
        rows: seedInventory.length,
        orders: seedOrders.length,
        drivers: seedDrivers.length,
      },
    }),
    () => {
      db.products.save(seedProducts)
      db.inventory.save(seedInventory)
      db.orders.save(seedOrders)
      db.drivers.save(seedDrivers)
      db.routePlans.save([])
    },
  )
}
