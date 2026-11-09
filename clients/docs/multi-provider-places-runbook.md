# Multi-Provider Places Search Runbook

## Architecture

```
UI (Next / PWA)
  → Laravel /api/v1/places/*
      → Redis cache
      → Geoapify (primary)
      → quality gate
      → Foursquare (secondary)
      → quality gate
      → Google Places (final fallback <5%)
      → MapCreditService + place_search_events
```

Mapbox is **not** a Places search provider. It remains map rendering, markers, clustering, and Directions only.

## API (Sanctum)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/places/autocomplete?q=` | Typeahead |
| GET | `/api/v1/places/search?q=` | Text search |
| POST | `/api/v1/places/nearby` | Viewport / area POIs |
| GET | `/api/v1/places/details?id=&provider=` | Resolve selection |
| GET | `/api/v1/places/geocode?q=` | Forward geocode |
| GET | `/api/v1/places/reverse?lat=&lng=` | Reverse geocode |

Header `X-Places-Source: dashboard|pwa` tags traffic for admin analytics.

## Credits

Orchestrator meters `places.autocomplete|search|nearby|details|geocode|reverse` inside Laravel (no client consume). Cache hits charge **0**. Google uses higher `credit_units` via config.

## Super-admin

**Admin → Places Search** (`/admin/places`):

- Provider mix %, cache hit %, fallback %, latency, est. cost
- Traffic by source (dashboard / pwa / system)
- Top organizations + link to Map Credits wallets
- Toggle providers + quality threshold

## Env / secrets

Laravel `.env` / k8s `factory23-secret`:

- `GEOAPIFY_API_KEY`
- `FOURSQUARE_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- Optional: `PLACES_*` toggles, timeouts, TTLs, `PLACES_GOOGLE_DAILY_BUDGET`

CORS must allow `X-Places-Source` (and optionally `X-Company-Id`). Production mounts
`factory23-cors-config` ConfigMap over `config/cors.php` so browser Places calls are not
blocked by preflight. Clients also send `source=dashboard|pwa` as a query/body param.

## Migrate / seed

```bash
cd backend/src
php artisan migrate
php artisan db:seed --class=MapCreditSkuSeeder
```

## Tests

```bash
cd backend/src
php artisan test --filter=Place
```

```bash
cd ../..  # repo root
npx vitest run --project root lib/utils/place-search.test.ts lib/map/poi-search.test.ts lib/map/place-result-quality.test.ts
```
