import { useState } from 'react'
import type { FormEvent } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { CITY_BOUNDS } from '@/config/location'
import { DEFAULT_SETTINGS, resetSettings, useSettings, updateSettings } from '@/lib/store'

const DEPOT_ICON = L.divIcon({
  html: '<div class="map-pin map-pin-depot">🚚</div>',
  className: 'map-pin-wrapper',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : null
}

/** Report every map click as a depot placement. */
function DepotPlacer({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

/**
 * Where the operation runs: city name, depot name, and the depot position
 * (typed coordinates or click-to-place on the map). Saving is ONE undoable
 step; "Reset to defaults" restores the shipped values from
 src/config/location.ts — also undoable.
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettings()

  const [cityName, setCityName] = useState(settings.cityName)
  const [depotName, setDepotName] = useState(settings.depotName)
  const [lat, setLat] = useState(String(settings.depot.lat))
  const [lng, setLng] = useState(String(settings.depot.lng))
  const [saved, setSaved] = useState(false)

  const parsedLat = toNumber(lat)
  const parsedLng = toNumber(lng)
  const validPosition = parsedLat !== null && parsedLng !== null

  function pickOnMap(clickedLat: number, clickedLng: number) {
    setLat(
      clamp(clickedLat, CITY_BOUNDS.minLat, CITY_BOUNDS.maxLat).toFixed(4),
    )
    setLng(
      clamp(clickedLng, CITY_BOUNDS.minLng, CITY_BOUNDS.maxLng).toFixed(4),
    )
    setSaved(false)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validPosition) return
    updateSettings({
      cityName: cityName.trim() || settings.cityName,
      depotName: depotName.trim() || settings.depotName,
      depot: {
        lat: clamp(parsedLat!, CITY_BOUNDS.minLat, CITY_BOUNDS.maxLat),
        lng: clamp(parsedLng!, CITY_BOUNDS.minLng, CITY_BOUNDS.maxLng),
      },
    })
    setSaved(true)
  }

  function handleReset() {
    resetSettings()
    setCityName(DEFAULT_SETTINGS.cityName)
    setDepotName(DEFAULT_SETTINGS.depotName)
    setLat(String(DEFAULT_SETTINGS.depot.lat))
    setLng(String(DEFAULT_SETTINGS.depot.lng))
    setSaved(false)
  }

  const depotMarker: [number, number] = validPosition
    ? [parsedLat!, parsedLng!]
    : [settings.depot.lat, settings.depot.lng]

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <form onSubmit={handleSave} className="flex max-w-xl flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('settings.cityName')}>
            <input
              value={cityName}
              onChange={(event) => {
                setCityName(event.target.value)
                setSaved(false)
              }}
              className={inputClasses}
              autoComplete="off"
            />
          </Field>
          <Field label={t('settings.depotName')}>
            <input
              value={depotName}
              onChange={(event) => {
                setDepotName(event.target.value)
                setSaved(false)
              }}
              className={inputClasses}
              autoComplete="off"
            />
          </Field>
        </div>

        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          {t('settings.depotHint')}
        </p>

        {/* Click-to-place depot map, centered on the current position */}
        <div className="h-64 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <MapContainer
            center={depotMarker}
            zoom={15}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DepotPlacer onPick={pickOnMap} />
            <Marker position={depotMarker} icon={DEPOT_ICON} />
          </MapContainer>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('settings.depotLat')}>
            <input
              value={lat}
              onChange={(event) => {
                setLat(event.target.value)
                setSaved(false)
              }}
              inputMode="decimal"
              autoComplete="off"
              className={inputClasses}
            />
          </Field>
          <Field label={t('settings.depotLng')}>
            <input
              value={lng}
              onChange={(event) => {
                setLng(event.target.value)
                setSaved(false)
              }}
              inputMode="decimal"
              autoComplete="off"
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!validPosition}>
            {t('common.saveChanges')}
          </Button>
          <Button variant="secondary" onClick={handleReset} type="button">
            {t('settings.resetDefaults')}
          </Button>
          <span aria-live="polite" className="text-sm text-emerald-600">
            {saved ? t('settings.saved') : ''}
          </span>
        </div>
      </form>
    </>
  )
}
