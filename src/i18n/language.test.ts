import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Language selection: the saved choice (nexatrack:v3:lang) wins over the
 * browser language, English is the fallback, changing the language
 * persists to localStorage and updates <html lang>. i18next-browser-
 * languagedetector reads window.localStorage, so each test installs a
 * faked browser environment and re-imports the module ("reload").
 */

type StorageShim = ReturnType<typeof createMemoryStorage>

interface DocumentStub {
  documentElement: { lang: string }
}

let storage: StorageShim
let doc: DocumentStub

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
  }
}

/** Fake a browser-ish environment: window.localStorage, navigator, document. */
function installBrowserEnvironment(options: { saved?: string; browser: string }) {
  storage = createMemoryStorage()
  if (options.saved !== undefined) {
    storage.setItem('nexatrack:v3:lang', options.saved)
  }
  doc = { documentElement: { lang: '' } }
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: doc as unknown as Document,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: options.browser, languages: [options.browser] },
    configurable: true,
  })
}

function restoreEnvironment() {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { document?: unknown }).document
}

beforeEach(() => {
  vi.resetModules()
  restoreEnvironment()
})

/** Import the module fresh — this is the "reload" under test. */
async function loadI18n() {
  const module = await import('./index')
  await module.i18nReady
  return module
}

describe('language detection', () => {
  it('uses the saved choice from nexatrack:v3:lang over the browser language', async () => {
    installBrowserEnvironment({ saved: 'fr', browser: 'en-US' })
    const { currentLanguage } = await loadI18n()

    expect(currentLanguage()).toBe('fr')
  })

  it('falls back to the browser language when nothing is saved (fr-FR → fr)', async () => {
    installBrowserEnvironment({ browser: 'fr-FR' })
    const { currentLanguage } = await loadI18n()

    expect(currentLanguage()).toBe('fr')
  })

  it('falls back to English for a non-supported browser language', async () => {
    installBrowserEnvironment({ browser: 'es-ES' })
    const { currentLanguage } = await loadI18n()

    expect(currentLanguage()).toBe('en')
  })

  it('defaults to English when the saved value is corrupt', async () => {
    installBrowserEnvironment({ saved: 'xx-ZZ', browser: 'es-ES' })
    const { currentLanguage } = await loadI18n()

    expect(currentLanguage()).toBe('en')
  })
})

describe('language persistence', () => {
  it('changing the language writes nexatrack:v3:lang and survives a simulated reload', async () => {
    installBrowserEnvironment({ browser: 'en-US' })
    const { currentLanguage, i18n } = await loadI18n()
    expect(currentLanguage()).toBe('en')

    await i18n.changeLanguage('fr')
    expect(storage.getItem('nexatrack:v3:lang')).toBe('fr')
    expect(doc.documentElement.lang).toBe('fr')

    // "Reload": re-import the module against the SAME storage — the saved
    // choice must win over the (English) browser language.
    vi.resetModules()
    const { currentLanguage: afterReload } = await loadI18n()
    expect(afterReload()).toBe('fr')
    expect(doc.documentElement.lang).toBe('fr')
  })

  it('updates <html lang> immediately on every change', async () => {
    installBrowserEnvironment({ browser: 'en-US' })
    const { currentLanguage, i18n } = await loadI18n()

    expect(doc.documentElement.lang).toBe('en')

    await i18n.changeLanguage('fr')
    expect(doc.documentElement.lang).toBe('fr')
    expect(currentLanguage()).toBe('fr')

    await i18n.changeLanguage('en')
    expect(doc.documentElement.lang).toBe('en')
    expect(currentLanguage()).toBe('en')
  })
})
