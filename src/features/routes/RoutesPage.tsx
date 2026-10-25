import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { advanceOrder, markOrderFailed } from '@/lib/orders'
import { isActiveAssignment, startDriverRoute } from '@/lib/dispatch'
import { formatMinutes, formatNumber } from '@/lib/format'
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
import { db, runTransaction, useCollection, useSettings } from '@/lib/store'
import type { TranslatableLabel } from '@/lib/store'
import { useIsMobile } from '@/lib/useIsMobile'
import { driverStatusLabel, DRIVER_STATUS_TONE } from '@/lib/status'
import type { Order } from '@/types'

import RouteMap from './RouteMap'

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
  const { t } = useTranslation()
  const drivers = useCollection(db.drivers)
  const orders = useCollection(db.orders)
  const routePlans = useCollection(db.routePlans)
  const settings = useSettings()
  /** Depot from Settings — both ends of every driver's round trip. */
  const depot: GeoPoint = settings.depot

  const [driverId, setDriverId] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  /** Driver shift start as "HH:MM" (default 08:00). */
  const [shiftStart, setShiftStart] = useState('08:00')
  /** Stop centered on the map (mobile: set from stop-list taps). */
  const [focusStopId, setFocusStopId] = useState<string | null>(null)
  /** Collapsible stop panel state (mobile only). */
  const [stopsOpen, setStopsOpen] = useState(false)
  const isMobile = useIsMobile()
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

  /** Marker tap → scroll the matching stop row into view (marker → list). */
  function handleMarkerClick(stopId: string) {
    if (!isMobile) return
    document
      .getElementById(`stop-row-${stopId}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  async function handleOptimize() {
    if (!driver || optimizing || driverOrders.length === 0) return
    const activeStops = driverOrders.map(stopOf)
    const points = [depot, ...activeStops]
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
      const baselineLateCount = scheduleTour(depot, activeStops, {
        matrix,
        shiftStartMinutes,
      }).lateCount
      let saved = 0
      let lateSaved = 0
      // Persisting the plan is ONE undoable step; the structured label
      // resolves once the savings are final so the toast can report them.
      // The km figure is formatted with the active locale at record time.
      runTransaction(
        (): TranslatableLabel => {
          if (saved > 0.05 && lateSaved > 0) {
            return {
              key: 'actions.optimizerSavedLates',
              params: {
                name: driver.name,
                km: formatNumber(saved, 1),
                count: lateSaved,
              },
            }
          }
          if (saved > 0.05) {
            return { key: 'actions.optimizerSaved', params: { name: driver.name, km: formatNumber(saved, 1) } }
          }
          if (lateSaved > 0) {
            return { key: 'actions.optimizerLatesOnly', params: { name: driver.name, count: lateSaved } }
          }
          return { key: 'actions.optimizerNoChange', params: { name: driver.name } }
        },
        () => {
          const plan = optimizeRoute(depot, activeStops, {
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
    const points = [depot, ...driverOrders.map(stopOf)]
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
  // The sequence is a ROUND TRIP (depot → stops → depot): a single stop
  // still draws its out-and-back leg, and multi-stop paths include the
  // final leg home so the drawn line matches the round-trip metrics.
  const roadKey = displayedStops.map((stop) => stop.id).join('|')
  useEffect(() => {
    if (!driverId || displayedStops.length < 1) {
      setRoadPath(null)
      return
    }
    const points: GeoPoint[] = [depot, ...displayedStops, depot]
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
    getDistanceMatrix([depot, ...stops])
      .then((matrix) => {
        if (!cancelled) {
          setSchedule(scheduleTour(depot, stops, { matrix, shiftStartMinutes }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSchedule(scheduleTour(depot, stops, { shiftStartMinutes }))
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, displayKey, shiftKey])

  // Baseline (road) numbers with the haversine estimate as the immediate
  // fallback while the matrix is loading or unusable.
  const haversineKm = tourDistanceKm(depot, driverOrders.map(stopOf))
  const baselineKm = baseline?.distanceKm ?? haversineKm
  const baselineMinutes = baseline?.minutes ?? Math.round((haversineKm / AVERAGE_SPEED_KMH) * 60)

  const savedKm = isOptimized && savedPlan ? baselineKm - savedPlan.distanceKm : 0
  const savedPercent =
    isOptimized && savedPlan && baselineKm > 0 ? (savedKm / baselineKm) * 100 : 0

  const driverControls = (
    <>
      <label className="flex items-center gap-1.5 text-sm text-slate-500">
        {t('routes.shiftLabel')}
        <input
          type="time"
          value={shiftStart}
          onChange={(event) => setShiftStart(event.target.value)}
          className={`${inputClasses} w-28 px-2 py-1.5`}
          aria-label={t('routes.shiftStartAria')}
        />
      </label>
      <select
        value={driverId}
        onChange={(event) => handleDriverChange(event.target.value)}
        className={`${inputClasses} w-full sm:w-64`}
      >
        <option value="">{t('routes.selectDriver')}</option>
        {drivers.map((driver) => {
          const count = orders.filter(
            (order) => order.driverId === driver.id && isActiveAssignment(order),
          ).length
          return (
            <option key={driver.id} value={driver.id}>
              {driver.name} ({t('orders.count', { count })})
            </option>
          )
        })}
      </select>
    </>
  )

  return (
    <>
      <PageHeader
        title={t('routes.title')}
        description={t('routes.description')}
        actions={
          /* On phones the picker/shift/Optimize live in the sticky strip
             below so they stay reachable while the list is scrolled. */
          isMobile ? undefined : <div className="flex w-full items-center justify-end gap-2 sm:w-auto">{driverControls}</div>
        }
      />

      {/* Phone: sticky driver picker + route actions (always reachable) */}
      {isMobile && (
        <div className="sticky top-14 z-sticky -mx-3 mb-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <select
              value={driverId}
              onChange={(event) => handleDriverChange(event.target.value)}
              aria-label={t('routes.selectDriver')}
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm"
            >
              <option value="">{t('routes.selectDriver')}</option>
              {drivers.map((driver) => {
                const count = orders.filter(
                  (order) => order.driverId === driver.id && isActiveAssignment(order),
                ).length
                return (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({count})
                  </option>
                )
              })}
            </select>
            <input
              type="time"
              value={shiftStart}
              onChange={(event) => setShiftStart(event.target.value)}
              aria-label={t('routes.shiftStartAria')}
              className="w-28 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-base sm:text-sm"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              className="min-w-0 flex-1"
              onClick={handleOptimize}
              disabled={!driver || driverOrders.length === 0 || optimizing}
            >
              {optimizing ? t('routes.optimizing') : t('routes.optimize')}
            </Button>
            <Button
              className="min-w-0 flex-1"
              onClick={() => driver && startDriverRoute(driver.id)}
              disabled={!driver || !driverOrders.some((order) => order.status === 'assigned')}
            >
              {t('routes.startRoute')}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-[45dvh] overflow-hidden rounded-xl border border-slate-200 shadow-sm md:h-[460px]">
          <RouteMap
            depot={depot}
            stops={displayedStops}
            beforeStops={isOptimized ? driverOrders.map(stopOf) : null}
            roadPath={roadPath}
            focusStopId={focusStopId}
            largeHit={isMobile}
            onStopClick={handleMarkerClick}
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
                  <Badge tone="amber">{t('routes.approximateBadge')}</Badge>
                </p>
              )}

              {!isMobile && (
                <>
                  <Button
                    className="mt-3 w-full"
                    onClick={handleOptimize}
                    disabled={driverOrders.length === 0 || optimizing}
                  >
                    {optimizing ? t('routes.optimizing') : t('routes.optimize')}
                  </Button>

                  <Button
                    className="mt-2 w-full"
                    onClick={() => startDriverRoute(driver.id)}
                    disabled={!driverOrders.some((order) => order.status === 'assigned')}
                  >
                    {t('routes.startRoute')}
                  </Button>
                </>
              )}

              {driverOrders.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  {t('routes.noActiveOrders')}
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{t('routes.distanceLabel')}</dt>
                    <dd className="font-semibold text-slate-900">
                      {(isOptimized && savedPlan ? savedPlan.distanceKm : baselineKm).toFixed(1)} km
                      {!isOptimized && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          {t('routes.unoptimized')}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{t('routes.timeLabel')}</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatMinutes(
                        isOptimized && savedPlan ? savedPlan.estimatedMinutes : baselineMinutes,
                      )}
                      {approximate && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          {t('routes.speedNote', { speed: AVERAGE_SPEED_KMH })}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">
                      {t('routes.scheduleDuring', { start: formatHhmm(shiftStartMinutes) })}
                    </dt>
                    <dd className="font-semibold text-slate-900">
                      {schedule ? (
                        <>
                          {t('routes.backBy', {
                            end: formatHhmm(schedule.endAt),
                            duration: formatMinutes(schedule.endAt - shiftStartMinutes),
                          })}
                        </>
                      ) : (
                        <span className="font-normal text-slate-400">{t('routes.computing')}</span>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{t('routes.lateStopsLabel')}</dt>
                    <dd
                      className={`font-semibold ${
                        schedule && schedule.lateCount > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {schedule
                        ? schedule.lateCount === 0
                          ? t('routes.lateNone')
                          : t('routes.lateSome', {
                              count: schedule.lateCount,
                              minutes: schedule.totalLateMinutes,
                            })
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}

              {isOptimized && driverOrders.length >= 2 && (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <p className="font-medium">
                    {t('routes.savedKm', { km: savedKm.toFixed(1), percent: savedPercent.toFixed(0) })}
                  </p>
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
              <div className="flex min-h-[44px] items-center justify-between gap-2 md:min-h-0">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('routes.stopsTitle')}{' '}
                  {isOptimized && (
                    <span className="font-normal normal-case">{t('routes.optimizedSuffix')}</span>
                  )}
                </h3>
                {/* Collapsible stop panel on phones */}
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setStopsOpen((open) => !open)}
                    aria-expanded={stopsOpen}
                    className="-mr-2 flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {stopsOpen ? t('routes.hideStops') : t('routes.showStops')}
                    <span aria-hidden="true">{stopsOpen ? '▾' : '▸'}</span>
                  </button>
                )}
              </div>
              {(!isMobile || stopsOpen) && (
                <>
                  <ol className="space-y-1">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="map-pin-wrapper flex">
                        <span className="map-pin map-pin-depot" style={{ height: 22, width: 22, fontSize: 11 }}>
                          🚚
                        </span>
                      </span>
                      <span className="text-slate-500">{t('routes.depotRowLabel')}</span>
                    </li>
                    {displayedStops.map((stop, index) => {
                      const order = orders.find((candidate) => candidate.id === stop.id)
                      const inTransit = order?.status === 'in_transit'
                      const entry = schedule?.entries.find(
                        (candidate) => candidate.stopId === stop.id,
                      )
                      const late = (entry?.lateMinutes ?? 0) > 0
                      return (
                        <li
                          key={stop.id}
                          id={`stop-row-${stop.id}`}
                          onClick={() => setFocusStopId(stop.id)}
                          className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm transition hover:bg-slate-50"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-slate-800">
                              {order?.customerName ?? t('common.unknown')}
                            </span>{' '}
                            <span className="text-xs text-slate-400">{order?.address}</span>
                            {order?.deliveryWindowStart && order?.deliveryWindowEnd && (
                              <span className="ml-1 whitespace-nowrap text-xs text-slate-400">
                                {t('routes.windowBadge', {
                                  start: order.deliveryWindowStart,
                                  end: order.deliveryWindowEnd,
                                })}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 flex-wrap items-center gap-2">
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
                                  ? t('routes.etaLate', {
                                      time: formatHhmm(entry.arrivalAt),
                                      minutes: entry.lateMinutes,
                                    })
                                  : t('routes.etaLabel', { time: formatHhmm(entry.arrivalAt) })
                                : t('routes.etaUnknown')}
                            </span>
                            {inTransit ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    advanceOrder(order!)
                                  }}
                                  className="inline-flex min-h-[44px] items-center rounded px-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 md:min-h-0"
                                >
                                  ✓ {t('status.order.delivered')}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    markOrderFailed(order!)
                                  }}
                                  className="inline-flex min-h-[44px] items-center rounded px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 md:min-h-0"
                                >
                                  ✕ {t('status.order.failed')}
                                </button>
                              </>
                            ) : (
                              order?.status === 'assigned' && (
                                <span className="text-xs text-slate-400">{t('routes.awaitingStart')}</span>
                              )
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="mt-2 text-xs text-slate-400">
                    {driverOrders.some((order) => order.status === 'in_transit')
                      ? t('routes.routeRunningHint')
                      : t('routes.startRouteHint')}
                  </p>
                </>
              )}
            </div>
          )}

          {!driverId && (
            <EmptyState
              icon="🗺️"
              message={
                drivers.length === 0
                  ? t('routes.emptyNoDrivers')
                  : t('routes.emptyPickDriver', { city: settings.cityName })
              }
            />
          )}
        </aside>
      </div>
    </>
  )
}
