/**
 * Road travel data from OSRM (Open Source Routing Machine).
 *
 * - getDistanceMatrix(points): OSRM Table API → per-pair road distances
 *   and driving durations for the optimizer (TravelMatrix).
 * - getRouteGeometry(points):  OSRM Route API → the real road geometry
 *   (geojson LineString) for the map polyline.
 *
 * Base URL: VITE_OSRM_URL (e.g. a self-hosted instance), falling back to
 * the public demo server https://router.project-osrm.org — which is
 * rate-limited and NOT meant for production; self-host OSRM later.
 *
 * Every request is cached in memory by its coordinate key, timed out after
 * 5 s, and treated as fallible: callers fall back to straight-line
 * haversine estimates whenever this module throws.
 */

import { haversineKm, type GeoPoint, type TravelMatrix } from './routing'

const DEFAULT_OSRM_URL = 'https://router.project-osrm.org'
const REQUEST_TIMEOUT_MS = 10_000
/** Coordinate precision used for cache keys and OSRM requests. */
const COORDINATE_PRECISION = 6

export function osrmBaseUrl(): string {
  return (import.meta.env.VITE_OSRM_URL as string | undefined) || DEFAULT_OSRM_URL
}

/** OSRM wants "lng,lat" pairs, semicolon-separated. unlucky but true. */
function requestId(points: GeoPoint[]): string {
  return points
    .map((point) => `${point.lng.toFixed(COORDINATE_PRECISION)},${point.lat.toFixed(COORDINATE_PRECISION)}`)
    .join(';')
}

/** Stable cache key for a point sequence. */
function cacheKey(points: GeoPoint[]): string {
  return points
    .map((point) => `${point.lat.toFixed(COORDINATE_PRECISION)},${point.lng.toFixed(COORDINATE_PRECISION)}`)
    .join('|')
}

export class RoadRoutingError extends Error {}

/** fetch + JSON parse with a hard timeout that works regardless of abort support. */
async function requestJson(url: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RoadRoutingError('OSRM request timed out')),
      REQUEST_TIMEOUT_MS,
    )
  })
  const request = (async () => {
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new RoadRoutingError(`OSRM request failed with HTTP ${response.status}`)
      }
      return (await response.json()) as unknown
    } finally {
      clearTimeout(abortTimer)
    }
  })()
  try {
    return await Promise.race([request, timeout])
  } finally {
    clearTimeout(timer)
  }
}

interface OsrmTableResponse {
  code: string
  distances?: Array<Array<number | null>> // meters
  durations?: Array<Array<number | null>> // seconds
}

interface OsrmRouteResponse {
  code: string
  routes?: Array<{
    geometry?: { type?: string; coordinates?: Array<[number, number]> }
  }>
}

const matrixCache = new Map<string, TravelMatrix>()
const geometryCache = new Map<string, Array<[number, number]>>()

/**
 * Road distance/duration matrix over `points` (indexed in the given order —
 * the optimizer expects [depot, ...stops]). Unreachable pairs (`null`s) fall
 * back to haversine distance and its flat-speed duration so the optimizer
 * never sees holes it cannot handle. Throws on any OSRM failure/timeout —
 * callers catch and fall back to a haversine-only plan.
 */
export async function getDistanceMatrix(points: GeoPoint[]): Promise<TravelMatrix> {
  if (points.length < 2) {
    const n = points.length
    return {
      distancesKm: Array.from({ length: n }, () => Array.from({ length: n }, () => 0)),
      durationsMin: Array.from({ length: n }, () => Array.from({ length: n }, () => 0)),
    }
  }

  const key = cacheKey(points)
  const cached = matrixCache.get(key)
  if (cached) return cached

  const url = `${osrmBaseUrl()}/table/v1/driving/${requestId(points)}?annotations=distance,duration`
  const data = (await requestJson(url)) as OsrmTableResponse
  if (data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new RoadRoutingError(`OSRM table error: ${data.code ?? 'empty response'}`)
  }

  const size = points.length
  const shapeOk =
    data.distances.length >= size &&
    data.distances.every((row) => row?.length >= size) &&
    data.durations.length >= size &&
    data.durations.every((row) => row?.length >= size)
  if (!shapeOk) {
    throw new RoadRoutingError('OSRM table response has the wrong shape')
  }

  const distancesKm = points.map((from, i) =>
    points.map((to, j) => {
      const meters = data.distances?.[i]?.[j]
      if (meters == null) {
        // Unreachable pair: straight-line estimate keeps the optimizer usable.
        return i === j ? 0 : haversineKm(from, to)
      }
      return meters / 1000
    }),
  )
  const durationsMin = points.map((from, i) =>
    points.map((to, j) => {
      const seconds = data.durations?.[i]?.[j]
      if (seconds == null) {
        return i === j ? 0 : Math.round((haversineKm(from, to) / FALLBACK_SPEED_KMH) * 60)
      }
      return Math.round(seconds / 60)
    }),
  )

  const matrix: TravelMatrix = { distancesKm, durationsMin }
  matrixCache.set(key, matrix)
  return matrix
}

/** Flat average speed for haversine fallback durations (km/h). */
const FALLBACK_SPEED_KMH = 30

/**
 * The real road path through `points` in the given order, as an array of
 * [lat, lng] pairs ready for a Leaflet polyline. Throws on any failure —
 * callers catch and keep drawing straight legs.
 */
export async function getRouteGeometry(
  points: GeoPoint[],
): Promise<Array<[number, number]>> {
  if (points.length < 2) return []

  const key = cacheKey(points)
  const cached = geometryCache.get(key)
  if (cached) return cached

  const url = `${osrmBaseUrl()}/route/v1/driving/${requestId(points)}?overview=full&geometries=geojson`
  const data = (await requestJson(url)) as OsrmRouteResponse
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new RoadRoutingError(`OSRM route error: ${data.code ?? 'empty response'}`)
  }
  const coords = data.routes[0]?.geometry?.coordinates
  if (coords?.[0]?.length !== 2) {
    throw new RoadRoutingError('OSRM route response has no geometry')
  }

  // geojson is [lng, lat]; Leaflet wants [lat, lng].
  const path: Array<[number, number]> = coords.map((pair) => [pair[1]!, pair[0]!])
  geometryCache.set(key, path)
  return path
}

/** Number of cached entries (minor helper for tests/diagnostics). */
export function roadCacheSize(): { matrices: number; geometries: number } {
  return { matrices: matrixCache.size, geometries: geometryCache.size }
}
