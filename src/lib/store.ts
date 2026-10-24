import { useSyncExternalStore } from 'react'

import type {
  Driver,
  InventoryItem,
  Order,
  Product,
  RoutePlanRecord,
} from '@/types'

/**
 * Tiny persistence layer backed by localStorage, with a global undo/redo
 * history of full-state snapshots.
 *
 * A fresh app starts COMPLETELY empty: no products, inventory, orders,
 * drivers, or route plans. The demo dataset in src/lib/seed.ts exists only
 * for the optional "Load demo data" sidebar action (src/lib/demoData.ts).
 * When storage version bumps, a one-time migration WIPES all collections
 * from previous versions (old demo data never comes back). Pages only
 * talk to the `db` collections below; when a real API arrives, swap the
 * collection implementations in this file without touching feature code.
 *
 * Undo/redo rules:
 * - Every mutation captures the PREVIOUS state of all collections as a
 *   snapshot on the undo stack (capped at MAX_HISTORY_ENTRIES) and clears
 *   the redo stack.
 * - Multi-step operations (order creation + stock deduction, bulk assign,
 *   auto-assign, …) must be wrapped in `runTransaction(label, fn)` so they
 *   produce exactly ONE history entry.
 * - Mutations fired in the same synchronous tick without an open
 *   transaction are also merged into one entry (covers call sites that
 *   mutate two collections back to back, e.g. deleting a product and its
 *   inventory row).
 * - The history itself is never persisted; only the current data is.
 */

const STORAGE_PREFIX = 'nexatrack:v3:'
/**
 * Key prefixes of earlier app versions. Data under them is wiped once on
 * load — never migrated, so stale demo or user data can't resurface.
 */
const LEGACY_PREFIXES = ['nexatrack:v2:', 'deliveryhub:']

/**
 * One-time migration from any previous version: every key under a legacy
 * prefix is DELETED (collections and route plans alike). The undo history
 * was never persisted, so clearing storage clears it as well.
 */
function purgeLegacyData(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const oldKey = localStorage.key(index)
      if (!oldKey) continue
      if (LEGACY_PREFIXES.some((prefix) => oldKey.startsWith(prefix))) {
        localStorage.removeItem(oldKey)
      }
    }
  } catch {
    // Storage unavailable: leave any remaining cleanup for next load.
  }
}
purgeLegacyData()

/** Undo history keeps at most this many snapshots (newest kept). */
export const MAX_HISTORY_ENTRIES = 50

type Listener = () => void

/**
 * A mutation label: static text, or a function resolved once the related
 * changes are complete — so `"Assigned 3 orders to Ahmed"` can count first.
 */
export type ActionLabel = string | (() => string)

interface Store<T> {
  get(): T
  /** Persist + notify + record history. */
  set(next: T, label?: ActionLabel): void
  /** Persist + notify WITHOUT touching history (undo/redo path). */
  restore(next: T): void
  subscribe(listener: Listener): () => void
}

/** Key registry so `clearAllData` only touches our own keys. */
const storageKeys = new Set<string>()

/** Every live collection store, in stable order — drives snapshot/restore. */
const stores: Store<unknown>[] = []

// ---------------------------------------------------------------------------
// Global undo/redo history
// ---------------------------------------------------------------------------

interface HistoryEntry {
  label: string
  /** Serialized snapshot of ALL collections, taken before the change. */
  state: string
}

const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []

let transactionDepth = 0
let transactionLabel: ActionLabel = ''
let transactionEntry: HistoryEntry | null = null

/** Entry pushed for the current synchronous tick (implicit grouping). */
let pendingTickEntry: HistoryEntry | null = null

let historyVersion = 0
const historyListeners = new Set<Listener>()

/**
 * Listeners for "a user action completed" — emitted AFTER the label of a
 * transaction is finalized. Used by the toast layer, never by React state.
 */
const actionListeners = new Set<(label: string) => void>()

export function onActionAnnounced(listener: (label: string) => void): () => void {
  actionListeners.add(listener)
  return () => {
    actionListeners.delete(listener)
  }
}

function announceAction(label: string): void {
  for (const listener of actionListeners) listener(label)
}

function serializeAll(): string {
  return JSON.stringify(stores.map((store) => store.get()))
}

function restoreAll(serialized: string): void {
  const states = JSON.parse(serialized) as unknown[]
  stores.forEach((store, index) => store.restore(states[index]))
}

function pushEntry(label: string, announce = true): HistoryEntry {
  const entry: HistoryEntry = { label, state: serializeAll() }
  undoStack.push(entry)
  if (undoStack.length > MAX_HISTORY_ENTRIES) undoStack.shift()
  // A brand-new action always invalidates the redo branch.
  redoStack.length = 0
  historyVersion += 1
  for (const listener of historyListeners) listener()
  if (announce) announceAction(label)
  return entry
}

