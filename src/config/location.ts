/**
 * Single source of truth for WHERE the delivery operation runs: the city,
 * the map view defaults, the depot, and the surrounding area.
 *
 * Everything else in the app derives from this file — the dashboard
 * subtitle, the initial map center/zoom, the auto-assign longitude scale,
 * the seed dataset's bounding box, and the default depot coordinates.
 * The LIVE depot (name + position) is editable at runtime on the Settings
 * page and persisted in localStorage (`nexatrack:v3:settings`); the values
 * below are the shipped defaults it resets to.
 */

/** Default depot position — city center. Editable on the Settings page. */
export const DEFAULT_DEPOT = { lat: 27.1536, lng: -13.2033 }

/** Default map center (city center) and zoom for opening any map. */
export const MAP_CENTER = DEFAULT_DEPOT
export const DEFAULT_ZOOM = 13

/**
 * Loose bounding box around the city, used by the seed-integrity test and
 * by the Settings page to clamp placed/typed depot coordinates.
 */
export const CITY_BOUNDS = {
  minLat: 27.1,
  maxLat: 27.21,
  minLng: -13.27,
  maxLng: -13.12,
}

export const location = {
  /** Display name used in the UI ("in Laayoune", seed test, …). */
  cityName: 'Laayoune',
  /** Name of the depot as shipped (stored as typed once edited). */
  defaultDepotName: 'Main depot',
  /** Shipped depot coordinates (equal to the city center). */
  defaultDepot: DEFAULT_DEPOT,
  /** Where maps open and how close in. */
  mapCenter: MAP_CENTER,
  defaultZoom: DEFAULT_ZOOM,
  /** Area clamp for seed data and depot placement. */
  bounds: CITY_BOUNDS,
  /** Offsets the dates/day keys used by "orders today" and the lists. */
  timezone: 'Africa/El_Aaiun',
} as const
