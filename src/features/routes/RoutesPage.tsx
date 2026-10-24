import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { advanceOrder, markOrderFailed } from '@/lib/orders'
import { isActiveAssignment, startDriverRoute } from '@/lib/dispatch'
import { formatMinutes } from '@/lib/format'
import {
  AVERAGE_SPEED_KMH,
  evaluateTour,
  formatHhmm,
  optimizeRoute,
  parseHhmm,
  scheduleTour,
  tourDistanceKm,
  DEFAULT_SERVICE_MINUTES,
  DEFAULT_SHIFT_START_MINUTES,
  type GeoPoint,
  type Stop,
  type TourSchedule,
  type TravelMatrix,
} from '@/lib/routing'
import { getDistanceMatrix, getRouteGeometry } from '@/lib/roadRouting'
import { db, runTransaction, useCollection } from '@/lib/store'
import { driverStatusLabel, DRIVER_STATUS_TONE } from '@/lib/status'
import type { Order } from '@/types'

import RouteMap from './RouteMap'

/** Depot: central Casablanca. Both ends of every driver's round trip. */
const DEPOT: GeoPoint = { lat: 33.5731, lng: -7.5898 }

function stopOf(order: Order): Stop {
  return {
    id: order.id,
    lat: order.lat,
    lng: order.lng,
    label: order.customerName,
    windowStart: order.deliveryWindowStart,
    windowEnd: order.deliveryWindowEnd,
    serviceMinutes: order.serviceMinutes ?? DEFAULT_SERVICE_MINUTES,
  }
}

