import { describe, expect, it } from 'vitest'

import {
  AVERAGE_SPEED_KMH,
  formatHhmm,
  haversineKm,
  optimizeRoute,
  parseHhmm,
  scheduleTour,
  tourDistanceKm,
  type Stop,
} from './routing'

const ORIGIN = { lat: 0, lng: 0 }

function stopAt(id: string, lat: number, lng: number): Stop {
  return { id, lat, lng }
}

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(ORIGIN, ORIGIN)).toBe(0)
  })

  it('is symmetric', () => {
    const casablanca = { lat: 33.5731, lng: -7.5898 }
    const rabat = { lat: 34.0209, lng: -6.8416 }
    expect(haversineKm(casablanca, rabat)).toBeCloseTo(haversineKm(rabat, casablanca), 9)
  })

  it('measures a known city pair in a sensible range', () => {
    const casablanca = { lat: 33.5731, lng: -7.5898 }
    const rabat = { lat: 34.0209, lng: -6.8416 }
    const km = haversineKm(casablanca, rabat)
    expect(km).toBeGreaterThan(80) // ~87 km by air
    expect(km).toBeLessThan(95)
  })
})

describe('tourDistanceKm', () => {
  it('returns to the depot: a single stop costs the same there and back', () => {
    const oneWay = haversineKm(ORIGIN, { lat: 0, lng: 0.01 })
    expect(tourDistanceKm(ORIGIN, [stopAt('a', 0, 0.01)])).toBeCloseTo(oneWay * 2, 6)
  })

  it('sums the legs between consecutive stops', () => {
    const a = { lat: 0, lng: 0.01 }
    const b = { lat: 0, lng: 0.02 }
    const expected =
      haversineKm(ORIGIN, a) + haversineKm(a, b) + haversineKm(b, ORIGIN)
    expect(tourDistanceKm(ORIGIN, [stopAt('a', a.lat, a.lng), stopAt('b', b.lat, b.lng)])).toBeCloseTo(
      expected,
      6,
    )
  })
})

describe('optimizeRoute', () => {
  it('returns an empty plan for no stops', () => {
    expect(optimizeRoute(ORIGIN, [])).toEqual({
      stops: [],
      distanceKm: 0,
      estimatedMinutes: 0,
      totalLateMinutes: 0,
      lateCount: 0,
    })
  })

  it('visits the closest stop first (nearest neighbor start)', () => {
    const far = stopAt('far', 0, 0.06)
    const near = stopAt('near', 0, 0.02)
    const mid = stopAt('mid', 0, 0.04)
    const plan = optimizeRoute(ORIGIN, [far, near, mid])
    expect(plan.stops.map((stop) => stop.id)).toEqual(['near', 'mid', 'far'])
  })

  it('2-opt untangles a tour nearest-neighbor alone would keep', () => {
    // All stops on one line: A 1° east, B 1° west, C 4° east. Nearest
    // neighbor walks A → B → C, which crosses back over the depot area.
    const a = stopAt('a', 0, 0.01)
    const b = stopAt('b', 0, -0.01)
    const c = stopAt('c', 0, 0.04)
    const greedy = tourDistanceKm(ORIGIN, [a, b, c])
    const plan = optimizeRoute(ORIGIN, [a, b, c])

    expect(plan.distanceKm).toBeLessThan(greedy)
    // The optimum for stops on a line is exactly twice the span between
    // its two extreme stops.
    expect(plan.distanceKm).toBeLessThanOrEqual(2 * haversineKm(b, c) + 1e-9)
  })

  it('is never worse than the input order, for any permutation', () => {
    const stops = [
      stopAt('a', 0.005, 0.01),
      stopAt('b', -0.006, -0.02),
      stopAt('c', 0.011, 0.03),
    ]
    const permutations: Stop[][] = [
      [stops[0], stops[1], stops[2]],
      [stops[0], stops[2], stops[1]],
      [stops[1], stops[0], stops[2]],
      [stops[1], stops[2], stops[0]],
      [stops[2], stops[0], stops[1]],
      [stops[2], stops[1], stops[0]],
    ]
    for (const order of permutations) {
      const before = tourDistanceKm(ORIGIN, order)
      const plan = optimizeRoute(ORIGIN, order)
      expect(plan.distanceKm).toBeLessThanOrEqual(before + 1e-9)
    }
  })

  it('keeps every stop and estimates time from distance and speed', () => {
    const stops = [
      stopAt('a', 0.002, 0.01),
      stopAt('b', -0.001, -0.02),
      stopAt('c', 0.004, 0.03),
      stopAt('d', 0.001, 0.001),
    ]
    const plan = optimizeRoute(ORIGIN, stops)
    expect(new Set(plan.stops.map((stop) => stop.id))).toEqual(
      new Set(['a', 'b', 'c', 'd']),
    )
    expect(plan.estimatedMinutes).toBe(
      Math.round((plan.distanceKm / AVERAGE_SPEED_KMH) * 60),
    )
  })
})

