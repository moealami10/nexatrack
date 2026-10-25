import { useEffect } from 'react'
import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'

import { location } from '@/config/location'
import type { GeoPoint, Stop } from '@/lib/routing'

function numberIcon(n: number, large: boolean): L.DivIcon {
  return L.divIcon({
    html: `<div class="map-pin">${n}</div>`,
    className: large ? 'map-pin-wrapper map-pin-lg' : 'map-pin-wrapper',
    iconSize: large ? [44, 44] : [26, 26],
    iconAnchor: large ? [22, 22] : [13, 13],
  })
}

function depotIcon(large: boolean): L.DivIcon {
  return L.divIcon({
    html: '<div class="map-pin map-pin-depot">🚚</div>',
    className: large ? 'map-pin-wrapper map-pin-lg' : 'map-pin-wrapper',
    iconSize: large ? [44, 44] : [26, 26],
    iconAnchor: large ? [22, 22] : [13, 13],
  })
}

function toLatLng(point: GeoPoint): LatLngExpression {
  return [point.lat, point.lng]
}

const TOOLTIP_OPTIONS = { direction: 'top' as const, offset: [0, -14] as L.PointExpression }

/** Flies to `focusStopId` whenever it changes (list row → map centering). */
function FocusController({
  focusStopId,
  stops,
}: {
  focusStopId: string | null
  stops: Stop[]
}) {
  const map = useMap()
  useEffect(() => {
    if (!focusStopId) return
    const stop = stops.find((candidate) => candidate.id === focusStopId)
    if (stop) {
      map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 15), { duration: 0.4 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStopId])
  return null
}

/**
 * OpenStreetMap sketch of a driver's round trip: depot at the center,
 * numbered stops in visiting order, and the route as a polyline — the real
 * road geometry when available, straight legs as the fallback. When an
 * optimized plan exists, the "before" (unoptimized) path is shown dashed
 * for comparison. On touch devices the pins get a 44px hit area and marker
 * taps report back so the stop list can scroll the matching row into view.
 */
export default function RouteMap({
  depot,
  stops,
  beforeStops,
  roadPath,
  focusStopId = null,
  largeHit = false,
  onStopClick,
}: {
  depot: GeoPoint
  stops: Stop[]
  beforeStops?: Stop[] | null
  /** Real road geometry ([lat, lng] pairs) through the stops in visit order. */
  roadPath?: Array<[number, number]> | null
  /** Stop the map should center on (set from the stop list on mobile). */
  focusStopId?: string | null
  /** 44px invisible hit area around each pin (touch devices). */
  largeHit?: boolean
  /** Called when a stop marker is tapped (marker → list linking). */
  onStopClick?: (stopId: string) => void
}) {
  const afterPositions: LatLngExpression[] = [depot, ...stops, depot].map(toLatLng)
  const beforePositions: LatLngExpression[] | null = beforeStops
    ? [depot, ...beforeStops, depot].map(toLatLng)
    : null
  const mainPath = roadPath && roadPath.length >= 2 ? roadPath : afterPositions
  const { t } = useTranslation()

  return (
    <MapContainer center={toLatLng(depot)} zoom={location.defaultZoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FocusController focusStopId={focusStopId} stops={stops} />

      <Marker position={toLatLng(depot)} icon={depotIcon(largeHit)}>
        <Tooltip {...TOOLTIP_OPTIONS}>{t('routes.mapDepotTooltip')}</Tooltip>
      </Marker>

      {stops.map((stop, index) => (
        <Marker
          key={stop.id}
          position={toLatLng(stop)}
          icon={numberIcon(index + 1, largeHit)}
          eventHandlers={{ click: () => onStopClick?.(stop.id) }}
        >
          <Tooltip {...TOOLTIP_OPTIONS}>
            {index + 1}. {stop.label ?? stop.id}
          </Tooltip>
        </Marker>
      ))}

      {stops.length >= 1 &&
        (beforePositions ? (
          <>
            <Polyline
              positions={beforePositions}
              pathOptions={{ color: '#94a3b8', dashArray: '6 8', weight: 2 }}
            />
            <Polyline
              positions={mainPath}
              pathOptions={{ color: '#0284c7', weight: 3, opacity: 0.9 }}
            />
          </>
        ) : (
          <Polyline
            positions={mainPath}
            pathOptions={{ color: '#64748b', weight: 3, opacity: 0.9 }}
          />
        ))}
    </MapContainer>
  )
}
