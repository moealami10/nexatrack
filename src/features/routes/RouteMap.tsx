import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import type { GeoPoint, Stop } from '@/lib/routing'

function numberIcon(n: number): L.DivIcon {
  return L.divIcon({
    html: `<div class="map-pin">${n}</div>`,
    className: 'map-pin-wrapper',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const DEPOT_ICON = L.divIcon({
  html: '<div class="map-pin map-pin-depot">🚚</div>',
  className: 'map-pin-wrapper',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

function toLatLng(point: GeoPoint): LatLngExpression {
  return [point.lat, point.lng]
}

const TOOLTIP_OPTIONS = { direction: 'top' as const, offset: [0, -14] as L.PointExpression }

/**
 * OpenStreetMap sketch of a driver's round trip: depot at the center,
 * numbered stops in visiting order, and the route as a polyline — the real
 * road geometry when available, straight legs as the fallback. When an
 * optimized plan exists, the "before" (unoptimized) path is shown dashed
 * for comparison.
 */
export default function RouteMap({
  depot,
  stops,
  beforeStops,
  roadPath,
}: {
  depot: GeoPoint
  stops: Stop[]
  beforeStops?: Stop[] | null
  /** Real road geometry ([lat, lng] pairs) through the stops in visit order. */
  roadPath?: Array<[number, number]> | null
}) {
  const afterPositions: LatLngExpression[] = [depot, ...stops, depot].map(toLatLng)
  const beforePositions: LatLngExpression[] | null = beforeStops
    ? [depot, ...beforeStops, depot].map(toLatLng)
    : null
  const mainPath = roadPath && roadPath.length >= 2 ? roadPath : afterPositions

  return (
    <MapContainer center={toLatLng(depot)} zoom={12} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={toLatLng(depot)} icon={DEPOT_ICON}>
        <Tooltip {...TOOLTIP_OPTIONS}>Depot — start and end</Tooltip>
      </Marker>

      {stops.map((stop, index) => (
        <Marker key={stop.id} position={toLatLng(stop)} icon={numberIcon(index + 1)}>
          <Tooltip {...TOOLTIP_OPTIONS}>
            {index + 1}. {stop.label ?? stop.id}
          </Tooltip>
        </Marker>
      ))}

      {stops.length >= 2 &&
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
