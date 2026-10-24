/**
 * Pure route optimization for delivery round trips.
 *
 * Strategy: nearest-neighbor for the initial order, then 2-opt segment
 * reversals until no improvement remains. When stops carry delivery
 * windows, lateness wins over distance: nearest-neighbor breaks cost ties
 * by earlier window end, and a 2-opt swap is only accepted if it never
 * increases total lateness.
 *
 * Cost input: callers may pass a `TravelMatrix` (real road distances and
 * durations, e.g. from OSRM — see `lib/roadRouting.ts`). Without one, the
 * optimizer degrades gracefully to straight-line haversine distances and a
 * flat average speed. Either way output is deterministic.
 */

export interface GeoPoint {
  lat: number
  lng: number
}

export interface Stop extends GeoPoint {
  id: string
  /** Display name; carried through optimization untouched. */
  label?: string
  /** Earliest delivery time as "HH:MM"; absent = deliverable anytime. */
  windowStart?: string
  /** Latest delivery time as "HH:MM"; absent = deliverable anytime. */
  windowEnd?: string
  /** Minutes spent at the stop (defaults to DEFAULT_SERVICE_MINUTES). */
  serviceMinutes?: number
}

/** Flat average driving speed used when no road durations are available. */
export const AVERAGE_SPEED_KMH = 30

/** Minutes a driver spends at a stop when none is specified. */
export const DEFAULT_SERVICE_MINUTES = 5

/** Default route start, 08:00 as minutes since midnight. */
export const DEFAULT_SHIFT_START_MINUTES = 8 * 60

const EARTH_RADIUS_KM = 6371
/** Ignore gains smaller than this (km / minutes) to avoid endless loops. */
const IMPROVEMENT_EPSILON = 1e-9

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const half =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(half))
}

/** Parses "HH:MM" (or "H:MM") into minutes since midnight, null if invalid. */
export function parseHhmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Formats minutes since midnight back into "HH:MM" (wraps past midnight). */
export function formatHhmm(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Travel costs between points, indexed [depot, ...stops]. Row i → column j:
 * cost of driving i → j (one-way; road matrices are rarely symmetric).
 * Cells may be `null` (e.g. an unreachable stop); consumers fall back.
 */
export interface TravelMatrix {
  /** Leg distances in kilometers. */
  distancesKm: Array<Array<number | null>>
  /** Leg driving times in whole minutes. */
  durationsMin: Array<Array<number | null>>
}

/** Round-trip distance: depot → every stop in the given order → depot. */
export function tourDistanceKm(depot: GeoPoint, stops: Stop[]): number {
  let total = 0
  let previous: GeoPoint = depot
  for (const stop of stops) {
    total += haversineKm(previous, stop)
    previous = stop
  }
  return total + haversineKm(previous, depot)
}

export interface RoutePlan {
  /** Stops in visiting order; the route starts and ends at the depot. */
  stops: Stop[]
  /** Round-trip distance in kilometers. */
  distanceKm: number
  /** Pure driving time in whole minutes (road durations when available). */
  estimatedMinutes: number
  /** Total lateness across stops, in minutes (0 when everything fits). */
  totalLateMinutes: number
  /** How many stops miss their window in the final tour. */
  lateCount: number
}

// ---------------------------------------------------------------------------
// Leg cost helpers (matrix over [depot, ...points], haversine fallback)
// ---------------------------------------------------------------------------

function legKm(
  points: GeoPoint[],
  matrix: TravelMatrix | undefined,
  i: number,
  j: number,
): number {
  const edge = matrix?.distancesKm[i]?.[j]
  return edge ?? haversineKm(points[i]!, points[j]!)
}

function legMinutes(
  points: GeoPoint[],
  matrix: TravelMatrix | undefined,
  i: number,
  j: number,
): number {
  const edge = matrix?.durationsMin[i]?.[j]
  return edge ?? Math.round((legKm(points, matrix, i, j) / AVERAGE_SPEED_KMH) * 60)
}

// ---------------------------------------------------------------------------
// Time windows, service, and arrival simulation
// ---------------------------------------------------------------------------

/** Parsed window of a stop; inverted/invalid inputs disable the window. */
interface StopWindow {
  start: number | null
  end: number | null
  service: number
}

function windowOf(stop: Stop): StopWindow {
  const start = stop.windowStart ? parseHhmm(stop.windowStart) : null
  const end = stop.windowEnd ? parseHhmm(stop.windowEnd) : null
  const inverted = start !== null && end !== null && start > end
  const service =
    stop.serviceMinutes != null && stop.serviceMinutes >= 0
      ? stop.serviceMinutes
      : DEFAULT_SERVICE_MINUTES
  return {
    start: inverted ? null : start,
    end: inverted ? null : end,
    service,
  }
}

/** Simulated visit result for one stop at a given arrival time. */
export interface StepResult {
  /** Minutes waited for the window to open (0 if open on arrival). */
  waitMinutes: number
  /** Minutes past the window end (0 when within the window). */
  lateMinutes: number
  /** Absolute time (minutes since midnight) when the driver departs. */
  departureAt: number
}

/** Applies window + service: waits when early, flags late, leaves after service. */
export function stepAtStop(stop: Stop, arrivalAt: number): StepResult {
  const window = windowOf(stop)
  const waitMinutes =
    window.start !== null ? Math.max(0, window.start - arrivalAt) : 0
  const lateMinutes =
    window.end !== null ? Math.max(0, arrivalAt - window.end) : 0
  const serviceStart = Math.max(arrivalAt, window.start ?? arrivalAt)
  return { waitMinutes, lateMinutes, departureAt: serviceStart + window.service }
}

/** ETA record for one stop of a scheduled tour. */
export interface StopScheduleEntry extends StepResult {
  stopId: string
  /** Absolute arrival time (minutes since midnight). */
  arrivalAt: number
}

/** Full schedule of a tour: depot → stops in order → depot. */
export interface TourSchedule {
  entries: StopScheduleEntry[]
  totalLateMinutes: number
  lateCount: number
  /** Absolute time the driver is back at the depot. */
  endAt: number
}

/**
 * Walks a fixed stop sequence from `depot` starting at the shift start:
 * travel time per leg, then service (waiting if the stop's window has not
 * opened yet, lateness if the window was already missed).
 * `options.matrix` (if given) must be indexed [depot, ...stops] in exactly
 * this order; otherwise legs use haversine at the flat average speed.
 */
export function scheduleTour(
  depot: GeoPoint,
  stops: Stop[],
  options?: { matrix?: TravelMatrix; shiftStartMinutes?: number },
): TourSchedule {
  const shiftStart = options?.shiftStartMinutes ?? DEFAULT_SHIFT_START_MINUTES
  if (stops.length === 0) {
    return { entries: [], totalLateMinutes: 0, lateCount: 0, endAt: shiftStart }
  }
  const points: GeoPoint[] = [depot, ...stops]
  const min = (i: number, j: number) => legMinutes(points, options?.matrix, i, j)

  const entries: StopScheduleEntry[] = []
  let clock = shiftStart
  let from = 0
  let totalLateMinutes = 0
  let lateCount = 0
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!
    const arrivalAt = clock + min(from, index + 1)
    const step = stepAtStop(stop, arrivalAt)
    entries.push({ stopId: stop.id, arrivalAt, ...step })
    totalLateMinutes += step.lateMinutes
    if (step.lateMinutes > 0) lateCount += 1
    clock = step.departureAt
    from = index + 1
  }
  const endAt = clock + min(from, 0)
  return { entries, totalLateMinutes, lateCount, endAt }
}