describe('optimizeRoute with a travel matrix', () => {
  /**
   * Arbitrary ASYMMETRIC road matrix over [depot, a, b] — nothing like the
   * straight-line geometry of the points themselves. On roads the depot
   * reaches `a` only via a 10 km detour while `b` is 1 km down the road,
   * and getting from a to b costs the same as crossing town backwards.
   */
  const matrix = {
    distancesKm: [
      [0, 10, 1],
      [10, 0, 10],
      [10, 1, 0],
    ],
    durationsMin: [
      [0, 20, 2],
      [33, 0, 20],
      [20, 2, 0],
    ],
  }

  it('follows the matrix order, not the haversine order', () => {
    const a = stopAt('a', 0, 0.01) // haversine-nearest to the depot
    const b = stopAt('b', 0, 0.04) // haversine-farther
    const plan = optimizeRoute(ORIGIN, [a, b], { matrix })

    // Haversine would pick a first; roads say go to b first.
    expect(plan.stops.map((stop) => stop.id)).toEqual(['b', 'a'])
    expect(plan.distanceKm).toBe(1 + 1 + 10) // depot→b→a→depot
  })

  it('uses matrix durations for the time estimate, not the flat speed', () => {
    const a = stopAt('a', 0, 0.01)
    const b = stopAt('b', 0, 0.04)
    const plan = optimizeRoute(ORIGIN, [a, b], { matrix })
    expect(plan.estimatedMinutes).toBe(2 + 2 + 33)
    // Prove it is NOT distance/30 km/h: 12 km at the flat speed is 24 min,
    // while the road durations above sum to 37 min.
    expect(plan.estimatedMinutes).not.toBe(
      Math.round((plan.distanceKm / AVERAGE_SPEED_KMH) * 60),
    )
  })

  it('is never worse than directly driving the given input order', () => {
    const a = stopAt('a', 0, 0.01)
    const b = stopAt('b', 0.01, 0.02)
    for (const order of [[a, b], [b, a]] as Stop[][]) {
      // Cost of depot → order[0] → … → back to depot, read straight
      // from the matrix in the given order.
      const sequence = [0, ...order.map((stop) => (stop === a ? 1 : 2)), 0]
      let direct = 0
      for (let i = 0; i < sequence.length - 1; i++) {
        direct += matrix.distancesKm[sequence[i]!]![sequence[i + 1]!]!
      }
      const plan = optimizeRoute(ORIGIN, order, { matrix })
      expect(plan.distanceKm).toBeLessThanOrEqual(direct + 1e-9)
    }
  })

  it('degrades to the pure haversine plan when every cell is null', () => {
    const stops = [stopAt('a', 0.002, 0.01), stopAt('b', -0.001, -0.02)]
    const plan = optimizeRoute(ORIGIN, stops)
    const nullMatrix = {
      distancesKm: [[null, null, null], [null, null, null], [null, null, null]],
      durationsMin: [[null, null, null], [null, null, null], [null, null, null]],
    }
    expect(optimizeRoute(ORIGIN, stops, { matrix: nullMatrix })).toEqual(plan)
  })
})

describe('parseHhmm / formatHhmm', () => {
  it('round-trips valid times and rejects invalid ones', () => {
    expect(parseHhmm('08:00')).toBe(480)
    expect(parseHhmm('14:05')).toBe(845)
    expect(parseHhmm('0:00')).toBe(0)
    expect(parseHhmm('24:00')).toBeNull()
    expect(parseHhmm('8:60')).toBeNull()
    expect(parseHhmm('soon')).toBeNull()
    expect(formatHhmm(480)).toBe('08:00')
    expect(formatHhmm(845)).toBe('14:05')
    // Wraps past midnight instead of failing.
    expect(formatHhmm(24 * 60 + 30)).toBe('00:30')
  })
})

