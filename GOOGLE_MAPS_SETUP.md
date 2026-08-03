# Google Maps Setup & Visit Routing

This document covers the maps/geocoding/routing integration: what is implemented, how it behaves with `MAPS_PROVIDER=DISABLED`, and the exact steps to activate it against a real Google Cloud project. **Production currently runs `MAPS_PROVIDER=DISABLED`** — no Google Maps API key is configured, and this document does not claim otherwise.

---

## 1. Architecture

`src/integrations/maps/` implements one provider-agnostic interface (`MapsProvider`: `geocode`, `reverseGeocode`, `getDirections`, `getDistanceMatrix`, `searchPlaces`, `getDiagnostics`), selected once via `MAPS_PROVIDER`:

| Provider | Real API calls |
|---|---|
| `DISABLED` (default) | None - every method throws a clear `MapsConfigError`; callers render a "not configured" state |
| `GOOGLE` | Real Google Maps Platform REST calls (Geocoding, Directions, Distance Matrix, Places Autocomplete) via plain `fetch` - no new npm dependency was needed |

Every call site (property address search, property detail map panel, visit conflict detection, nearby properties, route suggestion) goes through `src/lib/geocoding.ts` (the cached wrapper) or the provider directly for read-only diagnostics - nothing outside `src/integrations/maps/` is provider-specific.

## 2. What's implemented