export default function RoutesPage() {
  // Subscribes to the language so the driver status badge updates instantly on switch.
  useTranslation()
  const drivers = useCollection(db.drivers)
  const orders = useCollection(db.orders)
  const routePlans = useCollection(db.routePlans)

  const [driverId, setDriverId] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  /** Driver shift start as "HH:MM" (default 08:00). */
  const [shiftStart, setShiftStart] = useState('08:00')
  /** True when OSRM is unreachable and straight-line estimates are shown. */
  const [approximate, setApproximate] = useState(false)
  /**
   * Baseline cost of the CURRENT stop order, measured the same way the
   * optimized plan is measured (same matrix, same metrics) so the
   * before/after comparison is apples to apples. null = not loaded yet.
   */
  const [baseline, setBaseline] = useState<{ distanceKm: number; minutes: number } | null>(null)
  /** ETAs of the currently displayed stop order (async, haversine fallback). */
  const [schedule, setSchedule] = useState<TourSchedule | null>(null)
  /** Real road geometry ([lat, lng] pairs) of the currently displayed route. */
  const [roadPath, setRoadPath] = useState<Array<[number, number]> | null>(null)

  const driver = drivers.find((candidate) => candidate.id === driverId)
  const driverOrders = orders.filter(
    (order) => order.driverId === driverId && isActiveAssignment(order),
  )
  const shiftStartMinutes = parseHhmm(shiftStart) ?? DEFAULT_SHIFT_START_MINUTES

  // The optimized stop order lives in the store (one entry per driver),
  // so it is undoable and survives reloads. Drops of orders that are no
  // longer active for this driver.
  const savedPlan = routePlans.find((record) => record.driverId === driverId)?.plan
  const activeStopIds = new Set(driverOrders.map((order) => order.id))
  const optimizedStops: Stop[] | null =
    savedPlan && savedPlan.stops.some((stop) => activeStopIds.has(stop.id))
      ? savedPlan.stops.filter((stop) => activeStopIds.has(stop.id))
      : null
  const isOptimized = optimizedStops !== null
  const displayedStops: Stop[] = optimizedStops ?? driverOrders.map(stopOf)

  function handleDriverChange(next: string) {
    setDriverId(next)
  }

  async function handleOptimize() {
    if (!driver || optimizing || driverOrders.length === 0) return
    const activeStops = driverOrders.map(stopOf)
    const points = [DEPOT, ...activeStops]
    setOptimizing(true)
    try {
      let matrix: TravelMatrix | undefined
      try {
        matrix = await getDistanceMatrix(points)
        setApproximate(false)
      } catch {
        // OSRM down/timed out: fall back to straight-line costs.
        matrix = undefined
        setApproximate(true)
      }
      const baselineTour = evaluateTour(points, matrix)
      const baselineLateCount = scheduleTour(DEPOT, activeStops, {
        matrix,
        shiftStartMinutes,
      }).lateCount
      let saved = 0
      let lateSaved = 0
      // Persisting the plan is ONE undoable step; the label resolves once
      // the savings are final so the toast can report them.
      runTransaction(
        () => {
          const latesText =
            lateSaved > 0
              ? ` — avoids ${lateSaved} late stop${lateSaved === 1 ? '' : 's'}`
              : ''
          return saved > 0.05
            ? `Optimized ${driver.name}'s route — saves about ${saved.toFixed(1)} km${latesText}`
            : `Optimized ${driver.name}'s route${latesText || ' — already in the best order'}`
        },
        () => {
          const plan = optimizeRoute(DEPOT, activeStops, {
            matrix,
            shiftStartMinutes,
          })
          saved = baselineTour.distanceKm - plan.distanceKm
          lateSaved = Math.max(0, baselineLateCount - plan.lateCount)
          const existing = db.routePlans.all().find((record) => record.driverId === driver.id)
          if (existing) {
            db.routePlans.update(driver.id, { plan })
          } else {
            db.routePlans.add({ driverId: driver.id, plan })
          }
        },
      )
      setBaseline(baselineTour)
    } finally {
      setOptimizing(false)
    }
  }

  // Baseline road costs for the unoptimized order — refetched when the
  // driver's active stop set changes. Primitive keys only: driverOrders is
  // a new array every render, so it must NOT appear in the deps.
  const stopsKey = driverOrders.map((order) => order.id).join('|')
  useEffect(() => {
    if (!driverId) {
      setBaseline(null)
      setApproximate(false)
      return
    }
    const points = [DEPOT, ...driverOrders.map(stopOf)]
    if (points.length < 2) {
      setBaseline({ distanceKm: 0, minutes: 0 })
      setApproximate(false)
      return
    }
    let cancelled = false
    getDistanceMatrix(points)
      .then((matrix) => {
        if (cancelled) return
        setApproximate(false)
        setBaseline(evaluateTour(points, matrix))
      })
      .catch(() => {
        if (cancelled) return
        setApproximate(true)
        setBaseline(evaluateTour(points))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, stopsKey])

  // Real road geometry for the displayed order (optimized or not), cached
  // inside roadRouting; dashed straight legs are the fallback rendering.
  const roadKey = displayedStops.map((stop) => stop.id).join('|')
  useEffect(() => {
    if (!driverId || displayedStops.length < 2) {
      setRoadPath(null)
      return
    }
    const points: GeoPoint[] = [DEPOT, ...displayedStops]
    let cancelled = false
    setRoadPath(null)
    getRouteGeometry(points)
      .then((path) => {
        if (!cancelled) setRoadPath(path)
      })
      .catch(() => {
        if (!cancelled) setRoadPath(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, roadKey])

  // ETAs + lateness for the displayed stop order. Window and service data
  // come from the CURRENT orders; road durations from a matrix on the
  // displayed order (haversine fallback when OSRM is unreachable).
  const displayKey = displayedStops.map((stop) => stop.id).join('|')
  const shiftKey = String(shiftStartMinutes)
  useEffect(() => {
    if (!driverId || displayedStops.length === 0) {
      setSchedule(null)
      return
    }
    const byId = new Map(orders.map((order) => [order.id, order]))
    // Same stop order, but fresh window/service data from the orders table.
    const stops = displayedStops.map((stop) => {
      const order = byId.get(stop.id)
      return order ? stopOf(order) : stop
    })
    let cancelled = false
    setSchedule(null)
    getDistanceMatrix([DEPOT, ...stops])
      .then((matrix) => {
        if (!cancelled) {
          setSchedule(scheduleTour(DEPOT, stops, { matrix, shiftStartMinutes }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSchedule(scheduleTour(DEPOT, stops, { shiftStartMinutes }))
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, displayKey, shiftKey])

  // Baseline (road) numbers with the haversine estimate as the immediate
  // fallback while the matrix is loading or unusable.
  const haversineKm = tourDistanceKm(DEPOT, driverOrders.map(stopOf))
  const baselineKm = baseline?.distanceKm ?? haversineKm
  const baselineMinutes = baseline?.minutes ?? Math.round((haversineKm / AVERAGE_SPEED_KMH) * 60)

  const savedKm = isOptimized && savedPlan ? baselineKm - savedPlan.distanceKm : 0
  const savedPercent =
    isOptimized && savedPlan && baselineKm > 0 ? (savedKm / baselineKm) * 100 : 0

  return (
    <>
      <PageHeader
        title="Routes"
        description="Round trips for each driver: depot → stops → depot. Hover a pin for details."
        actions={
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <label className="flex items-center gap-1.5 text-sm text-slate-500">
              Shift
              <input
                type="time"
                value={shiftStart}
                onChange={(event) => setShiftStart(event.target.value)}
                className={`${inputClasses} w-28 px-2 py-1.5`}
                aria-label="Shift start time"
              />
            </label>
            <select
              value={driverId}
              onChange={(event) => handleDriverChange(event.target.value)}
              className={`${inputClasses} w-full sm:w-64`}
            >
              <option value="">— Select a driver —</option>
              {drivers.map((driver) => {
                const count = orders.filter(
                  (order) => order.driverId === driver.id && isActiveAssignment(order),
                ).length
                return (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({count} order{count === 1 ? '' : 's'})
                  </option>
                )
              })}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-[460px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <RouteMap
            depot={DEPOT}
            stops={displayedStops}
            beforeStops={isOptimized ? driverOrders.map(stopOf) : null}
            roadPath={roadPath}
          />
        </div>

        <aside className="flex flex-col gap-4">
          {driver && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{driver.name}</h2>
                <Badge tone={DRIVER_STATUS_TONE[driver.status]}>
                  {driverStatusLabel(driver.status)}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">{driver.vehicle}</p>

              {approximate && (
                <p className="mt-2">
                  <Badge tone="amber">≈ approximate distances</Badge>
                </p>
              )}

              <Button
                className="mt-3 w-full"
                onClick={handleOptimize}
                disabled={driverOrders.length === 0 || optimizing}
              >
                {optimizing ? '⏳ Optimizing…' : '⚡ Optimize route'}
              </Button>

              <Button
                className="mt-2 w-full"
                onClick={() => startDriverRoute(driver.id)}
                disabled={!driverOrders.some((order) => order.status === 'assigned')}
              >
                ▶ Start route
              </Button>

              {driverOrders.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No active orders for this driver yet.
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">Distance</dt>
                    <dd className="font-semibold text-slate-900">
                      {(isOptimized && savedPlan ? savedPlan.distanceKm : baselineKm).toFixed(1)} km
                      {!isOptimized && <span className="ml-1 text-xs font-normal text-slate-400">unoptimized</span>}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">Est. time</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatMinutes(
                        isOptimized && savedPlan ? savedPlan.estimatedMinutes : baselineMinutes,
                      )}
                      {approximate && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          @ {AVERAGE_SPEED_KMH} km/h
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">Schedule (during {formatHhmm(shiftStartMinutes)})</dt>
                    <dd className="font-semibold text-slate-900">
                      {schedule ? (
                        <>
                          back by {formatHhmm(schedule.endAt)} ·{' '}
                          {formatMinutes(schedule.endAt - shiftStartMinutes)} door-to-door
                        </>
                      ) : (
                        <span className="font-normal text-slate-400">computing…</span>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">Late stops</dt>
                    <dd
                      className={`font-semibold ${
                        schedule && schedule.lateCount > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {schedule
                        ? schedule.lateCount === 0
                          ? 'None — all windows met'
                          : `${schedule.lateCount} late · ${schedule.totalLateMinutes} min total`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}

              {isOptimized && driverOrders.length >= 2 && (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <p className="font-medium">Saved {savedKm.toFixed(1)} km ({savedPercent.toFixed(0)}%)</p>
                  <p className="mt-0.5 text-xs text-emerald-600">
                    {baselineKm.toFixed(1)} km / {formatMinutes(baselineMinutes)} →{' '}
                    {savedPlan!.distanceKm.toFixed(1)} km /{' '}
                    {formatMinutes(savedPlan!.estimatedMinutes)}
                  </p>
                </div>
              )}
            </div>
          )}

          {driver && driverOrders.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Stops {isOptimized && <span className="font-normal normal-case">(optimized)</span>}
              </h3>
              <ol className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <span className="map-pin-wrapper flex">
                    <span className="map-pin map-pin-depot" style={{ height: 22, width: 22, fontSize: 11 }}>
                      🚚
                    </span>
                  </span>
                  <span className="text-slate-500">Depot — start &amp; end</span>
                </li>
                {displayedStops.map((stop, index) => {
                  const order = orders.find((candidate) => candidate.id === stop.id)
                  const inTransit = order?.status === 'in_transit'
                  const entry = schedule?.entries.find(
                    (candidate) => candidate.stopId === stop.id,
                  )
                  const late = (entry?.lateMinutes ?? 0) > 0
                  return (
                    <li key={stop.id} className="flex items-center gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">
                          {order?.customerName ?? 'Unknown'}
                        </span>{' '}
                        <span className="text-xs text-slate-400">{order?.address}</span>
                        {order?.deliveryWindowStart && order?.deliveryWindowEnd && (
                          <span className="ml-1 whitespace-nowrap text-xs text-slate-400">
                            ⏰ {order.deliveryWindowStart}–{order.deliveryWindowEnd}
                          </span>
                        )}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <span
                          className={`whitespace-nowrap text-xs tabular-nums ${
                            schedule
                              ? late
                                ? 'font-medium text-red-600'
                                : 'text-slate-500'
                              : 'text-slate-300'
                          }`}
                        >
                          {entry
                            ? late
                              ? `${formatHhmm(entry.arrivalAt)} · ${entry.lateMinutes}m late`
                              : `ETA ${formatHhmm(entry.arrivalAt)}`
                            : 'ETA —'}
                        </span>
                        {inTransit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => advanceOrder(order!)}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                            >
                              ✓ Delivered
                            </button>
                            <button
                              type="button"
                              onClick={() => markOrderFailed(order!)}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              ✕ Failed
                            </button>
                          </>
                        ) : (
                          order?.status === 'assigned' && (
                            <span className="text-xs text-slate-400">awaiting start</span>
                          )
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-2 text-xs text-slate-400">
                {driverOrders.some((order) => order.status === 'in_transit')
                  ? 'Route running — mark each stop as it completes.'
                  : 'Press “Start route” to put every stop in transit.'}
              </p>
            </div>
          )}

          {!driverId && (
            <EmptyState
              icon="🗺️"
              message={
                drivers.length === 0
                  ? 'Add a driver and assign orders to plan a route.'
                  : 'Pick a driver above to see their stops around Casablanca.'
              }
            />
          )}
        </aside>
      </div>
    </>
  )
}
