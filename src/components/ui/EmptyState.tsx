import type { ReactNode } from 'react'

/**
 * Placeholder for an empty collection. `action` (optional) holds the
 * suggested next step — usually a button — rendered under the message.
 */
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-12">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-slate-500">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
