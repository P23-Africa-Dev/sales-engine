# Lead yield diagnosis — technical

**Date:** 25 September 2026  
**Repo:** `sales-engine` (Laravel). UI copy that previews the brief lives in `the-factory` and `sales-engine-frontend`.  
**Flow:** ICP `customPrompt` → chat `generate_leads` → `ChatService` → `DiscoveryOrchestrator` → Serper / Hunter → extraction → `IcpFilterService` + geo gate → lead cards.  
**Code changes:** none. This document is the diagnosis and the fix plan.

Symptoms covered:

- Long “What kind of opportunity…” text returns nothing useful.
- Non-catalog countries (Germany, Netherlands, Denmark) return ~0; adding Nigeria increases yield.
- A request for ~50 prospects returns 1, 3, or 5.
- Cards often have a website and no email or phone.

---

## 1. Long briefs are not the query that is executed

### What the UI claims

`composeIcpSearchBrief()` in `sales-engine-frontend/lib/sales-engine/icp-search-brief.ts` (mirrored in the Factory app) returns `customPrompt` **verbatim** when it is non-empty. The ICP modal prints that string under “When you ask for leads, we will search.”

There is **no word cap on the textarea**. Persistence allows it:

- `config.description` max **2000**
- `config.customPrompt` max **5000**  
  (`IcpProfileController`)

The preview is therefore not evidence of the retrieval query.

### What the backend searches

`IcpBrief::searchBrief()` (`app/Services/Discovery/DTO/IcpBrief.php`):

- Priority: `customPrompt` → `description` → industries → a neutral fallback.
- Territory, size, revenue, and personas are **not** part of this string.
- `entityOrientedSeed()`: if the text is **≤ 14 words**, it is used as-is. If longer, it keeps up to **6 concrete nouns** (stop-worded; verbs like “manufactures” / “resells” are not a structured exclusion) mixed with industry labels, or else **the first 10 words**.

`QueryVariationGenerator::compressSeed()` then, for variation seeds, keeps the string only if it is **≤ 12 words**, otherwise **the first 10 words**.

`ChatService` (generate_leads): a generic body (“50 prospects with my ICP”, “give me prospects”) sets `searchQueryOverride` to `searchBrief()`. The user’s sentence is **not** the Serper `q` unless it already is that short brief.

`IcpSearchBriefSuggester` (Generate / Improve / Regenerate) instructs the model: **brief 6–12 words**, products and buyers only, **never countries, cities, size, revenue, or titles**. A long OEM-vs-reseller definition will be rewritten into a short noun phrase or rejected as too definitional.

### Why both phrasings fail

“Manufactures (not just resells) equipment in one of these categories: HVAC…” is > 14 words. Retrieval sees a truncated seed, not the category list and not the reseller exclusion. OR-ing seven verticals in one query also produces a mixed global result set that the geo gate then empties (section 2).

The UI warning only fires for the literal pattern `industries specialize` or when `customPrompt === description`. A long equipment definition does not trip it.

### Fix

- Make the preview call the same compression as `IcpBrief::searchBrief()` / `compressSeed()`, or stop compressing and send a structured query (one vertical per variation).
- Treat “not a reseller / OEM only” as a **post-filter or extraction attribute**, not as search syntax.
- Fan out one Serper query per equipment category instead of one OR paragraph.
- Align `composeIcpSearchBrief()` with the backend so the confirm card cannot show text that will not be searched.

---

## 2. Geography outside the catalog is a gate, not a retrieval bias

### Catalog

`DiscoveryGeo::REGIONS` (`app/Services/Discovery/DiscoveryGeo.php`) is a closed list:

| Label | `gl` | Hunter HQ | TLD / host inference |
|---|---|---|---|
| Nigeria | `ng` | `NG` | `.ng`, `ng.linkedin.com` |
| England (UK aliases) | `uk` | `GB` | `.uk`, `.co.uk`, `uk.linkedin.com` |
| Kenya | `ke` | `KE` | none beyond alias/city |
| Ghana | `gh` | `GH` | none beyond alias/city |
| South Africa | `za` | `ZA` | none beyond alias/city |
| Egypt | `eg` | `EG` | none beyond alias/city |
| United States | `us` | `US` | ISO `US` skipped (collides with English “us”) |
| India | `in` | `IN` | ISO `IN` skipped |

