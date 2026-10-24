import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import fr from './locales/fr.json'

/**
 * The two locale files must declare exactly the same key structure — a
 * translation missing in one language silently falls back to English,
 * which is exactly the kind of drift this test is here to catch.
 */

/** Every translation key as a flat dot path, plural suffixes included. */
function flattenKeys(
  value: unknown,
  prefix = '',
): string[] {
  if (value === null || value === undefined) return []
  if (typeof value !== 'object') return prefix ? [prefix] : []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

const enKeys = new Set(flattenKeys(en))
const frKeys = new Set(flattenKeys(fr))

describe('locale key parity', () => {
  it('en.json and fr.json declare exactly the same keys', () => {
    const enOnly = [...enKeys].filter((key) => !frKeys.has(key))
    const frOnly = [...frKeys].filter((key) => !enKeys.has(key))
    expect(enOnly, `keys defined in EN but missing in FR: ${enOnly.join(', ')}`).toEqual([])
    expect(frOnly, `keys defined in FR but missing in EN: ${frOnly.join(', ')}`).toEqual([])
  })

  it('is not accidentally empty — the locales really are loaded', () => {
    expect(enKeys.size).toBeGreaterThan(20)
    expect(frKeys.size).toBe(enKeys.size)
  })

  it('every plural key (_one/_other) has its full i18next pair in BOTH languages', () => {
    for (const keySet of [enKeys, frKeys]) {
      const problems: string[] = []
      for (const key of keySet) {
        if (key.endsWith('_one') && !keySet.has(key.replace(/_one$/, '_other'))) {
          problems.push(`${key} has no _other counterpart`)
        }
        if (key.endsWith('_other') && !keySet.has(key.replace(/_other$/, '_one'))) {
          problems.push(`${key} has no _one counterpart`)
        }
      }
      expect(problems, problems.join(', ')).toEqual([])
    }
  })
})
