import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Redo2, Undo2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitch } from '@/components/ui/LanguageSwitch'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { ToastStack } from '@/components/ui/Toast'
import { translateAction } from '@/lib/actionLabel'
import { installDemoData } from '@/lib/demoData'
import { clearAllData, db, history, useCollection, useHistory } from '@/lib/store'
import { useOverlayLock } from '@/lib/useOverlayLock'

type NavItem = { to: string; navKey: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', navKey: 'dashboard', icon: '📊' },
  { to: '/products', navKey: 'products', icon: '📦' },
  { to: '/inventory', navKey: 'inventory', icon: '🗃️' },
  { to: '/orders', navKey: 'orders', icon: '🧾' },
  { to: '/drivers', navKey: 'drivers', icon: '🛵' },
  { to: '/routes', navKey: 'routes', icon: '🗺️' },
  { to: '/settings', navKey: 'settings', icon: '⚙️' },
]

/** Top-level tabs shown in the phone bottom bar; the rest live in "More". */
const TAB_ITEMS: NavItem[] = [
  { to: '/dashboard', navKey: 'dashboard', icon: '📊' },
  { to: '/orders', navKey: 'orders', icon: '🧾' },
  { to: '/drivers', navKey: 'drivers', icon: '🛵' },
  { to: '/routes', navKey: 'routes', icon: '🗺️' },
]

const MORE_ITEMS: NavItem[] = [
  { to: '/products', navKey: 'products', icon: '📦' },
  { to: '/inventory', navKey: 'inventory', icon: '🗃️' },
  { to: '/settings', navKey: 'settings', icon: '⚙️' },
]

function navLabel(item: NavItem): string {
  return `nav.${item.navKey}`
}

/** Breadcrumb label for the active route (both "/" and "/dashboard"). */
function currentPageLabel(pathname: string): string {
  const item = NAV_ITEMS.find((entry) => entry.to === pathname)
  return item ? navLabel(item) : 'nav.dashboard'
}

/** Whether the app has no data at all (decides if "Load demo" confirms first). */
function useAppEmpty(): boolean {
  const products = useCollection(db.products)
  const inventory = useCollection(db.inventory)
  const orders = useCollection(db.orders)
  const drivers = useCollection(db.drivers)
  const routePlans = useCollection(db.routePlans)
  return (
    products.length === 0 &&
    inventory.length === 0 &&
    orders.length === 0 &&
    drivers.length === 0 &&
    routePlans.length === 0
  )
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
  const { t } = useTranslation()
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
          {t(navLabel(item))}
        </NavLink>
      ))}
    </nav>
  )
}

/** Confirmation modal for "Clear all data" — requires typing DELETE. */
function ClearDataModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [confirmation, setConfirmation] = useState('')
  const armed = confirmation.trim() === 'DELETE'
  return (
    <Modal
      title={t('common.clearTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!armed}
            onClick={() => {
              clearAllData()
              onClose()
            }}
          >
            {t('common.clearButton')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t('common.clearBody')}</p>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
        {t('common.clearWarning')}
      </p>
      <Field label={t('common.clearFieldLabel')}>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={t('common.clearPlaceholder')}
          className={inputClasses}
          autoComplete="off"
          autoFocus
        />
      </Field>
    </Modal>
  )
}

/** Confirmation modal shown when demo data would replace existing data. */
function LoadDemoConfirmModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal
      title={t('common.demoTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              installDemoData()
              onClose()
            }}
          >
            {t('common.demoButton')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t('common.demoBody')}</p>
    </Modal>
  )
}

function SidebarFooter({ onLoadDemo, onClear }: { onLoadDemo: () => void; onClear: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-0.5 shrink-0 border-t border-slate-800 p-3">
      <button
        type="button"
        onClick={onLoadDemo}
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/50 hover:text-white"
      >
        📥 {t('common.loadDemoData')}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-red-900/40 hover:text-red-300"
      >
        🗑️ {t('common.clearAllData')}
      </button>
    </div>
  )
}

/**
 * Phone "More" sheet: overflow destinations (Products, Inventory), the
 * language switch, and the data buttons, as large 44px+ tap rows.
 */
