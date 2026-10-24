import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, Redo2, Undo2, type LucideIcon } from 'lucide-react'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { ToastStack } from '@/components/ui/Toast'
import { installDemoData } from '@/lib/demoData'
import { clearAllData, db, history, useCollection, useHistory } from '@/lib/store'

type NavItem = { to: string; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/products', label: 'Products', icon: '📦' },
  { to: '/inventory', label: 'Inventory', icon: '🗃️' },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/drivers', label: 'Drivers', icon: '🛵' },
  { to: '/routes', label: 'Routes', icon: '🗺️' },
]

/** Breadcrumb label for the active route (both "/" and "/dashboard"). */
function currentPageLabel(pathname: string): string {
  const item = NAV_ITEMS.find((entry) => entry.to === pathname)
  return item?.label ?? 'Dashboard'
}

function Brand() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-800 px-6">
      <span className="text-xl">🚚</span>
      <span className="text-lg font-semibold tracking-tight text-white">NexaTrack</span>
    </div>
  )
}

function SidebarNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`
          }
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Confirmation modal for "Clear all data" — requires typing DELETE. */
function ClearDataModal({ onClose }: { onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('')
  const armed = confirmation.trim() === 'DELETE'
  return (
    <Modal title="Clear all data?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        This permanently deletes all products, inventory, orders, drivers, and
        route plans, and clears the undo history.
      </p>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
        This action is NOT undoable.
      </p>
      <Field label="Type DELETE to confirm">
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="DELETE"
          className={inputClasses}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!armed}
          onClick={() => {
            clearAllData()
            onClose()
          }}
        >
          Delete everything
        </Button>
      </div>
    </Modal>
  )
}

/** Confirmation modal shown when demo data would replace existing data. */
function LoadDemoConfirmModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Load demo data?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Loading the demo dataset replaces everything currently in the app.
        The load is a single undoable step, so you can revert it afterwards.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            installDemoData()
            onClose()
          }}
        >
          Replace and load demo data
        </Button>
      </div>
    </Modal>
  )
}

function SidebarFooter() {
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const routePlans = useCollection(db.routePlans)

  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmLoad, setConfirmLoad] = useState(false)

  const appEmpty =
    products.length === 0 &&
    inventory.length === 0 &&
    orders.length === 0 &&
    drivers.length === 0 &&
    routePlans.length === 0

  function handleLoadDemo() {
    if (appEmpty) installDemoData()
    else setConfirmLoad(true)
  }

  return (
    <>
      <div className="space-y-0.5 shrink-0 border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={handleLoadDemo}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/50 hover:text-white"
        >
          📥 Load demo data
        </button>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-red-900/40 hover:text-red-300"
        >
          🗑️ Clear all data
        </button>
      </div>
      {confirmClear && <ClearDataModal onClose={() => setConfirmClear(false)} />}
      {confirmLoad && <LoadDemoConfirmModal onClose={() => setConfirmLoad(false)} />}
    </>
  )
}

/** 36px grouped history button with a hover tooltip naming the action. */
function HistoryButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tip,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled: boolean
  tip: string
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={tip}
        className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white sm:px-3"
      >
        <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      <span
        role="tooltip"
        className="animate-tooltip-pop pointer-events-none absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block"
      >
        {tip}
      </span>
    </span>
  )
}

function HistoryControls() {
  const { canUndo, canRedo, lastAction, redoAction, undo, redo } = useHistory()
  return (
    <div className="flex items-center gap-2">
      <HistoryButton
        icon={Undo2}
        label="Undo"
        onClick={undo}
        disabled={!canUndo}
        tip={
          canUndo && lastAction
            ? `Undo: ${lastAction} (Ctrl+Z)`
            : 'Nothing to undo (Ctrl+Z)'
        }
      />
      <HistoryButton
        icon={Redo2}
        label="Redo"
        onClick={redo}
        disabled={!canRedo}
        tip={
          canRedo && redoAction
            ? `Redo: ${redoAction} (Ctrl+Shift+Z)`
            : 'Nothing to redo (Ctrl+Shift+Z)'
        }
      />
    </div>
  )
}

/**
 * App shell: full-height fixed sidebar (with the brand at the very top)
 * from `md` up; the sticky white top bar lives inside the main column,
 * never over the sidebar. On small screens the top bar hosts the drawer
 * trigger; below 640px the history buttons collapse to icons only.
 */
export default function SidebarLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const pageLabel = currentPageLabel(pathname)

  // Global keyboard shortcuts; skipped inside text fields so normal text
  // undo keeps working.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        history.undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        history.redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Full-height sidebar (desktop): brand at the very top */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-slate-900 md:flex">
        <Brand />
        <SidebarNav onNavigate={() => undefined} />
        <SidebarFooter />
      </aside>

      {/* Main column: sticky top bar + content — the only scroll area */}
      <div className="flex min-h-screen flex-col md:ml-64">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:hidden"
            >
              <Menu size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <span className="truncate text-sm font-medium text-slate-500">{pageLabel}</span>
          </div>
          <div className="flex shrink-0 items-center">
            <HistoryControls />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Off-canvas nav (mobile) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuOpen(false)} role="presentation">
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside
            className="animate-drawer-left absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4">
              <span className="font-semibold tracking-tight text-white">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}

      <ToastStack />
    </div>
  )
}
