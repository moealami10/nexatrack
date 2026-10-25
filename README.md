# 🚚 NexaTrack

A delivery-operations prototype for a Laâyoune-based courier business:
manage products and stock, take orders, dispatch drivers, and plan routes on
a map — all in the browser, no backend required.

Built as a **React + Vite + TypeScript + Tailwind CSS** app, with a
localStorage-backed data layer designed to be swapped for a real API later.

## Quick start

Requires **Node.js 20.19+** (Vite 8 requirement) and npm.

```bash
npm install
npm run dev      # start dev server → http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build (dist/)
npm run preview  # serve the production build locally
npm test         # run the Vitest unit tests (optimizer, seed integrity,
                 # undo/redo, storage migration)
npm run lint     # oxlint
```

The app boots **completely empty** — no products, inventory, orders,
drivers, or route plans. Every page shows an empty state with the suggested
next step (the Dashboard adds a getting-started checklist that ticks itself
off as you go). When you want to see the app in action, use
**📥 Load demo data** in the sidebar: it fills the app with a demo dataset
(15 products, 15 inventory items, 5 drivers, 20 orders around Laâyoune)
in one undoable step. Loading demo data while the app already has content
asks for confirmation first, since it replaces everything. Everything you
change is persisted to `localStorage` immediately — all collection keys are
written up front — use **🗑️ Clear all data** in the sidebar to empty
everything again; it requires typing `DELETE` to confirm and is the app's
**only non-undoable action**.

> Previously called **DeliveryHub** (or ran an older NexaTrack build)?
> Data stored under `deliveryhub:*` or `nexatrack:v2:*` keys is **wiped**
> once on the first load of the current version — never copied — so old
> demo data can't come back. The undo history was never persisted, so it
> resets as well.

## Undo / redo

Every data change flows through the store, which keeps a global history of
full-state snapshots (products, inventory, orders, drivers, route plans):

- **Top bar**: ↩ Undo / ↪ Redo buttons (disabled when unavailable), with
  tooltips naming the pending action, e.g. *"Undo: Deleted product Milk"*.
- **Shortcuts**: Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo —
  ignored while focus is in a text field so normal text undo still works.
- **Toast**: each action raises a bottom-right toast naming it, with an
  **↩ Undo** button; it auto-dismisses after 6 s, and a newer action
  replaces it (so the button always matches the label shown).
- **Grouping**: multi-step operations create ONE history entry — order
  creation + stock deduction, bulk assignment, auto-assign (k-means),
  "Start route" (all stops + driver flip), saving an optimized route plan,
  and fail/cancel (status + stock return) each undo in a single step.
- **Limit**: the 50 most recent snapshots are kept; history itself lives
  in memory only (it is never persisted and clears on reload).

## Languages (EN / FR)

The UI is bilingual (English / French) via `react-i18next`, translations
in `src/i18n/locales/{en,fr}.json`, organized by feature section
(`nav`, `dashboard`, `status`, `undo`, …):

- **Switch**: compact `EN | FR` segmented control in the top bar, next to
  undo/redo — the whole UI re-renders instantly, no reload.
- **Persistence**: your choice is saved in `localStorage` under
  `nexatrack:v3:lang` and wins over the browser language; without a saved
  choice the browser locale is used when it starts with `fr`, otherwise
  English. `<html lang>` always follows the active language.
- **Formatting**: dates, numbers and currency use `Intl` for the active
  locale — French shows `1 234,50 MAD` and `24 oct. 2026, 12:03`
  (`src/lib/format.ts`). The currency stays MAD in both languages.
  Internal "today" keys are locale-invariant so comparisons cannot break
  mid-session.
- **Pluralization**: i18next plural keys (`count_one`/`count_other`),
  e.g. *1 order / 2 orders* — French correctly puts 0 inside the "one"
  category (*0 commande*).
- **Coverage**: the entire UI is translated — every page, form,
  placeholder, validation error, empty state, confirmation, and tooltip.
  Store-level **action labels are structured**: history entries and
  toasts store `{key, params}` translation keys (e.g.
  `actions.deletedProduct` + `{name}`), resolved by
  `src/lib/actionLabel.ts :: translateAction()` in the language ACTIVE AT
  VIEWING TIME, including nested labels (status words inside sentences,
  "3 orders across 2 drivers" counts, listed stock shortages).
