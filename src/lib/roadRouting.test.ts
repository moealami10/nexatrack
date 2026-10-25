import { afterEach, describe, expect, it, vi } from 'vitest'

import { haversineKm } from './routing'
import { getDistanceMatrix, getRouteGeometry, roadCacheSize } from './roadRouting'

/**
 * OSRM integration. All network I/O is stubbed; each test uses coordinates
 * spaced far apart so the module's in-memory caches never collide.
 */

const BASE = 'https://router.project-osrm.org'

/** Geographic points, offset by `index * 10°` of latitude → unique cache keys. */
function pointsAt(index: number) {
  return [
    { lat: 27.1536 + index * 10, lng: -13.2033 },
    { lat: 27.16 + index * 10, lng: -13.19 },
    { lat: 27.17 + index * 10, lng: -13.18 },
  ]
}

interface Stub {
  calls: () => number
  urls: () => string[]
}

/** Stubs global fetch to answer with a fixed OSRM-shaped body. */
function stubFetch(body: unknown, status = 200): Stub {
  const urls: string[] = []
  let calls = 0
  const fetchMock = vi.fn((url: string | URL | Request) => {
    calls++
    urls.push(String(url))
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls: () => calls, urls: () => urls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDistanceMatrix (OSRM Table API)', () => {
  it('parses meters→km and seconds→min, requesting lng,lat pairs', async () => {
    const stub = stubFetch({
      code: 'Ok',
      distances: [
        [0, 3000, 5000],
        [3000, 0, 2500],
        [5000, 2500, 0],
      ],
      durations: [
        [0, 240, 600],
        [240, 0, 180],
        [600, 180, 0],
      ],
    })
    const matrix = await getDistanceMatrix(pointsAt(0))

    // Units converted: 3000 m → 3 km, 180 s → 3 min.
    expect(matrix.distancesKm[0]![1]).toBe(3)
    expect(matrix.distancesKm[2]![1]).toBe(2.5)
    expect(matrix.durationsMin[0]![1]).toBe(4)
    expect(matrix.durationsMin[1]![2]).toBe(3)
    expect(matrix.distancesKm[0]![0]).toBe(0)

    // URL wants lng before lat, semicolon-joined, with both annotations.
    expect(stub.urls()[0]).toBe(
      `${BASE}/table/v1/driving/` +
        '-13.203300,27.153600;-13.190000,27.160000;-13.180000,27.170000' +
        '?annotations=distance,duration',
    )
  })

  it('rejects on an OSRM error code', async () => {
    stubFetch({ code: 'NoSegment' })
    await expect(getDistanceMatrix(pointsAt(1))).rejects.toThrow('NoSegment')
  })

  it('rejects on a wrong-shaped table response', async () => {
    stubFetch({ code: 'Ok', distances: [[0, 1]], durations: [[0, 1]] })
    await expect(getDistanceMatrix(pointsAt(2))).rejects.toThrow('shape')
  })

  it('falls back to haversine per unreachable (null) cell', async () => {
    const points = pointsAt(3).slice(0, 2)
    const [p0, p1] = points
    stubFetch({
      code: 'Ok',
      distances: [
        [0, null],
        [2000, 0],
      ],
      durations: [
        [0, null],
        [120, 0],
      ],
    })
    const matrix = await getDistanceMatrix(points)

    expect(matrix.distancesKm[0]![1]).toBeCloseTo(haversineKm(p0!, p1!), 6)
    expect(matrix.distancesKm[1]![0]).toBe(2)
    // Null duration falls back to flat speed over the haversine distance.
    expect(matrix.durationsMin[0]![1]).toBe(
      Math.round((haversineKm(p0!, p1!) / 30) * 60),
    )
    expect(matrix.durationsMin[1]![0]).toBe(2)
  })

  it('rejects after the 5 s timeout even if fetch never settles', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => {})), // never resolves
      )
      const promise = getDistanceMatrix(pointsAt(9))
      const assertion = expect(promise).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(5000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getRouteGeometry (OSRM Route API)', () => {
  it('swaps geojson [lng,lat] into Leaflet [lat,lng] pairs', async () => {
    const stub = stubFetch({
      code: 'Ok',
      routes: [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [-13.2033, 67.1536],
              [-13.19, 67.16],
              [-13.18, 67.17],
            ],
          },
        },
      ],
    })
    const path = await getRouteGeometry(pointsAt(4))

    expect(path).toEqual([
      [67.1536, -13.2033],
      [67.16, -13.19],
      [67.17, -13.18],
    ])
    expect(stub.urls()[0]).toBe(
      `${BASE}/route/v1/driving/` +
        '-13.203300,67.153600;-13.190000,67.160000;-13.180000,67.170000' +
        '?overview=full&geometries=geojson',
    )
  })

  it('rejects on an error code, missing geometry, and HTTP failures', async () => {
    stubFetch({ code: 'NoRoute' })
    await expect(getRouteGeometry(pointsAt(5))).rejects.toThrow('NoRoute')

    stubFetch({ code: 'Ok', routes: [{}] })
    await expect(getRouteGeometry(pointsAt(6))).rejects.toThrow('geometry')

    stubFetch({ message: 'gateway exploded' }, 502)
    await expect(getRouteGeometry(pointsAt(7))).rejects.toThrow('HTTP 502')
  })
})

describe('caching', () => {
  it('serves repeated calls for the same coordinates without re-fetching', async () => {
    const before = roadCacheSize()
    const stub = stubFetch({
      code: 'Ok',
      distances: [
        [0, 1000],
        [1000, 0],
      ],
      durations: [
        [0, 60],
        [60, 0],
      ],
      routes: [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [-13.2033, 227.1536],
              [-13.19, 227.16],
            ],
          },
        },
      ],
    })

    const points = pointsAt(20).slice(0, 2)
    await getDistanceMatrix(points)
    await getDistanceMatrix(points)
    await getRouteGeometry(points)
    await getRouteGeometry(points)

    // One table request + one route request total, despite four calls made.
    expect(stub.calls()).toBe(2)
    expect(roadCacheSize().matrices).toBe(before.matrices + 1)
    expect(roadCacheSize().geometries).toBe(before.geometries + 1)

    // Coordinates nudged below the cache-key precision still hit the cache.
    const jittered = points.map((point) => ({ ...point, lat: point.lat + 1e-8 }))
    await getDistanceMatrix(jittered)
    expect(stub.calls()).toBe(2)
  })
})