describe('scheduleTour (windows + service)', () => {
  const depot = ORIGIN
  const shift = 480 // 08:00

  it('adds service time between legs, invisible when default-free', () => {
    // depot→a ≈ 1.11 km → 2 min; a→b ≈ 1.11 km → 2 min; b→depot ≈ 2.22 km → 4 min.
    const a = { ...stopAt('a', 0, 0.01), serviceMinutes: 10 }
    const b = { ...stopAt('b', 0, 0.02), serviceMinutes: 0 }
    const schedule = scheduleTour(depot, [a, b], { shiftStartMinutes: shift })

    const [entryA, entryB] = schedule.entries
    expect(entryA!.arrivalAt).toBe(482)
    expect(entryA!.departureAt).toBe(492) // +10 min service
    expect(entryB!.arrivalAt).toBe(494) // leaves a at 492, drive 2 min
    expect(entryB!.departureAt).toBe(494) // 0 min service
    expect(schedule.endAt).toBe(498) // 494 + 4 min back to the depot
    expect(schedule.lateCount).toBe(0)
  })

  it('waits for a window that opens after arrival', () => {
    // depot→a ≈ 1.11 km → 2 min: arrives 08:02, window opens 09:00.
    const a = {
      ...stopAt('a', 0, 0.01),
      windowStart: '09:00',
      windowEnd: '10:00',
      serviceMinutes: 5,
    }
    const schedule = scheduleTour(depot, [a], { shiftStartMinutes: shift })

    expect(schedule.entries[0]).toMatchObject({
      arrivalAt: 482,
      waitMinutes: 58,
      lateMinutes: 0,
      departureAt: 545, // service starts at 09:00
    })
    expect(schedule.endAt).toBe(547)
  })

  it('flags an infeasible window with the minutes missed', () => {
    // depot→a ≈ 3.34 km → 7 min: arrives 08:07, window closed at 08:00.
    const a = { ...stopAt('a', 0, 0.03), windowEnd: '08:00' }
    const schedule = scheduleTour(depot, [a], { shiftStartMinutes: shift })

    expect(schedule.entries[0]).toMatchObject({
      arrivalAt: 487,
      lateMinutes: 7,
      waitMinutes: 0,
    })
    expect(schedule.lateCount).toBe(1)
    expect(schedule.totalLateMinutes).toBe(7)
  })

  it('handles a fully feasible route: no wait, no lateness', () => {
    const a = { ...stopAt('a', 0, 0.005), windowStart: '08:00', windowEnd: '17:00' }
    const b = { ...stopAt('b', 0, 0.012), windowStart: '08:00', windowEnd: '18:00' }
    const schedule = scheduleTour(depot, [a, b], { shiftStartMinutes: shift })
    expect(schedule.entries.every((entry) => entry.lateMinutes === 0)).toBe(true)
    expect(schedule.entries.every((entry) => entry.waitMinutes === 0)).toBe(true)
    expect(schedule.lateCount).toBe(0)
  })
})

describe('optimizeRoute with delivery windows', () => {
  /**
   * `a` is haversine-close but only acceptant 10:00–10:10; `b` is far but
   * must see a driver 08:30–09:10. Pure nearest-neighbor walks a → b and
   * arrives ~10:14 (64 min late); the window-sensitive order is b → a.
   */
  const a = {
    ...stopAt('a', 0, 0.005),
    windowStart: '10:00',
    windowEnd: '10:10',
    serviceMinutes: 5,
  }
  const b = {
    ...stopAt('b', 0, 0.045),
    windowStart: '08:30',
    windowEnd: '09:10',
  }

  it('reorders to eliminate lateness, overriding the distance-preferred order', () => {
    const plan = optimizeRoute(ORIGIN, [a, b], { shiftStartMinutes: 480 })
    expect(plan.stops.map((stop) => stop.id)).toEqual(['b', 'a'])
    expect(plan.lateCount).toBe(0)
    expect(plan.totalLateMinutes).toBe(0)
  })

  it('reports the lateness of an order it could not fix', () => {
    // Only one stop, window already passed at shift start → late exactly
    // by the travel minutes; still returned with the diagnosis.
    const dead = { ...stopAt('dead', 0, 0.03), windowEnd: '08:00' }
    const plan = optimizeRoute(ORIGIN, [dead], { shiftStartMinutes: 480 })
    expect(plan.stops.map((stop) => stop.id)).toEqual(['dead'])
    expect(plan.lateCount).toBe(1)
    expect(plan.totalLateMinutes).toBe(7)
  })

  it('behaves like a pure distance optimizer when no stop has windows', () => {
    const near = stopAt('near', 0, 0.02)
    const far = stopAt('far', 0, 0.06)
    const withShift = optimizeRoute(ORIGIN, [far, near], { shiftStartMinutes: 480 })
    const withoutShift = optimizeRoute(ORIGIN, [far, near])
    expect(withShift).toEqual(withoutShift)
  })
})
