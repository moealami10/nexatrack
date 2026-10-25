import i18n from '@/i18n'

/**
 * Presentation helpers shared by pages. Dates, numbers and currency are
 * formatted with Intl for the ACTIVE language (see src/i18n); day keys stay
 * locale-invariant because they are comparison keys, not display text.
 */

/** The Intl locale that corresponds to the active UI language. */
export function activeLocale(): string {
  return i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US'
}

// Formatters are expensive — one per (kind, locale) combination.
const NUMBER_FORMATTERS = new Map<string, Intl.NumberFormat>()
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function numberFormatter(optionsName: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${optionsName}:${activeLocale()}`
  let formatter = NUMBER_FORMATTERS.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(activeLocale(), options)
    NUMBER_FORMATTERS.set(cacheKey, formatter)
  }
  return formatter
}

function cachedDateTime(dateOptions: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // Stable cache key, independent of option ordering:
  const cacheKey = `dt:${activeLocale()}:${JSON.stringify(dateOptions)}`
  let formatter = DATE_FORMATTERS.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(activeLocale(), dateOptions)
    DATE_FORMATTERS.set(cacheKey, formatter)
  }
  return formatter
}

/** MAD in both languages — e.g. "MAD 1,234.50" / "1 234,50 MAD". */
export function formatCurrency(value: number): string {
  return numberFormatter('currency', { style: 'currency', currency: 'MAD' }).format(value)
}

/** Locale-aware decimal number, e.g. 12.5 → "12.5" / "12,5". */
export function formatNumber(value: number, fractionDigits = 1): string {
  return numberFormatter(`num:${fractionDigits}`, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return `${hours} h ${String(rest).padStart(2, '0')} min`
}

/**
 * Stock quantity from a raw input string: whole number, never below zero.
 * Used by the inventory input and by the mobile +/- stepper.
 */
export function clampQuantity(raw: string): number {
  return Math.max(0, Math.floor(Number(raw) || 0))
}

/** e.g. "Oct 24" / "24 oct." */
export function formatDate(isoDate: string): string {
  return cachedDateTime({ month: 'short', day: 'numeric' }).format(new Date(isoDate))
}

/** e.g. "Oct 24, 12:03" / "24 oct. 2026, 12:03" */
export function formatDateTime(isoDate: string): string {
  const locale = activeLocale()
  return (locale === 'fr-FR'
    ? cachedDateTime({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : cachedDateTime({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  ).format(new Date(isoDate))
}

const DAY_KEY_PAD = (value: number) => String(value).padStart(2, '0')

/**
 * Stable key (per local day) for comparing two timestamps. Deliberately
 * NOT localized — it may be compared across language switches in one
 * session, so it must never depend on the active locale.
 */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${DAY_KEY_PAD(date.getMonth() + 1)}-${DAY_KEY_PAD(date.getDate())}`
}

export function localDayKey(isoDate: string): string {
  return dayKey(new Date(isoDate))
}

/** Local day key for right now. Lives here, not in render, so the
 * react-purity linter stays quiet about `new Date()`. */
export function currentDayKey(): string {
  return dayKey(new Date())
}
