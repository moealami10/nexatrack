import { useTranslation } from 'react-i18next'

import { useOverlayLock } from '@/lib/useOverlayLock'

export interface ActionSheetAction {
  label: string
  /** Renders the row in the destructive (red) style. */
  danger?: boolean
  onSelect: () => void
}

/**
 * Mobile overflow menu opened from a card's "⋯" button: a bottom sheet
 * with large (52px+) tap rows. Desktop never renders it.
 */
export function ActionSheet({
  title,
  onClose,
  actions,
}: {
  title: string
  onClose: () => void
  actions: ActionSheetAction[]
}) {
  const { t } = useTranslation()
  useOverlayLock(onClose)

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className="animate-sheet-in safe-area-bottom absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-slate-400">
          {title}
        </p>
        <div className="p-2 pb-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onClose()
                action.onSelect()
              }}
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 text-left text-base font-medium transition ${
                action.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              {action.danger ? '🗑️' : '✎'}
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-slate-100 text-base font-medium text-slate-600 transition hover:bg-slate-200"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