- **Tests**: `src/i18n/parity.test.ts` fails when `en.json` and `fr.json`
  diverge in keys; `src/i18n/language.test.ts` covers detection order,
  persistence after a simulated reload, and the `<html lang>` sync.

No confirm dialogs: destructive actions (e.g. deleting a product, which
also removes its inventory row) act immediately — the toast's Undo button
is the safety net.

## Mobile (phones < 768px)

Tables become cards, modals become full-screen bottom sheets; the desktop
layout (≥768px) is untouched.

- **Shell**: fixed bottom tab bar (Dashboard, Orders, Drivers, Routes +
  a "More" sheet holding Products, Inventory, the language switch and the
  data actions); icon-only undo/redo; safe-area insets respected at the
  notched top and bottom (`viewport-fit=cover`).
- **Touch**: every tappable element is ≥ 44×44px; form inputs are 16px on
  touch devices (prevents iOS focus zoom) with `inputMode`/`type`
  hints (`tel`, `numeric`, `decimal`).
- **Bottom sheets**: `Modal`/`Drawer` render full-screen on phones with a
  sticky header and a sticky footer for the primary action; the page
  behind them doesn't scroll (`useOverlayLock`).
- **Inventory**: inline editing becomes a − [qty] + stepper (mobile only).
- **Routes**: ~45% screen-height map on top; the driver picker, shift
  time and Optimize/Start live in a sticky strip below it; the stop list
  is collapsible. Tapping a stop centers the map (`flyTo`), tapping a
  marker scrolls its row into view; flags get a 44px hit area on touch.
- **Visual QA**: `npm run build`, then `npx vitest run scripts/dumpSeed.test.ts`
  (writes `e2e/seed.json`) and `node scripts/mobile-shots.mjs` /
  `node scripts/fr-sweep.mjs` — screenshot every page at 360/390/768px
  (EN + FR) with Playwright and flag any horizontal overflow.

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | KPI cards (orders today, delivered %, active drivers, low stock), orders-by-status bar chart (Recharts), 5 latest orders — all zero-safe with no data. A getting-started checklist (products → stock → drivers → orders → routes) auto-ticks as data appears and hides once complete |
| **Products** | Search, add, edit, delete via a modal form; a new product creates its inventory row (quantity 0, default low-stock threshold 10) in the same undo step |
| **Inventory** | Stock per product, inline quantity editing, red badge below the low-stock threshold |
| **Orders** | Status chips + search (pending / assigned / in transit / delivered / failed / **cancelled**), new-order modal (blocks creation when stock is insufficient; optional **delivery window** start/end and **service minutes**, default 5), detail drawer with a status timeline, delivery window/service display, driver assignment, Mark failed / Cancel order / Reactivate order; stock is deducted on creation, **returned once on fail/cancel** (guarded against double return), and re-deducted on reactivate (blocked with a clear error when stock is insufficient) |
| **Drivers** | Driver cards (name, phone, status, vehicle, active order count) with **add / edit / delete** (undoable), a manual status cycle, multi-select "Assign orders" flow, "Auto-assign" geoclustering of pending orders. Status is **automatic while a manual override wins**: assignment alone doesn't change it; the first in-transit stop puts an available driver on route; no active orders → available again; off-duty drivers can't be assigned (clear error) and are excluded from auto-assign, and their off-duty state is never overridden |
| **Routes** | Driver picker + OpenStreetMap (react-leaflet): depot and numbered stop markers, the route drawn as real **OSRM road geometry** (straight legs as fallback), road distances and durations with before/after savings — the saved plan is stored per driver (`routePlans` collection), undoable and persistent across reloads. A **shift start** time (default 08:00) drives per-stop **ETAs**: arrival times include travel, per-stop service, and **waiting for the delivery window to open**; stops that miss their window are flagged red with the minutes late, and the optimizer prioritizes lateness over distance. **▶ Start route** moves every assigned stop to in transit in one undo step (flips the driver on route); each in-transit stop has ✓ Delivered / ✕ Failed actions. An amber **"≈ approximate distances"** badge appears whenever road data is unavailable (haversine fallback) |
| **Settings** | The operating location: **city name, depot name, and depot position** — type coordinates or **click the map to place the depot**. Saved to `localStorage` (`nexatrack:v3:settings`) as one undoable step; a **Reset to defaults** action is undoable too. Routes/optimizer, new-order defaults, and auto-assign all start from the saved depot; day keys ("orders today") and date formatting follow the city's timezone |

