import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { translateAction } from '@/lib/actionLabel'
import { dismissActionToast, getSnapshot, subscribe } from '@/lib/toasts'
import { history } from '@/lib/store'

/** Fixed overlay rendering the current action toast; mount once in the shell. */
export function ToastStack() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const { t } = useTranslation()
  if (!toast) return null

  return (
    <div
      key={toast.id}
      role="status"
      className="animate-toast-in fixed right-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl bg-slate-900 py-3 pl-4 pr-2 text-white shadow-xl bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] md:bottom-4"
    >
      <p className="text-sm leading-5">{translateAction(toast.label)}</p>
      <div className="ml-1 flex shrink-0 items-center">
        {toast.undoable && (
          <button
            type="button"
            onClick={() => {
              history.undo()
              dismissActionToast()
            }}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-sky-300 transition hover:bg-slate-800 hover:text-sky-200"
          >
            {t('toasts.undoButton')}
          </button>
        )}
        <button
          type="button"
          onClick={dismissActionToast}
          aria-label={t('toasts.dismiss')}
          className="rounded-lg px-2.5 py-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
