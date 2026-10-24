import i18n from '@/i18n'

/**
 * Store-layer action labels are NOT English strings — they are translation
 * keys plus interpolation params, resolved in the language active at
 * DISPLAY time. History entries and toasts persist these structured
 * labels; components resolve them via translateAction() right before
 * rendering (toasts, undo/redo tooltips).
 *
 * A plain string is still accepted and passes through verbatim — mostly
 * for tests and one-off messages that are deliberately un-translated.
 */

/** A label referencing a translation key with optional interpolation params. */
export interface TranslatableLabel {
  /** i18next key, e.g. "actions.deletedProduct". */
  key: string
  /** Interpolation values; may themselves be nested labels. */
  params?: Record<string, unknown>
}

/**
 * Anything a store action can use as its human label:
 * - string: passed through verbatim (legacy/tests)
 * - TranslatableLabel: the normal structured case
 * - function: decided lazily at record time (e.g. optimizer results)
 */
export type ActionLabel =
  | string
  | TranslatableLabel
  | (() => string | TranslatableLabel)

/** Resolves a function label once, before the value is stored. */
export function normalizeLabel(value: ActionLabel): string | TranslatableLabel {
  return typeof value === 'function' ? value() : value
}

/** Renders nested array/labels into a single human string. */
function renderList(items: unknown[]): string {
  return items.map((item) => translateAction(item as ActionLabel)).join(', ')
}

/**
 * Resolves any label value to a display string in the CURRENT language:
 * - `{key, params}` → i18n.t with params (params may be nested labels,
 *   which resolve recursively; arrays are joined with ", ")
 * - `{key, ...flat}` → flat extra properties act as params when no
 *   explicit `params` object is given (e.g. `{key: 'words.orderCount', count: 3}`)
 * - string → verbatim
 * - undefined → empty string (missing fields default gracefully)
 */
export function translateAction(value: ActionLabel | string | undefined): string {
  if (value === undefined || value === null) return ''
  const normalized = typeof value === 'function' ? value() : value
  if (typeof normalized === 'string') return normalized

  const label = normalized as TranslatableLabel & Record<string, unknown>
  const { key, params: explicitParams, ...flatProps } = label
  const params =
    explicitParams ?? (Object.keys(flatProps).length > 0 ? flatProps : undefined)
  if (!params) return i18n.t(key)
  const resolved: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(params)) {
    if (Array.isArray(raw)) {
      resolved[name] = renderList(raw)
    } else if (raw !== null && typeof raw === 'object' && 'key' in raw) {
      resolved[name] = translateAction(raw as ActionLabel)
    } else {
      resolved[name] = raw
    }
  }
  return i18n.t(key, resolved)
}
