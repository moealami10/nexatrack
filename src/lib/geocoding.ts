/**
 * Reverse geocoding via OpenStreetMap Nominatim.
 *
 * Converts coordinates (lat, lng) into a human-readable address string.
 * - Uses the public Nominatim API (https://nominatim.openstreetmap.org)
 * - Request timeout: 5 seconds
 * - In-memory cache to avoid duplicate lookups
 * - Proper User-Agent header per Nominatim usage policy
 * - Graceful degradation: returns null on any failure (callers fall back to manual entry)
 */

import type { GeoPoint } from './routing'

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'
const REQUEST_TIMEOUT_MS = 5_000
/** Coordinate precision used for cache keys and API requests. */
const COORDINATE_PRECISION = 6

/** Nominatim requires a descriptive User-Agent. */
function userAgent(): string {
  return 'NexaTrack/1.0 (contact: nexatrack@example.com)'
}

/** Stable cache key for a coordinate pair. */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(COORDINATE_PRECISION)},${lng.toFixed(COORDINATE_PRECISION)}`
}

const addressCache = new Map<string, string>()

/** Custom error for geocoding failures. */
export class GeocodingError extends Error {}

/** fetch + JSON parse with a hard timeout. */
async function requestJson(url: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new GeocodingError('Nominatim request timed out')),
      REQUEST_TIMEOUT_MS,
    )
  })
  const request = (async () => {
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent(),
          'Accept': 'application/json',
        },
      })
      if (!response.ok) {
        throw new GeocodingError(`Nominatim request failed with HTTP ${response.status}`)
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

interface NominatimReverseResponse {
  place_id?: number
  licence?: string
  osm_type?: string
  osm_id?: number
  lat?: string
  lon?: string
  display_name?: string
  address?: {
    road?: string
    house_number?: string
    neighbourhood?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    county?: string
    state?: string
    postcode?: string
    country?: string
    country_code?: string
  }
  error?: string
}

/**
 * Reverse geocode a coordinate pair to a formatted address string.
 * Returns null on any failure (network, timeout, rate limit, invalid response).
 * Results are cached in memory for the session.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng)
  const cached = addressCache.get(key)
  if (cached) return cached

  const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&lat=${lat.toFixed(COORDINATE_PRECISION)}&lon=${lng.toFixed(COORDINATE_PRECISION)}&addressdetails=1`

  try {
    const data = (await requestJson(url)) as NominatimReverseResponse

    if (data.error) {
      throw new GeocodingError(`Nominatim error: ${data.error}`)
    }

    if (!data.display_name) {
      throw new GeocodingError('Nominatim returned no display_name')
    }

    // Use display_name as-is (comma-separated, most specific first)
    // It's already well-formatted for an address field
    const address = data.display_name
    addressCache.set(key, address)
    return address
  } catch {
    // Any failure (network, timeout, parse error, rate limit) -> return null
    // Caller decides how to handle (typically: let user type manually)
    return null
  }
}

/**
 * Format a GeoPoint for use as a cache key or display.
 */
export function formatPoint(point: GeoPoint): string {
  return `${point.lat.toFixed(COORDINATE_PRECISION)}, ${point.lng.toFixed(COORDINATE_PRECISION)}`
}

/** Number of cached entries (for diagnostics). */
export function geocodeCacheSize(): number {
  return addressCache.size
}

/** Clear the geocoding cache. */
export function clearGeocodeCache(): void {
  addressCache.clear()
}