## Location config

The city, map center/zoom, depot defaults, the bounding box around the
city, and the timezone live in **`src/config/location.ts`** — a single
source of truth (shipped values: **Laâyoune**, map center 27.1536/-13.2033,
zoom 13, `Africa/El_Aaiun`). The Settings page edits the *live* copy
(persisted under `nexatrack:v3:settings`); everything below reads it:

- the dashboard subtitle ("…operations in {{city}}") and the Routes empty
  state,
- the depot marker on the Routes map and the map's initial center/zoom,
- the optimizer/auto-assign starting point (round trips start and end at
  the depot),
- the new-order form's default drop-off coordinates (an amber **warning —
  never a block** — appears when a point is **more than 40 km from the
  depot**),
- the seed-integrity test, which asserts every demo order falls inside the
  configured bounds,
- day keys and date rendering, anchored to the configured timezone.

## Project structure

```
src/
├── types.ts               # Domain types (product, order, driver, route plan, …)
├── config/
│   └── location.ts        # Single source of location truth: city, map center
│                          # + zoom, depot defaults, bounds, timezone
├── lib/                   # Data + domain layers (the only API-swap point)
│   ├── store.ts         # localStorage collections + undo/redo engine +
│                        # hooks; wipes legacy-prefixed keys on load
│   ├── seed.ts          # Demo dataset (Laâyoune) — never auto-loaded
│   ├── demoData.ts      # Optional "Load demo data" action (one undo step)
│   ├── orders.ts        # Order totals, creation w/ stock validation, transitions
│   ├── dispatch.ts      # Driver assignment + geographic auto-assign (k-means)
│   ├── routing.ts       # Pure route optimizer: nearest-neighbor + 2-opt
│                        # over a travel matrix (haversine fallback)
│   ├── roadRouting.ts   # OSRM Table/Route calls (road distances, geometry)
│                        # with per-coordinate caching and 5 s timeout
│   ├── toasts.ts        # Action-toast state (auto-wired to store announcements)
│   ├── status.ts        # Shared status labels/colors
│   └── format.ts        # Currency (MAD), dates, day keys
├── components/ui/       # Badge, Button, Modal, Drawer, Table, Toast, StatCard, …
├── layouts/             # App shell: sticky top bar (Undo/Redo) + sidebar (desktop)
│                        # / off-canvas drawer (mobile)
└── features/               # One folder per page: dashboard, products,
                             # inventory, orders, drivers, routes, settings
```

## What is mocked

Everything runs client-side on purpose. Assume the following until real
services exist:

- **No backend.** All state lives in `localStorage` (keys prefixed
  `nexatrack:v3:`) through tiny collections in `src/lib/store.ts`. When a
  real API arrives, only that file (plus `lib/orders.ts`/`lib/dispatch.ts`
  helpers) should change; page components keep their shape. Data under any
  older key prefix (`deliveryhub:*`, `nexatrack:v2:*`) is deleted once on
  load — never migrated, so stale demo data can't resurface.
- **Seed data is fictional (and optional).** The demo dataset loads only
  when you ask for it ("Load demo data"). Customer names are invented; addresses and
  coordinates are plausible approximations of real Laâyoune
  quarters (Centre-ville, Bréma, Tarfa, Chiroka), not geocoded house numbers. Prices are in MAD and roughly
  realistic. About half the seed orders carry delivery windows (one is
  deliberately infeasible for an 08:00 shift to show the "late" flag).
