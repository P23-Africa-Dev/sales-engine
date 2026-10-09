# Google Places Cost & Architecture Audit Report

**Date:** 25 July 2026  
**Scope:** Dashboard Next.js app + Agent PWA Places proxies  
**Objective:** Mapbox primary; Google Places only as quality-gated fallback

---

## 1. Issues discovered

| # | Issue | Severity |
|---|--------|----------|
| 1 | `suggestPlaces` called Google Autocomplete **before** Mapbox | Critical |
| 2 | Viewport / area POI called Google **Nearby Search Pro (~$32/1k)** before Mapbox | Critical |
| 3 | `PLACES_DAILY_CALL_BUDGET` defaulted to **0 (unlimited)** | Critical |
| 4 | Rate limit default **120/min** was too permissive | High |
| 5 | Map credit gate **failed open** with no auth → unmetered Google | High |
| 6 | PWA `/api/places/*` had **no** TTL cache / rate limit / daily budget | High |
| 7 | `PlaceAutocompleteField` re-fired searches on unstable `proximity` array + `creditBlocked` deps | Medium |
| 8 | Mapbox POI fallback could fire **~18 serial retrieves** per viewport | Medium |
| 9 | No structured Places cost telemetry | Medium |
| 10 | Viewport POI gated at zoom 13 / 350m / 5m cache (too aggressive for cost) | Medium |

---

## 2. Root causes

1. **Inverted provider waterfall** — Google was treated as the rich-data primary for search and nearby; Mapbox was only a fallback. This contradicts the product intent (Mapbox primary).
2. **Nearby Search Pro on map pan** — “Show Places” + `moveend` billed the most expensive Places SKU repeatedly.
3. **Safety defaults off** — daily budget unlimited; credit metering skipped without a token.
4. **React identity churn** — inline `proximity={[lng,lat]}` recreated `runSearch` and re-debounced identical queries.

Estimated pre-fix burn (~£181 / 7 days ≈ **£780/mo** if sustained) is consistent with thousands of Nearby Pro calls/week plus autocomplete.

---

## 3. Files affected

### New
- [`lib/map/place-result-quality.ts`](../lib/map/place-result-quality.ts)
- [`the-factory-agent-pwa/src/lib/map/place-result-quality.ts`](../the-factory-agent-pwa/src/lib/map/place-result-quality.ts)
- [`lib/server/places-telemetry.ts`](../lib/server/places-telemetry.ts)
- [`app/api/places/metrics/route.ts`](../app/api/places/metrics/route.ts)
- [`the-factory-agent-pwa/src/lib/server/places-guard.ts`](../the-factory-agent-pwa/src/lib/server/places-guard.ts)
- Tests: `lib/map/place-result-quality.test.ts`, `lib/utils/place-search.test.ts`, `lib/map/poi-search.test.ts`

### Updated
- [`lib/utils/place-search.ts`](../lib/utils/place-search.ts) — Mapbox-first + quality gate + client cache + inflight dedupe
- [`the-factory-agent-pwa/src/lib/map/place-search.ts`](../the-factory-agent-pwa/src/lib/map/place-search.ts) — same
- [`lib/map/poi-search.ts`](../lib/map/poi-search.ts) — Mapbox/Overpass first; Google last; retrieve caps
- [`lib/map/poi-viewport.ts`](../lib/map/poi-viewport.ts) — Mapbox-first viewport; Minimal-tier defaults
- [`components/map/PlaceAutocompleteField.tsx`](../components/map/PlaceAutocompleteField.tsx) — stable proximity deps, abort
- [`the-factory-agent-pwa/.../PlaceAutocompleteField.tsx`](../the-factory-agent-pwa/src/features/locations/components/PlaceAutocompleteField.tsx)
- [`components/map/LocationSearchInput.tsx`](../components/map/LocationSearchInput.tsx) — abort + request id
- [`lib/server/places-guard.ts`](../lib/server/places-guard.ts) — budget 200, rate 30/min
- [`lib/server/map-credit-gate.ts`](../lib/server/map-credit-gate.ts) — fail-closed without auth
- PWA credit gate + autocomplete/details routes — guard + prefer `GOOGLE_PLACES_API_KEY`
- Dashboard Places routes — telemetry hooks
- [`.env.local.example`](../.env.local.example) — documented knobs

---

## 4. Code changes made

