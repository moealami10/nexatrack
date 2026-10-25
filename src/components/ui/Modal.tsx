import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useOverlayLock } from '@/lib/useOverlayLock'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * Centered card dialog on desktop (unchanged), full-screen bottom sheet
 * on mobile: sticky header with a 44px close button, scrollable content,
 * and an optional sticky `footer` reserved for the primary action.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky footer (primary/cancel actions); rendered below scrolled content. */
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  useOverlayLock(onClose)

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('common.close')}
      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
    >
      ✕
    </button>
  )

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-modal" role="presentation">
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
            {closeButton}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && (
            <div className="safe-area-bottom shrink-0 border-t border-slate-200 bg-white p-4">
              {footer}
            </div>
          )}
        </div>
      </div>
      ,
      document.body,
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex w-full items-center justify-between px-6 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {closeButton}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
        {footer && (
          <div className="flex w-full shrink-0 justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