function MoreSheet({
  onClose,
  onLoadDemo,
  onClear,
}: {
  onClose: () => void
  onLoadDemo: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  useOverlayLock(onClose)
  return (
    <div className="fixed inset-0 z-modal md:hidden" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className="animate-sheet-in safe-area-bottom absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.more')}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="text-lg font-semibold text-slate-900">{t('nav.more')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {MORE_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-[52px] items-center gap-3 rounded-xl px-4 text-base font-medium transition ${
                  isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {t(navLabel(item))}
            </NavLink>
          ))}
          <div className="flex min-h-[52px] items-center justify-between rounded-xl px-4">
            <span className="text-base font-medium text-slate-700">{t('common.language')}</span>
            <LanguageSwitch />
          </div>
        </nav>
        <div className="shrink-0 space-y-2 border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => {
              onClose()
              onLoadDemo()
            }}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50"
          >
            📥 {t('common.loadDemoData')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              onClear()
            }}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-white text-sm font-medium text-red-600 ring-1 ring-inset ring-red-300 transition hover:bg-red-50"
          >
            🗑️ {t('common.clearAllData')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 44px-tall grouped history button with a hover tooltip naming the action. */
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
        className="flex h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white md:h-9 sm:px-3"
      >
        <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      <span
        role="tooltip"
        className="animate-tooltip-pop pointer-events-none absolute right-0 top-full z-tooltip mt-2 hidden whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block"
      >
        {tip}
      </span>
    </span>
  )
}

function HistoryControls() {
  const { t } = useTranslation()
  const { canUndo, canRedo, lastAction, redoAction, undo, redo } = useHistory()
  return (
    <div className="flex items-center gap-2">
      <HistoryButton
        icon={Undo2}
        label={t('undo.undo')}
        onClick={undo}
        disabled={!canUndo}
        tip={
          canUndo && lastAction
            ? t('undo.tooltipUndo', { action: translateAction(lastAction) })
            : t('undo.nothingToUndo')
        }
      />
      <HistoryButton
        icon={Redo2}
        label={t('undo.redo')}
        onClick={redo}
        disabled={!canRedo}
        tip={
          canRedo && redoAction
            ? t('undo.tooltipRedo', { action: translateAction(redoAction) })
            : t('undo.nothingToRedo')
        }
      />
    </div>
  )
}

/**
 * App shell. Desktop (≥768px): full-height fixed sidebar with brand at the
 * very top and the sticky white top bar inside the main column — unchanged.
 * Phone (<768px): top bar with title + history + language, a fixed bottom
 * tab bar, and a "More" sheet for the remaining pages and data tools.
 */
export default function SidebarLayout() {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmLoad, setConfirmLoad] = useState(false)
  const { pathname } = useLocation()
  const pageLabel = t(currentPageLabel(pathname))
  const appEmpty = useAppEmpty()

  function handleLoadDemo() {
    if (appEmpty) installDemoData()
    else setConfirmLoad(true)
  }

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
    <div className="min-h-dvh bg-slate-100">
      {/* Full-height sidebar (desktop): brand at the very top */}
      <aside className="fixed inset-y-0 left-0 z-sidebar hidden w-64 flex-col bg-slate-900 md:flex">
        <Brand />
        <SidebarNav onNavigate={() => undefined} />
        <SidebarFooter onLoadDemo={handleLoadDemo} onClear={() => setConfirmClear(true)} />
      </aside>

      {/* Main column: sticky top bar + content — the only scroll area */}
      <div className="flex min-h-dvh flex-col md:ml-64">
        <header className="safe-area-top sticky top-0 z-sticky flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-500">{pageLabel}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HistoryControls />
            <LanguageSwitch />
          </div>
        </header>

        <main className="flex-1 p-3 pb-28 sm:p-6 sm:pb-28 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar (phone): 4 primary tabs + More */}
      <nav
        aria-label={t('common.menu')}
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-bottombar grid grid-cols-5 border-t border-slate-200 bg-white md:hidden"
      >
        {TAB_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition ${
                isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`
            }
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {item.icon}
            </span>
            <span className="w-full truncate text-center leading-tight">
              {t(navLabel(item))}
            </span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition ${
            MORE_ITEMS.some((item) => item.to === pathname)
              ? 'text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ⋯
          </span>
          <span className="w-full truncate text-center leading-tight">{t('nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          onLoadDemo={handleLoadDemo}
          onClear={() => setConfirmClear(true)}
        />
      )}
      {confirmClear && <ClearDataModal onClose={() => setConfirmClear(false)} />}
      {confirmLoad && <LoadDemoConfirmModal onClose={() => setConfirmLoad(false)} />}

      <ToastStack />
    </div>
  )
}