1. **Search:** Mapbox Search Box → quality score → Google Autocomplete only on failure (`forceGoogle` / `NEXT_PUBLIC_PLACES_FORCE_GOOGLE_PRIMARY` for emergency).
2. **Nearby / viewport:** Mapbox keyword sweep (max 2 retrieves × 6 keywords) → optional Overpass → Google Nearby only if &lt; 3 usable POIs.
3. **Viewport tuning:** zoom ≥ 14, debounce 1200ms, move ≥ 500m, tile TTL 10 min.
4. **Deduping:** client suggest cache (60s), inflight map, AbortController on typeahead, primitive proximity deps.
5. **Circuit breakers:** 200 Google calls/day/instance; 30 req/min/client; no-auth blocks Google (Mapbox still works).
6. **Telemetry:** structured logs + `GET /api/places/metrics` (optional `PLACES_METRICS_SECRET`).

---

## 5. Requests eliminated (typical session)

| Scenario | Before | After |
|----------|--------|-------|
| Typeahead pause (Mapbox OK) | 1× Google Autocomplete | 0× Google (Mapbox only) |
| Same query again within 60s | Another Google call | Client cache hit |
| Pan map with Show Places (Mapbox ≥3 POIs) | 1× Nearby Pro | 0× Google |
| Pan map Mapbox empty | 1× Nearby Pro | 1× Nearby Pro (fallback only) |
| Parent re-render with inline proximity | Extra Autocomplete | No re-search |
| Unauthenticated Places proxy | Unmetered Google | Blocked → Mapbox |

---

## 6. Estimated reduction in Google API usage

- **Nearby Search:** **>90%** reduction when Mapbox/Overpass meets the quality gate (was the dominant cost driver).
- **Autocomplete:** **>80%** reduction when Mapbox returns usable suggestions.
- **Hard cap:** ≤200 billed Google calls/day/instance even under abuse.

---

## 7. Estimated monthly cost before optimisation

- Observed: **~£181 / ~7 days** → **~£780/month** if sustained.
- Consistent with Nearby Search Pro at ~$32/1k plus Autocomplete.

---

## 8. Estimated monthly cost after optimisation

- Target under normal Mapbox-primary usage: **£20–40/month** Google Places (or less).
- Worst case with daily budget 200 Nearby-equivalent: roughly **~$6.40/day/instance** Nearby Pro ceiling before other SKUs — still far below the prior uncontrolled burn.
- Exact invoice depends on traffic, Show Places usage, and quality-gate failure rate.

---

## 9. Remaining risks

1. **Per-instance budget/cache** — serverless multi-instance does not share the in-memory budget (document Redis/Upstash follow-up).
2. **Quality gate false negatives** — weak Mapbox results may still call Google more than desired; tune thresholds if needed.
3. **Mapbox Search Box cost** — POI keyword sweep still uses Mapbox suggest/retrieve (capped); monitor Mapbox billing separately.
4. **Fail-closed without auth** — anonymous/dev flows without `factory_auth_token` will not hit Google (intended); ensure logged-in sessions send cookies/headers.
5. **Maps JavaScript API** — if admin selects Google as *map renderer*, Maps JS tile/load costs are separate from Places (unchanged).
6. **Ops checklist** — Google Cloud key restrictions must still be applied manually (referrers, API allowlist, dedicated Places key).

---

## 10. Recommended future improvements

1. Shared **Redis/Upstash** cache + daily budget across instances.
2. Admin dashboard for `/api/places/metrics` (fallback %, est. daily USD).
3. Prefer Mapbox category / Geocoding POI endpoints over keyword retrieve sweeps.
4. Default “Show Places” off for new orgs; require admin opt-in.
5. Remove unused `@googlemaps/js-api-loader` dependency.
6. Set `PLACES_CREDIT_FAIL_CLOSED=true` in production if metering outages should also block Google.

---

## API key security checklist (manual)

- [ ] Use dedicated `GOOGLE_PLACES_API_KEY` (server-only), separate from Maps JS key
- [ ] Restrict Places key to Places API (New) only
- [ ] Restrict Maps JS key to HTTP referrers of production domains
- [ ] Disable unused Google APIs on the project
- [ ] Set quota caps in Google Cloud Console aligned with `PLACES_DAILY_CALL_BUDGET`
- [ ] Rotate any previously exposed keys

---

## Verification

```bash
cd "C:/xampp/htdocs/The Factory/factory23 fullstack"
npx vitest run --project root \
  lib/map/place-result-quality.test.ts \
  lib/utils/place-search.test.ts \
  lib/map/poi-search.test.ts
```

12 tests covering quality scoring, Mapbox-success (no Google), Google fallback, cache hits, inflight dedupe, skipGoogle, and Mapbox-first area POI.
