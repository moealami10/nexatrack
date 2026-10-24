import i18next, { type i18n as I18nInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import fr from './locales/fr.json'

/**
 * Global i18n setup. English/French only; the saved choice
 * (`nexatrack:v3:lang` in localStorage) wins over the browser language,
 * and English is the final fallback. Sync usage: resources are inline, so
 * `t()` works as soon as this module is imported (main.tsx imports it
 * first).
 */

/** localStorage key storing the user's language choice. */
export const LANGUAGE_STORAGE_KEY = 'nexatrack:v3:lang'

/** ISO codes supported by the app, in display order for the switch. */
export const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
] as const

export function isSupportedLanguage(code: string | undefined): code is 'en' | 'fr' {
  return code === 'en' || code === 'fr'
}

/** Builds and initializes a fresh i18next instance (used by the app shell). */
function createI18n(): { instance: I18nInstance; ready: Promise<unknown> } {
  const instance = i18next.createInstance()

  const ready = instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
      },
      fallbackLng: 'en',
      supportedLngs: ['en', 'fr'],
      nonExplicitSupportedLngs: true, // fr-FR counts as fr
      load: 'languageOnly', // navigator.language "fr-FR" → "fr"
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ['localStorage'],
      },
      interpolation: { escapeValue: false }, // React already escapes
      returnNull: false,
      returnEmptyString: false,
    }) as unknown as Promise<unknown>

  return { instance, ready }
}

const { instance, ready } = createI18n()

/** The initialized singleton — most code imports this as the default. */
export default instance
export { instance as i18n }

/**
 * Canonical active language ('en' | 'fr'). i18next keeps the raw detected
 * tag (e.g. "fr-FR") in `i18n.language`; the normalized, actually-in-use
 * language is resolvedLanguage. Everything UI-side (active switch
 * segment, <html lang>) must use this helper.
 */
export function currentLanguage(): 'en' | 'fr' {
  const resolved =
    typeof instance.resolvedLanguage === 'string' && instance.resolvedLanguage !== ''
      ? instance.resolvedLanguage
      : instance.language
  return isSupportedLanguage(resolved) ? resolved : 'en'
}

/**
 * Keep <html lang> in sync with the active language so screen readers and
 * document-level typography always match. Reapplied whenever the language
 * changes, including the very first init.
 */
instance.on('languageChanged', () => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = currentLanguage()
})
// The event above does not fire for the initial detection (init precedes
// registration), so apply the starting language right away.
if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLanguage()
}

/** Resolves once initialization finished — useful in tests. */
export const i18nReady: Promise<unknown> = ready
