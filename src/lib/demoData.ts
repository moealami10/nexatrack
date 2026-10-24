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
    () =>
      `Loaded demo data — ${seedProducts.length} products, ${seedInventory.length} stock rows, ${seedOrders.length} orders, ${seedDrivers.length} drivers`,
    () => {
      db.products.save(seedProducts)
      db.inventory.save(seedInventory)
      db.orders.save(seedOrders)
      db.drivers.save(seedDrivers)
      db.routePlans.save([])
    },
  )
}