- **Inventory math is simplistic.** Stock is deducted when an order is
  *created* and returned when the order is *failed or cancelled* (kept in
  sync across reactivate: re-deducted when a failed/cancelled order is sent
  back to intake, refused when inventory can't cover it). There is still no
  warehouse, supplier, or purchase-order flow.
- **Driver status is derived, with a manual override.** The Drivers card
  cycle remains the source of truth for `off_duty`. Otherwise automation
  rules it: any in-transit stop flips an available driver to `on_route`, and
  a driver whose last active order leaves delivered/failed/cancelled returns
  to `available`. Off-duty drivers are blocked from assignment and excluded
  from auto-assign; automation never touches them.
- **Route optimization uses real road data when OSRM is reachable.**
  `lib/roadRouting.ts` calls the OSRM Table API per-leg distances/durations
  (`getDistanceMatrix`) and the Route API for the road geometry drawn on
  the map (`getRouteGeometry`); `lib/routing.ts` optimizes on those road
  costs. If OSRM is unreachable, slow (> 5 s), or returns errors, it falls
  back silently to straight-line haversine distances and a flat 30 km/h
  average — and the Routes page shows an **"≈ approximate distances"**
  badge. The optimizer itself is still heuristic (nearest-neighbor +
  2-opt), not an exact optimum. Matrices and geometries are cached in
  memory keyed by coordinates to avoid repeat requests.
- **Windows and service times are estimates, not live traffic.** Orders can
  carry a delivery window (`HH:MM`, optional) and per-stop service minutes
  (default 5). The optimizer runs lateness-first — nearest-neighbor breaks
  cost ties by earlier window end and a 2-opt swap is only accepted when it
  does not increase total lateness — and `scheduleTour` produces per-stop
  arrivals (wait when early, "late" flag when the window was missed). But
  there is no real-time traffic, no driver position, and ETAs restart from
  the chosen shift start, not from where the driver actually is.
- **Time/ETA is a single number.** No traffic, no per-route replanning:
  ETAs are computed once per displayed stop order.

## Hosting (GitHub Pages)

The app deploys automatically to **https://moealami10.github.io/nexatrack/** —
just push to `main`; `.github/workflows/deploy.yml` runs type-check + tests,
builds, and publishes via GitHub Pages (Pages is configured with
`build_type=workflow`).

Because GitHub Pages has no SPA fallback, the deployed bundle is rooted at
`/nexatrack/` (`vite.config.ts` sets `base`, `main.tsx` uses it as the
router basename for dev/`preview` compatibility) and the workflow copies
`index.html` to `404.html` so refreshing a deep link (e.g.
`/nexatrack/orders`) still renders the app. If you change the repository
name, update `base` in `vite.config.ts` to `/repo-name/`.

## Notes

- The production build code-splits the two heaviest pages (Dashboard with
  Recharts, Routes with Leaflet) so the initial bundle stays small.
- Unit tests: the optimizer (incl. travel matrices and time-window
  ordering) in `src/lib/routing.test.ts`, the seed's
  internal consistency (foreign keys, coordinates) in
  `src/lib/seed.test.ts`, all undo/redo semantics (grouping, redo
  invalidation, the 50-entry cap, route plans) in
  `src/lib/history.test.ts`, order status↔inventory flows (restock on
  fail/cancel, on-reactivate deduction, insufficient-stock refusal, no
  double restock) in `src/lib/order-stock.test.ts`, the driver-status
  automation (every transition, incl. the manual-off-duty protection) in
  `src/lib/driver-status.test.ts`, the OSRM plumbing (response parsing,
  haversine-fallback paths, 5 s timeout, per-coordinate caches) in
  `src/lib/roadRouting.test.ts`, and the empty-start behavior: the
  legacy-key wipe migration in `src/lib/store-migration.test.ts`,
  demo-load / clear-all semantics in `src/lib/empty-state.test.ts`, and
  zero-safe dashboard aggregation in `src/features/dashboard/stats.test.ts`.

- **OSRM endpoints.** The base URL comes from `VITE_OSRM_URL` and defaults
  to the public demo server `https://router.project-osrm.org`. That server
  is **rate-limited and not for production** — expect throttling under
  load. For real deployments, self-host OSRM (e.g. with the Morocco or
  Europe extract) and point `VITE_OSRM_URL` at it. The app treats OSRM as
  optional: every failure degrades to straight-line estimates with a badge,
  never blocks the UI.
