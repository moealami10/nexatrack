import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import SidebarLayout from '@/layouts/SidebarLayout'
import ProductsPage from '@/features/products/ProductsPage'
import InventoryPage from '@/features/inventory/InventoryPage'
import OrdersPage from '@/features/orders/OrdersPage'
import DriversPage from '@/features/drivers/DriversPage'

// Heaviest pages load on demand to keep the initial bundle small.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const RoutesPage = lazy(() => import('@/features/routes/RoutesPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
      Loading…
    </div>
  )
}

const dashboardElement = (
  <Suspense fallback={<PageLoader />}>
    <DashboardPage />
  </Suspense>
)
const routesElement = (
  <Suspense fallback={<PageLoader />}>
    <RoutesPage />
  </Suspense>
)
const settingsElement = (
  <Suspense fallback={<PageLoader />}>
    <SettingsPage />
  </Suspense>
)

export default function App() {
  return (
    <Routes>
      <Route element={<SidebarLayout />} path="/">
        {/* Both "/" and "/dashboard" show the dashboard. */}
        <Route index element={dashboardElement} />
        <Route path="dashboard" element={dashboardElement} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="routes" element={routesElement} />
        <Route path="settings" element={settingsElement} />
      </Route>
      {/* Unknown URLs go home instead of rendering a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