- **Geocoding + address autocomplete**: `POST /api/maps/geocode`, `GET /api/maps/autocomplete` (Delhi-biased, region=IN by default), both cached (30-day TTL for geocodes, since a real address's coordinates essentially never change) and rate-limited.
- **Property location fields** (additive migration): `pincode`, `formattedAddress`, `placeId`, `geocodeStatus`, `geocodedAt`, `locationPrecision`, `publicLocationMode` - see `src/lib/property-location.ts` for geocode/manual-set/clear/hide-location actions, each audited.
- **Address search + confirm-before-apply preview** in the property form (`property-address-search.tsx`) - never overwrites existing address/area fields without an explicit "Use this address" click.
- **Property detail map panel** - formatted address, pincode, precision/geocode-status badges, an embedded map preview (only when `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` is set), "Get Directions"/"Open in Google Maps"/"Copy Location" (all work with **zero API key** via universal `https://www.google.com/maps/...` URLs), and Admin/Data-Manager-only "Re-geocode"/"Mark Approximate"/public-visibility controls.
- **Location privacy fix**: the public catalogue DTO (`catalogue-dto.ts`) previously leaked exact coordinates unconditionally - it now respects `Property.publicLocationMode` (`EXACT`/`APPROXIMATE`/`LOCALITY_ONLY`/`HIDDEN`) and only reveals exact coordinates when the catalogue entry's own address-visibility flag is also on, otherwise falling back to a ~1.1km-fuzzed pin or nothing at all.
- **Field Executive visit actions** (`visit-field-actions.tsx`): Get Directions, Copy Address, Call Client, WhatsApp Client, Call Owner (Admin/Data Manager only), Mark Arrived, Complete Visit - the directions/call/WhatsApp links never require `MAPS_PROVIDER` to be configured.
- **Route-aware visit conflict detection** (`src/lib/visit-conflict.ts`): on schedule/reschedule, checks the employee's immediately-previous/next visit that day; computes real travel time via Distance Matrix when Google is configured, or a clearly-labelled fixed 30-minute estimate when it isn't. A detected conflict returns `409` with details; Admin/Data Manager can override with a reason (audited); Field Executives cannot override.
- **Suggested route** (`src/lib/route-suggestion.ts`): chronological (never reordered) list of an employee's stops for the day, with travel time between consecutive stops and a "full route" Google Maps multi-stop URL - deliberately **not** a route optimizer (see "Known limitations").
- **Nearby properties** (`src/lib/nearby-properties.ts`): radius browse (1/3/5/10km) around a property's coordinates, database-bounding-box + haversine filtered - a separate feature from, not a replacement for, the weighted lead-matching engine. An optional, additive proximity bonus (`applyProximityBonus` in `matching.ts`) exists for future wiring into that engine but changes no default matching behavior.
- **Locality normalization** (`src/lib/locality.ts`): a small, explicit alias table (e.g. "Janak Puri" → "Janakpuri", "Dwarka Sec 12" → "Dwarka Sector 12") - conservative by design, never fuzzy-merges genuinely different localities.
- **Cost controls**: geocode/directions/distance-matrix results are cached in Redis (falls open - no caching, not a correctness issue - if `REDIS_URL` is unset); address search has a 3-character minimum and client-side debouncing; per-user AND per-organization-daily rate limits on every maps operation (`checkMapsQuota` in `rate-limit.ts`).
- **Admin-only health endpoint** (`POST /api/system/maps-health`): one cheap diagnostic geocode of a fixed landmark, never a real user query, never exposes the key.

## 3. Google Cloud setup (do this when ready to go live)

None of this has been done yet - no Google Cloud project or API key exists for this deployment.

1. Create or select a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable billing on the project (required for all Maps Platform APIs beyond a small free tier).
3. Enable the **Maps JavaScript API** (needed only if a future interactive JS map is added - the current embed preview uses the simpler Maps Embed API, which is included under Maps JavaScript API's terms).
4. Enable the **Places API** (for address autocomplete).
5. Enable the **Geocoding API** (for address → coordinates and reverse lookups).
6. Enable the **Directions API** and **Distance Matrix API** (for travel time / conflict detection / route suggestion).
7. Create a **browser key** (Credentials → Create Credentials → API Key) → restrict it to **HTTP referrers**: `https://crm-kappa-five-28.vercel.app/*` (and `http://localhost:3000/*` for local development only) → restrict its API list to Maps JavaScript API / Maps Embed API only → this becomes `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`.
8. Create a **server key** (a separate key) → restrict it by API to Geocoding, Places, Directions, Distance Matrix only → optionally restrict by IP if Vercel's egress IPs are known/stable → this becomes `GOOGLE_MAPS_SERVER_API_KEY`. **Never** give the server key an HTTP-referrer restriction (server-to-server calls don't send one).
9. Add the Vercel environment variables (below).
10. Redeploy.
11. Run the diagnostics: Settings → Maps & Localities → **Run Test**.
12. Test one real property address: Add/Edit Property → Search Address → confirm a real Delhi address → Save → check the property detail page shows a map pin and "Location: SUCCESS".
13. Test one real visit route: schedule two visits for the same Field Executive close together in time at two real, geocoded properties → confirm a conflict warning appears with a real (not estimated) travel-time figure.
14. Review Google Cloud Console → APIs & Services → Quotas, and set up a billing alert.

Do not share these credentials over chat/email; do not commit them anywhere in this repository.

## 4. Vercel environment variables (production activation)

```env
MAPS_PROVIDER=GOOGLE
GOOGLE_MAPS_SERVER_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY=
GOOGLE_MAPS_MAP_ID=
GOOGLE_MAPS_DEFAULT_REGION=IN
GOOGLE_MAPS_DEFAULT_LANGUAGE=en
GOOGLE_MAPS_DEFAULT_CITY=Delhi
```

`GOOGLE_MAPS_MAP_ID` is optional (only needed for Advanced Markers on a future interactive JS map - not used by the current embed-based preview). Keep secrets in Vercel only. Redeploy after saving.

## 5. Rollback

Set `MAPS_PROVIDER=DISABLED` in Vercel and redeploy. Every route already falls back cleanly: address search/map panels show a "not configured" state, external directions/call/WhatsApp links keep working (they never depended on the API), visit scheduling keeps working (conflict detection falls back to the fixed estimate), and no existing Property/Visit data is touched.

## 5.5 Migration bookkeeping (one-time operator action)

The additive schema migration (`prisma/migrations/20260803150000_maps_localities_visit_routing/`) has **already been applied to production** — its DDL (new enums, new nullable `Property`/`Visit` columns, one new FK) was run successfully via `prisma db execute` against the pooled connection, and verified by a live query returning the new columns.

However, Prisma's own migration-history table (`_prisma_migrations`) does not yet have a row for it, because recording that requires `prisma migrate resolve`, which needs the **direct** (non-pooled, port 5432) database connection — unreachable from this sandbox. Until this is resolved, a future `npx prisma migrate deploy` run from a machine with real DB network access will try to re-apply this migration's DDL and fail (columns/types already exist). **Before the next `prisma migrate deploy`**, run once from a machine that can reach `DIRECT_URL`:

```
npx prisma migrate resolve --applied 20260803150000_maps_localities_visit_routing
```

## 6. Known limitations (as of this pass)

- Nothing here has been exercised against a real Google Cloud project - no address has actually been geocoded, no map has rendered, no route has been calculated, and no conflict has been detected using real travel time through the live API. This document does not claim otherwise.
- **Route suggestion is not a route optimizer.** Every visit already has a specific dispatcher-assigned time (there is no "flexible time window" concept in this data model), so there's nothing meaningful to reorder by proximity - the "Suggested Route" panel shows the day's stops in their already-scheduled chronological order, annotated with real/estimated travel time between them, which is exactly the information a dispatcher needs to spot an unrealistic schedule. Building a true multi-stop optimizer (TSP-style) was explicitly out of scope for this MVP per the task spec.
- The property detail map preview uses the Maps **Embed API** (a plain `<iframe>`, no JS SDK) rather than an interactive JavaScript map - simpler, no new client dependency, and it degrades to a text-address-only view automatically when the browser key isn't configured.
- Metro/landmark enrichment is not implemented as a separate feature - Google's Places Autocomplete/Geocoding responses may incidentally include nearby landmark text in `formattedAddress`, but no dedicated "nearest metro station" lookup was built (would require the Places Nearby Search API, an additional enabled API and cost surface not justified without confirmed demand).
- The optional `applyProximityBonus` matching-engine hook exists but is not wired into the live lead-matching API route yet - it's additive/opt-in and doesn't change any existing match result today.
