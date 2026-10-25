// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { location } from '@/config/location'
import { clearAllData, db } from './store'
import { installDemoData } from './demoData'

const CASABLANCA_NAMES = [
  'casablanca',
  'maarif',
  'ain diab',
  'sidi maarouf',
  'ain sebaa',
  'derb sultan',
  'bouskoura',
  'hay hassani',
  'oulfa',
  'gauthier',
  'anfa',
  'roches noires',
  'bernoussi',
]

function isCasablancaText(value: string): boolean {
  const lower = value.toLowerCase()
  if (lower.includes('casablanca') || lower.includes('casa')) return true
  return CASABLANCA_NAMES.some((name) => lower.includes(name))
}

describe('demo data location', () => {
  beforeEach(() => {
    clearAllData()
  })
  afterEach(() => {
    clearAllData()
  })

  it('loads only Laayoune orders inside the configured bounds with no Casablanca text', () => {
    installDemoData()
    const orders = db.orders.all()
    expect(orders.length).toBeGreaterThan(0)
    for (const order of orders) {
      expect(order.lat).toBeGreaterThan(location.bounds.minLat)
      expect(order.lat).toBeLessThan(location.bounds.maxLat)
      expect(order.lng).toBeGreaterThan(location.bounds.minLng)
      expect(order.lng).toBeLessThan(location.bounds.maxLng)
      expect(isCasablancaText(order.customerName)).toBe(false)
      expect(isCasablancaText(order.address)).toBe(false)
    }
  })
})
