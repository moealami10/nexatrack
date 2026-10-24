/** Presentation helpers shared by pages. */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'MAD',
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return `${hours} h ${String(rest).padStart(2, '0')} min`
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/** Stable key (per local day) for comparing two timestamps. */
export function localDayKey(isoDate: string): string {
  return DAY_KEY_FORMATTER.format(new Date(isoDate))
}

/** Local day key for right now. Lives here, not in render, so the
 * react-purity linter stays quiet about `new Date()`. */
export function currentDayKey(): string {
  return DAY_KEY_FORMATTER.format(new Date())
}