/**
 * Sums a fixed point sequence: first point → rest → back to the first.
 * With a matrix it reads leg costs from its rows (fallback per missing
 * cell is haversine/flat-speed); without one it is pure haversine.
 */
export function evaluateTour(
  points: GeoPoint[],
  matrix?: TravelMatrix,
): { distanceKm: number; minutes: number } {
  if (points.length <= 1) return { distanceKm: 0, minutes: 0 }
  let distanceKm = 0
  let minutes = 0
  for (let index = 0; index < points.length; index++) {
    const to = index + 1 < points.length ? index + 1 : 0
    const km = matrix?.distancesKm[index]?.[to] ?? haversineKm(points[index]!, points[to]!)
    const minutesEdge = matrix?.durationsMin[index]?.[to]
    distanceKm += km
    minutes += minutesEdge ?? Math.round((km / AVERAGE_SPEED_KMH) * 60)
  }
  return { distanceKm, minutes }
}

// ---------------------------------------------------------------------------
// Optimizer
// ---------------------------------------------------------------------------

export interface OptimizeOptions {
  /** Road travel matrix indexed [depot, ...stops]; haversine when absent. */
  matrix?: TravelMatrix
  /** Shift start in minutes since midnight (default 08:00). */
  shiftStartMinutes?: number
}

