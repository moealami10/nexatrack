import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useOverlayLock } from '@/lib/useOverlayLock'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * Side panel sliding in from the right (desktop, unchanged), full-screen
 * bottom sheet on mobile: sticky header with a 44px close button,
 * scrollable content, optional sticky `footer` for the primary action.
 */
export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky footer (primary action); rendered below scrolled content. */
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  useOverlayLock(onClose)

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50" role="presentation">
        <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
        <div
          className="animate-sheet-in absolute inset-0 flex flex-col bg-white"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="safe-area-top flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="min-w-0 truncate text-lg font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && (
            <div className="safe-area-bottom shrink-0 border-t border-slate-200 bg-white p-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-drawer fixed inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="flex w-full shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