**Germany, Netherlands, Denmark, Sweden are absent.** No `gl=de|nl|dk`, no Hunter country code, no `.de` / `.nl` / `.dk` inference.

`IcpFilterService::TERRITORY_ALIAS_GROUPS` matches that same small set. `"netherlands"` is not grouped with a misspelling `"netherland"`.

### What a catalog country gets

When `shouldApplyRetrievalGeo()` is true (territories non-empty, and the user query did not name a different catalog country):

- `appendTerritoryClause()` appends **`primaryLabel()` only** — the first resolved region, not every selected country.
- `serperParams()` sets Serper `location` and `gl` from that one region.
- `hunterHeadquarters()` sets Hunter `headquarters_location.include` to that country (and city if the territory string matched a catalog city).
- `inferLocationFromText()` / `inferLocationFromTld()` can stamp Nigeria or UK from the URL.

`SerperDiscoveryAdapter::serperGeoParams()` and `HunterDiscoveryAdapter::buildDiscoverPayload()` both no-op the strong bias when the region does not resolve.

### What Germany / NL / DK get

`resolveRegion()` returns null.

- Serper: `location` = `primaryLabel()` (first territory segment, e.g. `Germany`). **No `gl`.**
- Hunter: `hunterHeadquarters()` returns **[]** — no HQ filter. Hunter is either global or skipped as a geo-aimed source.
- `.de` / `.nl` / `.dk` do not infer a country, so many OEM homepages stay `location` blank.
- Known foreign locations (India, US, UK, Nigeria, …) **hard-drop** in `DiscoveryOrchestrator` when `enforceTerritory` is set and `matchesTerritory()` fails (`wrong_country_dropped`).
- Blank location is **not** a hard fail (unknown geo can be kept, often as low-confidence / advisory). That does not create German companies; it only avoids deleting unknowns.

If the chip is stored as **“Netherland”**, `matchesTerritory()` token-overlaps `"netherland"` and will **not** hit `"netherlands"`. Dutch hits that say Netherlands are dropped as the wrong country. The empty-state copy in `ChatService` prints the raw territory list, which is why the UI says “Netherland”.

### Why Nigeria increases yield

Nigeria resolves. Search is geo-biased (`gl=ng`, query suffix, Hunter `NG`, `.ng`). Snippets that mention Nigeria pass the gate. The extra cards are Nigeria-scoped, not evidence that the European OR-query improved.

Africa is **not** generally supported. Only the five African regions in `REGIONS`. Other African countries behave like Germany: label-only, no `gl`, no Hunter HQ, no ccTLD.

### Fix

- Add DE / NL / DK / SE (and any other sold territories) to `DiscoveryGeo::REGIONS` **and** `IcpFilterService::TERRITORY_ALIAS_GROUPS`, including ccTLD and LinkedIn host inference.
- Alias `netherland` → `netherlands`.
- When multiple countries are selected, emit **one retrieval pass per country** (query clause + `gl` + Hunter HQ), not `primaryLabel()` only.
- Do not hard-drop a hit as foreign when its only location evidence is a catalog country we inferred by accident (US/IN token collisions are already special-cased; extend that care to new codes).

---

## 3. Why 50 becomes 1–5

Stack, in order:

| Control | Value | Where |
|---|---|---|
| Default batch if no number is parsed | **12** | `QueryIntentService::DEFAULT_LEAD_LIMIT` |
| Parsed “50 prospects …” | up to **150** | `parseLimit()` matches `\d{1,3}\s+prospects` |
| Serper `num` per call | about **15–20** | `SerperDiscoveryAdapter::resolveResultLimit()` (`limit >= 20` → 20) |
| Hits processed | `limit * 4` capped at **60** if limit ≤ 40; else `ceil(limit * 1.5)` | `DiscoveryOrchestrator::gatherCap()` |
| Soft stop | **90s** | `FIRST_BATCH_SOFT_SECONDS` |
| Hard stop | **150s** | `HARD_DEADLINE_SECONDS` |
| Advisory share | **25%** of limit | `maxAdvisory` |
| Firmographic gate | industry / size / revenue fail-closed **when the field was extracted** | `icpHardGateResult()` only marks a field available if extraction filled it; empty extraction skips that field |
| Geo | known other country dropped | section 2 |