export function optimizeRoute(
  depot: GeoPoint,
  stops: Stop[],
  options: OptimizeOptions = {},
): RoutePlan {
  if (stops.length === 0) {
    return { stops: [], distanceKm: 0, estimatedMinutes: 0, totalLateMinutes: 0, lateCount: 0 }
  }

  // Cost model over [depot, ...stops]: index 0 is the depot.
  const points: GeoPoint[] = [depot, ...stops]
  const matrix = options.matrix
  const shiftStart = options.shiftStartMinutes ?? DEFAULT_SHIFT_START_MINUTES
  const costKm = (i: number, j: number) => legKm(points, matrix, i, j)
  const costMin = (i: number, j: number) => legMinutes(points, matrix, i, j)

  // Total lateness of an index tour — drives the "windows first" rule.
  const latenessOf = (tour: number[]): number => {
    let clock = shiftStart
    let from = 0
    let late = 0
    for (const index of tour) {
      const arrivalAt = clock + costMin(from, index)
      const step = stepAtStop(stops[index - 1]!, arrivalAt)
      late += step.lateMinutes
      clock = step.departureAt
      from = index
    }
    return late
  }

  // Nearest-neighbor ties favour the stop whose window closes first, so
  // urgent drops are visited earlier from the very start.
  const windowEndOf = (index: number): number => {
    const end = stops[index - 1]?.windowEnd ? parseHhmm(stops[index - 1]!.windowEnd!) : null
    return end ?? Number.POSITIVE_INFINITY
  }

  const tour = twoOpt(
    nearestNeighbor(costKm, points.length, windowEndOf),
    costKm,
    latenessOf,
  )
  const ordered = tour.map((index) => stops[index - 1]!)

  let distanceKm = 0
  let estimatedMinutes = 0
  let current = 0
  for (const index of tour) {
    distanceKm += costKm(current, index)
    estimatedMinutes += costMin(current, index)
    current = index
  }
  distanceKm += costKm(current, 0)
  estimatedMinutes += costMin(current, 0)

  // Schedule of the final tour for the lateness summary.
  let clock = shiftStart
  let from = 0
  let totalLateMinutes = 0
  let lateCount = 0
  for (const index of tour) {
    const arrivalAt = clock + costMin(from, index)
    const step = stepAtStop(stops[index - 1]!, arrivalAt)
    totalLateMinutes += step.lateMinutes
    if (step.lateMinutes > 0) lateCount += 1
    clock = step.departureAt
    from = index
  }

  return {
    stops: ordered,
    distanceKm,
    estimatedMinutes: Math.max(1, Math.round(estimatedMinutes)),
    totalLateMinutes,
    lateCount,
  }
}

/** Greedy: from the current index, always visit the cheapest remaining stop. */
function nearestNeighbor(
  costKm: (i: number, j: number) => number,
  pointCount: number,
  windowEndOf?: (index: number) => number,
): number[] {
  const remaining: number[] = []
  for (let index = 1; index < pointCount; index++) remaining.push(index)
  const ordered: number[] = []
  let current = 0
  // Cheapest leg wins; on ties the earlier window end is visited first.
  const beats = (candidate: number, incumbent: number): boolean => {
    const candidateKm = costKm(current, candidate)
    const incumbentKm = costKm(current, incumbent)
    if (candidateKm < incumbentKm - IMPROVEMENT_EPSILON) return true
    if (
      Math.abs(candidateKm - incumbentKm) <= IMPROVEMENT_EPSILON &&
      windowEndOf &&
      windowEndOf(candidate) < windowEndOf(incumbent)
    ) {
      return true
    }
    return false
  }
  while (remaining.length > 0) {
    let nearestIndex = 0
    for (let i = 1; i < remaining.length; i++) {
      if (beats(remaining[i]!, remaining[nearestIndex]!)) {
        nearestIndex = i
      }
    }
    current = remaining[nearestIndex]!
    ordered.push(current)
    remaining.splice(nearestIndex, 1)
  }
  return ordered
}

/**
 * Reverses tour segments [i..j] while the round trip benefits. With a
 * lateness function, lateness rules: a swap is accepted when it reduces
 * total lateness, and only EQUAL-lateness swaps may shorten the distance.
 */
function twoOpt(
  tour: number[],
  costKm: (i: number, j: number) => number,
  latenessOf?: (tour: number[]) => number,
): number[] {
  const route = [...tour]
  const distanceOf = (candidate: number[]): number => {
    let total = 0
    let current = 0
    for (const index of candidate) {
      total += costKm(current, index)
      current = index
    }
    return total + costKm(current, 0)
  }

  let improved = true
  while (improved) {
    improved = false
    let baseDistance = distanceOf(route)
    let baseLateness = latenessOf ? latenessOf(route) : 0
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)]
        const candidateLateness = latenessOf ? latenessOf(candidate) : baseLateness
        const candidateDistance = distanceOf(candidate)
        const lateBetter = candidateLateness < baseLateness - IMPROVEMENT_EPSILON
        const lateEqual = Math.abs(candidateLateness - baseLateness) <= IMPROVEMENT_EPSILON
        const shorter = candidateDistance < baseDistance - IMPROVEMENT_EPSILON
        if (lateBetter || (lateEqual && shorter)) {
          route.splice(0, route.length, ...candidate)
          baseDistance = candidateDistance
          baseLateness = candidateLateness
          improved = true
        }
      }
    }
  }
  return route
}
