import { useState, useEffect, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents, useMap } from 'react-leaflet'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { Button } from '@/components/ui/Button'
import { Field, inputClasses } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import type { ActionLabel } from '@/lib/actionLabel'
import { translateAction } from '@/lib/actionLabel'
import { tryCreateOrder } from '@/lib/orders'
import { haversineKm, DEFAULT_SERVICE_MINUTES, parseHhmm } from '@/lib/routing'
import { reverseGeocode } from '@/lib/geocoding'
import { db, newId, useCollection, useSettings } from '@/lib/store'
import { CITY_BOUNDS } from '@/config/location'
import type { Product } from '@/types'

/** Beyond this many kilometers from the depot, creation shows a caution. */
const FAR_FROM_DEPOT_KM = 40

/** Delivery location pin icon on the map. */
const DELIVERY_ICON = L.divIcon({
  html: '<div class="map-pin map-pin-delivery">📦</div>',
  className: 'map-pin-wrapper',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

/** Click-to-place delivery location on the map. */
function DeliveryPlacer({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

/** Ensures map size is updated when modal opens (fixes invisible map in modals). */
function MapSizeFixer() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface Row {
  productId: string
  qty: string
}

export default function NewOrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const products = useCollection(db.products)
  const settings = useSettings()

  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  /** Depot coordinates as the default drop-off point (from Settings). */
  const [lat, setLat] = useState(String(settings.depot.lat))
  const [lng, setLng] = useState(String(settings.depot.lng))
  const [rows, setRows] = useState<Row[]>(() => {
    if (products.length === 0) return []
    return [{ productId: products[0].id, qty: '1' }]
  })
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [serviceMinutes, setServiceMinutes] = useState('5')
  const [error, setError] = useState<ActionLabel | null>(null)

  // Track whether user has manually edited coordinates
  const userEditedCoordsRef = useRef(false)

  // Sync lat/lng with settings.depot when it changes, unless user has edited
  useEffect(() => {
    if (!userEditedCoordsRef.current) {
      setLat(String(settings.depot.lat))
      setLng(String(settings.depot.lng))
    }
  }, [settings.depot.lat, settings.depot.lng])

  // Non-blocking caution while typing: straight-line distance from the
  // edited point to the depot (orders have no edit surface — creation is
  // the only place coordinates are entered by hand).
  const parsedLat = Number.parseFloat(lat)
  const parsedLng = Number.parseFloat(lng)
  const positionValid = Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
  const distanceKm = positionValid
    ? haversineKm(settings.depot, { lat: parsedLat, lng: parsedLng })
    : 0
  const farFromDepot = positionValid && distanceKm > FAR_FROM_DEPOT_KM

  // Delivery window validation (derived during render for inline feedback)
  const windowStartMinutes = windowStart ? parseHhmm(windowStart) : null
  const windowEndMinutes = windowEnd ? parseHhmm(windowEnd) : null
  const windowIncomplete = (windowStart && !windowEnd) || (!windowStart && windowEnd)
  const windowInvalid = windowStartMinutes !== null && windowEndMinutes !== null && windowStartMinutes >= windowEndMinutes
  const windowErrorKey = windowIncomplete ? 'errors.windowIncomplete' : windowInvalid ? 'errors.windowInvalid' : null

  // Map state for delivery location picker
  const [mapCenter, setMapCenter] = useState({ lat: parsedLat, lng: parsedLng })

  async function handleMapClick(clickedLat: number, clickedLng: number) {
    const clampedLat = clamp(clickedLat, CITY_BOUNDS.minLat, CITY_BOUNDS.maxLat)
    const clampedLng = clamp(clickedLng, CITY_BOUNDS.minLng, CITY_BOUNDS.maxLng)
    setLat(clampedLat.toFixed(4))
    setLng(clampedLng.toFixed(4))
    setMapCenter({ lat: clampedLat, lng: clampedLng })
    userEditedCoordsRef.current = true

    // Reverse geocode the clicked location to fill the address field
    try {
      const address = await reverseGeocode(clampedLat, clampedLng)
      if (address) setAddress(address)
    } catch {
      // Silently fail - user can still type manually
    }
  }

  function setRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setRows((current) => [...current, { productId: products[0]?.id ?? '', qty: '1' }])
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const items = rows.flatMap((row) => {
      const qty = Math.floor(Number(row.qty) || 0)
      return qty > 0 && row.productId ? [{ productId: row.productId, qty }] : []
    })
    const name = customerName.trim()
    const destination = address.trim()

    if (!name || items.length === 0) {
      setError({ key: 'errors.orderFieldsRequired' })
      return
    }

    // Delivery window: optional, but complete and sensible when given.
    if ((windowStart && !windowEnd) || (!windowStart && windowEnd)) {
      setError({ key: 'errors.windowIncomplete' })
      return
    }
    if (windowStart && windowEnd) {
      const start = parseHhmm(windowStart)
      const end = parseHhmm(windowEnd)
      if (start === null || end === null || start >= end) {
        setError({ key: 'errors.windowInvalid' })
        return
      }
    }

    // Service time: optional override of the 5-minute default.
    const service =
      serviceMinutes.trim() === '' ? undefined : Math.floor(Number(serviceMinutes) || 0)
    if (service !== undefined && (service < 0 || service > 240)) {
      setError({ key: 'errors.serviceRange' })
      return
    }

    const result = tryCreateOrder({
      id: newId('ord'),
      customerName: name,
      address: destination,
      lat: Number.parseFloat(lat) || 0,
      lng: Number.parseFloat(lng) || 0,
      items,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deliveryWindowStart: windowStart || undefined,
      deliveryWindowEnd: windowEnd || undefined,
      serviceMinutes: service ?? DEFAULT_SERVICE_MINUTES,
    })

    if (result.ok) {
      onClose()
    } else {
      setError(result.error ?? { key: 'errors.cannotCreateOrder' })
    }
  }

  return (
    <Modal
      title={t('orders.formTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="order-form" disabled={products.length === 0}>
            {t('orders.createOrder')}
          </Button>
        </>
      }
    >
      <form id="order-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-300">
            {translateAction(error)}
          </p>
        )}

        <Field label={t('orders.fieldName')}>
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder={t('orders.fieldNamePlaceholder')}
            className={inputClasses}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field label={t('orders.fieldAddress')}>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t('orders.fieldAddressPlaceholder')}
            className={inputClasses}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">{t('orders.addressOptional')}</p>
        </Field>

        {/* Click-to-place delivery location map */}
        <div className="relative z-0 isolate h-64 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={15}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DeliveryPlacer onPick={handleMapClick} />
            <MapSizeFixer />
            {positionValid && (
              <Marker position={[parsedLat, parsedLng]} icon={DELIVERY_ICON} />
            )}
          </MapContainer>
        </div>
        <p className="text-xs text-slate-500 text-center mt-1">
          {t('orders.mapHint')}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('orders.fieldLat')}>
            <input
              value={lat}
              onChange={(event) => {
                userEditedCoordsRef.current = true
                setLat(event.target.value)
              }}
              inputMode="decimal"
              autoComplete="off"
              className={inputClasses}
            />
          </Field>
          <Field label={t('orders.fieldLng')}>
            <input
              value={lng}
              onChange={(event) => {
                userEditedCoordsRef.current = true
                setLng(event.target.value)
              }}
              inputMode="decimal"
              autoComplete="off"
              className={inputClasses}
            />
          </Field>
        </div>

        {farFromDepot && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-300">
            {t('orders.farFromDepot', {
              km: Math.round(distanceKm),
              city: settings.cityName,
            })}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('orders.fieldWindowStart')}>
            <input
              type="time"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
              className={`${inputClasses} ${windowErrorKey && windowStart ? 'ring-red-500 border-red-300' : ''}`}
              aria-invalid={windowErrorKey && !!windowStart}
              aria-describedby={windowErrorKey && windowStart ? 'window-start-error' : undefined}
              max={windowEnd || undefined}
            />
            {windowErrorKey && windowStart && (
              <p id="window-start-error" className="mt-1 text-xs text-red-600" role="alert">
                {t(windowErrorKey)}
              </p>
            )}
          </Field>
          <Field label={t('orders.fieldWindowEnd')}>
            <input
              type="time"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
              className={`${inputClasses} ${windowErrorKey && windowEnd ? 'ring-red-500 border-red-300' : ''}`}
              aria-invalid={windowErrorKey && !!windowEnd}
              aria-describedby={windowErrorKey && windowEnd ? 'window-end-error' : undefined}
              min={windowStart || undefined}
            />
            {windowErrorKey && windowEnd && (
              <p id="window-end-error" className="mt-1 text-xs text-red-600" role="alert">
                {t(windowErrorKey)}
              </p>
            )}
          </Field>
          <Field label={t('orders.fieldService')}>
            <input
              value={serviceMinutes}
              onChange={(event) => setServiceMinutes(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className={inputClasses}
            />
          </Field>
        </div>

        {products.length === 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-300">
            <p className="mb-2">{t('orders.addProductsFirst')}</p>
            <button
              type="button"
              onClick={() => { onClose(); window.location.hash = '#/products'; }}
              className="text-sm font-medium text-amber-700 underline hover:text-amber-900"
            >
              {t('orders.goToProducts')}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('orders.itemsTitle')}
            </p>
            <div className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={row.productId}
                    onChange={(event) => setRow(index, { productId: event.target.value })}
                    className={inputClasses}
                    aria-label={t('orders.productAria')}
                  >
                    {products.map((product: Product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.qty}
                    onChange={(event) => setRow(index, { qty: event.target.value })}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={t('orders.quantityAria')}
                    className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-base sm:w-20 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label={t('orders.removeItemAria')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9"
                    disabled={rows.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-slate-600 transition hover:text-slate-900 md:min-h-0"
            >
              {t('orders.addAnotherItem')}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}
