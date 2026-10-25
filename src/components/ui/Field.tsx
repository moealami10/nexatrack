import type { ReactNode } from 'react'

/**
 * Shared styling for form inputs inside modals and pages.
 * `text-base sm:text-sm`: 16px on touch devices so iOS Safari doesn't
 * zoom into focused fields (its minimum non-zoom font size is 16px).
 */
export const inputClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:text-sm'

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  )
}
