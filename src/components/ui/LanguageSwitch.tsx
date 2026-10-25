import { useTranslation } from 'react-i18next'

import { LANGUAGES, currentLanguage } from '@/i18n'

/**
 * Compact "EN | FR" segmented control for the top bar, styled to match the
 * undo/redo buttons (36px high, same border/ring). Switching calls
 * i18n.changeLanguage, which re-renders the whole UI instantly (every
 * translated component subscribes through useTranslation) and persists the
 * choice via the language detector — no reload involved.
 */
export function LanguageSwitch() {
  const { i18n, t } = useTranslation()
  const active = currentLanguage()

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="flex h-11 items-center overflow-hidden rounded-md border border-slate-300 bg-white text-sm font-medium md:h-9"
    >
      {LANGUAGES.map((option, index) => {
        const isActive = active === option.code
        return (
          <button
            key={option.code}
            type="button"
            aria-pressed={isActive}
            aria-label={
              option.code === 'en' ? t('common.switchToEnglish') : t('common.switchToFrench')
            }
            onClick={() => {
              if (!isActive) void i18n.changeLanguage(option.code)
            }}
            className={`flex h-full items-center px-2.5 transition ${
              isActive
                ? 'bg-slate-900 font-semibold text-white'
                : 'text-slate-700 hover:bg-slate-100'
            } ${index > 0 ? 'border-l border-slate-300' : ''}`}
            title={
              option.code === 'en' ? t('common.switchToEnglish') : t('common.switchToFrench')
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
