import { describe, expect, it } from 'vitest'

import { clampQuantity } from './format'

/**
 * Stock quantity clamping used by the inventory input and the mobile
 * +/- stepper: whole numbers only, floor of zero, garbage → 0.
 */
describe('clampQuantity', () => {
  it('passes valid quantities through as whole numbers', () => {
    expect(clampQuantity('12')).toBe(12)
    expect(clampQuantity('0')).toBe(0)
    expect(clampQuantity('12.6')).toBe(12) // floor
  })

  it('clamps negatives to zero', () => {
    expect(clampQuantity('-5')).toBe(0)
  })

  it('treats garbage input as zero', () => {
    expect(clampQuantity('')).toBe(0)
    expect(clampQuantity('abc')).toBe(0)
  })
})