function resolveLabel(label: ActionLabel): string {
  try {
    return typeof label === 'function' ? label() : label
  } catch {
    return 'Changed data'
  }
}

/**
 * Called by every store write right BEFORE its state is replaced.
 * Records one snapshot per transaction / per synchronous tick.
 */
function captureHistorySnapshot(label: ActionLabel): void {
  if (transactionDepth > 0) {
    // First mutation of the transaction owns the single snapshot; the
    // label is still pending, so do not announce it yet.
    if (transactionEntry === null) {
      transactionEntry = pushEntry(
        typeof transactionLabel === 'function' ? 'Working…' : transactionLabel,
        false,
      )
    }
    return
  }
  if (pendingTickEntry !== null) return // merge into the open tick entry

  const entry = pushEntry(resolveLabel(label))
  pendingTickEntry = entry
  // The tick ends when the JS stack empties (sync event handlers, tests).
  queueMicrotask(() => {
    pendingTickEntry = null
  })
}

/**
 * Groups every mutation inside `operation` into ONE history entry.
 * Nested calls are flattened into the outermost transaction, so a
 * transaction that calls another transaction-producing helper still
 * yields a single undo step. If `operation` performs no mutation at
 * all, nothing is pushed.
 */
export function runTransaction<T>(
  label: ActionLabel,
  operation: () => T,
): T {
  beginTransaction(label)
  try {
    return operation()
  } finally {
    endTransaction()
  }
}

/** Opens a manual transaction; prefer `runTransaction`. */
export function beginTransaction(label: ActionLabel): void {
  if (transactionDepth === 0) {
    transactionLabel = label
    transactionEntry = null
  }
  transactionDepth += 1
}

/** Closes a manual transaction; the label is resolved here so it can count. */
export function endTransaction(): void {
  if (transactionDepth === 0) return
  transactionDepth -= 1
  if (transactionDepth === 0) {
    if (transactionEntry !== null) {
      transactionEntry.label = resolveLabel(transactionLabel)
      transactionEntry = null
      historyVersion += 1
      for (const listener of historyListeners) listener()
      // Announce only now, when the label is final.
      announceAction(resolveLabel(transactionLabel))
    }
    transactionLabel = ''
    pendingTickEntry = null
  }
}

export function historyUndo(): boolean {
  if (transactionDepth > 0) return false // never undo inside an open group
  const entry = undoStack.pop()
  if (!entry) return false

  pendingTickEntry = null
  redoStack.push({ label: entry.label, state: serializeAll() })
  if (redoStack.length > MAX_HISTORY_ENTRIES) redoStack.shift()
  restoreAll(entry.state)
  historyVersion += 1
  for (const listener of historyListeners) listener()
  return true
}

export function historyRedo(): boolean {
  if (transactionDepth > 0) return false
  const entry = redoStack.pop()
  if (!entry) return false

  pendingTickEntry = null
  undoStack.push({ label: entry.label, state: serializeAll() })
  if (undoStack.length > MAX_HISTORY_ENTRIES) undoStack.shift()
  restoreAll(entry.state)
  historyVersion += 1
  for (const listener of historyListeners) listener()
  return true
}

export function historyCanUndo(): boolean {
  return undoStack.length > 0
}

export function historyCanRedo(): boolean {
  return redoStack.length > 0
}

/** Label of the most recent action — the one the next undo would revert. */
export function historyUndoLabel(): string | null {
  return undoStack.at(-1)?.label ?? null
}

/** Label of the next redo (the most recently undone action). */
export function historyRedoLabel(): string | null {
  return redoStack.at(-1)?.label ?? null
}

/** Debug/test helper: stack depths. */
export function historyStats(): { undoCount: number; redoCount: number } {
  return { undoCount: undoStack.length, redoCount: redoStack.length }
}

/** Imperative history API (for keyboard shortcuts etc.). */
export const history = {
  undo: historyUndo,
  redo: historyRedo,
  canUndo: historyCanUndo,
  canRedo: historyCanRedo,
  undoLabel: historyUndoLabel,
  redoLabel: historyRedoLabel,
  stats: historyStats,
} as const

export interface HistoryInfo {
  canUndo: boolean
  canRedo: boolean
  /** What the next undo would revert, e.g. `"Deleted product Milk"`. */
  lastAction: string | null
  /** What the next redo would re-apply. */
  redoAction: string | null
  undo: () => boolean
  redo: () => boolean
}

