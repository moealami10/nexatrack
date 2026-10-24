export type StatAccent = 'slate' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose'

const ACCENT_CLASSES: Record<StatAccent, string> = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-100 text-sky-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  violet: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  accent = 'slate',
}: {
  icon: string
  label: string
  value: string | number
  hint?: string
  accent?: StatAccent
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${ACCENT_CLASSES[accent]}`}>
          {icon}
        </span>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