So “50 prospects with my ICP” can set `limit = 50`, but:

- each Serper call still returns ≤ 20 organic results
- gather cap is ~75 entity hits
- the 150s deadline aborts mid-pipeline (`gather_time_cut`, `pastDeadline()` breaks the score loop)
- geo + industry drops consume the cap
- scoring on the deferred path is **heuristic only** (`deferContactEnrichment` forces `heuristicScore`, skipping the GLM score) which is fine for speed and harsh for borderline fits

Net survivors of 1–5 are the expected output of that funnel, not an off-by-one in the chat button.

`withProspectCountCue()` in the frontend only special-cases **12 / 25 / 40**. A free-text “50 prospects …” still parses via `parseLimit()`. The confirm-card control cannot ask for 50 unless the user types it.

### Fix

- If `limit >= 50`, raise Serper `num`, run more query variations (per category **and** per country), and raise or remove the 150s hard stop for that intent. Persist leftovers (already sketched as unused hit cache) and page them instead of pretending one pass can fill 50.
- Do not apply size/revenue gates unless the ICP value was extracted from a source that can actually know them (`IcpFilterService` already supports `$availableFields`; keep revenue/size out of the hard gate until a provider fills them).
- Surface `gateStats` (`wrong_country_dropped`, `dropped_hard_gate`, `gather_time_cut`) in the empty state so “no leads in Germany” distinguishes “never retrieved” from “retrieved and rejected”.

---

## 4. Websites without email or phone

`DiscoveryOrchestrator` defaults `deferContactEnrichment = true`.

`LeadProfileEnrichmentService::enrich()`:

```php
if (! $this->shouldEnrich($icp) || $this->deferContactWaterfall) {
    // First-batch path: keep title/company/linkedin from extraction; enrich contacts later.
    return new EnrichedLeadProfile( /* email/phone only if already on the extract */ );
}
```

First-batch cards therefore contain:

- company name
- website / LinkedIn **if the hit URL or snippet had them**
- email/phone **only if extraction already saw them on the page**

`isContactReady()` returns true for a LinkedIn URL or even title+company **with no email**. The card can look “ready” while `contact_status` is `not_started` because `enrichment_attempted` is false (`contact_status` is `not_started` when enrichment was not attempted, else `found` / `not_found`).

Generic `info@` / `contact@` are rejected in the GLM profile extractor. A homepage with only a contact form will not produce a person.

### Fix

- After the company list is committed, run the contact waterfall (Hunter email, role search) asynchronously and patch the card. Do not block the first paint on it, but do not leave `deferContactWaterfall` as the permanent state for a “50 prospects” job.
- In the UI, render `contact_status === not_started` as “Website only — contact lookup not run yet”, not as a finished lead.

---

## 5. Recommended implementation order

1. **Geo catalog** for every territory the ICP builder can select, plus Netherlands alias and ccTLD inference. One retrieval pass per country.
2. **Honest search brief** — preview = executed query; long definitions split into per-vertical queries.
3. **Yield budget** for limit ≥ 25: more Serper pages, longer deadline, publish gate counters on the empty state.
4. **Contact waterfall after the list**, with an explicit website-only state until it finishes.

Files to change first:

- `app/Services/Discovery/DiscoveryGeo.php`
- `app/Services/IcpFiltering/IcpFilterService.php` (alias groups)
- `app/Services/Discovery/DTO/IcpBrief.php` (`entityOrientedSeed`)
- `app/Services/Discovery/QueryVariationGenerator.php` (`compressSeed`, territory fan-out)
- `app/Services/Discovery/DiscoveryOrchestrator.php` (deadline, gather cap, deferral)
- `app/Services/Discovery/Adapters/SerperDiscoveryAdapter.php` (`resolveResultLimit`)
- `lib/sales-engine/icp-search-brief.ts` in both frontends (preview parity)

Tests that already encode the current contract and must be updated with the behavior change: `QueryVariationGeneratorTest`, `DiscoveryGeoTest`, `IcpBriefSearchQueryTest`, `IcpFilterServiceTest`, `SerperDiscoveryAdapterGeoTest`.