/** React hook: re-renders whenever the undo/redo stacks change. */
export function useHistory(): HistoryInfo {
  useSyncExternalStore(historySubscribe, historyGetVersion, historyGetVersion)
  return {
    canUndo: historyCanUndo(),
    canRedo: historyCanRedo(),
    lastAction: historyUndoLabel(),
    redoAction: historyRedoLabel(),
    undo: historyUndo,
    redo: historyRedo,
  }
}

function historySubscribe(listener: Listener): () => void {
  historyListeners.add(listener)
  return () => {
    historyListeners.delete(listener)
  }
}

function historyGetVersion(): number {
  return historyVersion
}

// ---------------------------------------------------------------------------
// Persisted stores
// ---------------------------------------------------------------------------

function createPersistedStore<T>(key: string, seed: T): Store<T> {
  const storageKey = STORAGE_PREFIX + key
  storageKeys.add(storageKey)

  const listeners = new Set<Listener>()
  let current = seed

  try {
    const raw = localStorage.getItem(storageKey)
    if (raw !== null) {
      current = JSON.parse(raw) as T
    } else {
      // First run:
      // persist the baseline immediately so every collection key exists.
      try {
        localStorage.setItem(storageKey, JSON.stringify(seed))
      } catch {
        // Storage unavailable: keep the seed in memory.
      }
    }
  } catch {
    // Corrupted or unreadable data: fall back to the seed value.
  }

  const store: Store<T> = {
    get() {
      return current
    },
    set(next, label) {
      captureHistorySnapshot(label ?? 'Changed data') // snapshot BEFORE the write
      current = next
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Quota or privacy-mode errors: keep working in memory.
      }
      for (const listener of listeners) listener()
    },
    restore(next) {
      current = next
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Quota or privacy-mode errors: keep working in memory.
      }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  stores.push(store as Store<unknown>)
  return store
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface Collection<T> {
  all(): T[]
  /** Replace every item (bulk import). */
  save(items: T[], label?: ActionLabel): void
  add(item: T, label?: ActionLabel): void
  /** Update the one item whose key matches; e.g. inventory key = productId. */
  update(key: string, patch: Partial<T>, label?: ActionLabel): void
  remove(key: string, label?: ActionLabel): void
  subscribe(listener: Listener): () => void
}

/** Human-friendly nouns for default labels, e.g. `"Deleted product"`. */
const COLLECTION_NOUNS: Record<string, string> = {
  products: 'product',
  inventory: 'inventory item',
  orders: 'order',
  drivers: 'driver',
  routePlans: 'route plan',
}

function createCollection<T>(
  key: string,
  seed: T[],
  getKey: (item: T) => string,
): Collection<T> {
  const store = createPersistedStore<T[]>(key, seed)
  const noun = COLLECTION_NOUNS[key] ?? key
  return {
    all: () => store.get(),
    save: (items, label) => store.set(items, label ?? `Replaced ${key}`),
    add: (item, label) => store.set([item, ...store.get()], label ?? `Added ${noun}`),
    update: (key, patch, label) =>
      store.set(
        store.get().map((item) => (getKey(item) === key ? { ...item, ...patch } : item)),
        label ?? `Updated ${noun}`,
      ),
    remove: (key, label) =>
      store.set(
        store.get().filter((item) => getKey(item) !== key),
        label ?? `Deleted ${noun}`,
      ),
    subscribe: store.subscribe,
  }
}

/** The single data source for the whole prototype. Starts empty. */
export const db = {
  products: createCollection<Product>('products', [], (product) => product.id),
  inventory: createCollection<InventoryItem>('inventory', [], (item) => item.productId),
  orders: createCollection<Order>('orders', [], (order) => order.id),
  drivers: createCollection<Driver>('drivers', [], (driver) => driver.id),
  routePlans: createCollection<RoutePlanRecord>('routePlans', [], (record) => record.driverId),
} as const

/** React hook: renders the calling component whenever `collection` changes. */
export function useCollection<T>(collection: Collection<T>): T[] {
  return useSyncExternalStore(collection.subscribe, collection.all, collection.all)
}

/** Generate a short, prefixed entity ID for new records. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}

/**
 * Destroys ALL collections and the undo history. NOT undoable — the only
 * such action in the app; the sidebar asks for a typed confirmation
 * first. Resets in-memory state (no reload) and persists empty arrays.
 */
export function clearAllData(): void {
  for (const store of stores) {
    store.restore([])
  }
  undoStack.length = 0
  redoStack.length = 0
  historyVersion += 1
  for (const listener of historyListeners) listener()
  announceAction('Cleared all data — cannot be undone')
}
