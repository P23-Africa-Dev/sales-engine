# Lead Yield Strategy — Why Users Get Few / Low-Confidence Leads

**Date:** 2026-09-22  
**Status:** Investigation complete — **no code changes in this pass** (awaiting approval)  
**Audience:** Product, ops, engineering  
**Scope:** Production `sales-engine` namespace, discovery runs **#119–#130**, live API image `sales-engine-api:79cf4e6`  
**Prior doc:** [`ZERO_LEAD_ROOT_CAUSE.md`](ZERO_LEAD_ROOT_CAUSE.md) (still valid for the empty-location bug; this doc updates what has changed since and expands to _low_ yield)

---

## 1. Plain-English verdict

The system **does find** lots of web hits. Jobs finish as `completed`. The user still sees **0–5 leads** (or a fuller list that is mostly **“low confidence”**) because of a **layered funnel**, not a single crash.

| Symptom users feel                    | What production actually shows                                      |
| ------------------------------------- | ------------------------------------------------------------------- |
| “I asked for ~20, got ~4”             | Runs like **#127**: 66 hits → **4 leads**, all advisory             |
| “Those 4 say low confidence”          | `kept_advisory_profile` / `unknown_geo_kept` ≈ lead count           |
| “Sometimes I get nothing”             | Runs **#128–#129**: 148–187 hits → **0 leads**                      |
| “Earlier Nigeria runs returned empty” | Runs **#119–#121**: empty location was fail-closed (now fixed live) |

**Bottom line:** Search recall is fine. **Conversion from hit → usable lead** is where yield dies. After the live geo patch, the biggest remaining killer is **creatability / entity quality** during gather, then **advisory fill** that marks survivors as low confidence.

---

## 2. Cluster / health snapshot (checked this session)

| Check                 | Result                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| API health            | `{"status":"ok","service":"sales-engine"}`                                              |
| Pods (`sales-engine`) | `backend`, `discovery-queue-worker`, `queue-worker`, `scheduler`, `redis` Running       |
| Deployed image        | `registry.digitalocean.com/con-reg/sales-engine-api:79cf4e6`                            |
| Local workspace HEAD  | `4573d77` — **behind** production (prod already has gather counters + unknown-geo keep) |

Production already includes instrumentation and a **partial territory fix** that local git does not yet have.

---

## 3. Fresh production funnel (runs #119–#130)

Compact view (hits = Serper+Hunter etc. collected; leads = returned to the user):

| Run | ICP | Query theme                     | Hits | Leads  | Hard drop | Advisory | Gather creatability | Time cut | Notes                                  |
| --- | --- | ------------------------------- | ---- | ------ | --------- | -------- | ------------------- | -------- | -------------------------------------- |
| 119 | 15  | Logistics / ecommerce ICP brief | 109  | **0**  | 0         | 0        | —                   | —        | Pre-counter era                        |
| 120 | 15  | same                            | 107  | **0**  | 0         | 0        | —                   | —        | Geo `gl=ng` on                         |
| 121 | 15  | cargo / ecommerce (typos)       | 92   | **0**  | **5**     | 0        | —                   | —        | Classic empty-location kill            |
| 122 | 15  | 3PL last-mile                   | 99   | **4**  | 5         | 0        | —                   | —        | First non-zero after geo               |
| 123 | 15  | 3PL last-mile                   | 151  | **5**  | 0         | 0        | **21**              | 3        | Creatability dominates                 |
| 124 | 15  | 3PL last-mile                   | 174  | **1**  | 0         | 0        | **23**              | 4        |                                        |
| 125 | 15  | ecommerce logistics             | 179  | **1**  | 0         | 0        | **27**              | 2        |                                        |
| 126 | 15  | ecommerce logistics             | 152  | **3**  | 0         | **2**    | **21**              | 2        | `unknown_geo_kept=2`                   |
| 127 | 14  | emerging markets / machinery    | 66   | **4**  | 2         | **4**    | 9                   | 2        | **All 4 advisory**                     |
| 128 | 11  | UK SME financing                | 148  | **0**  | 0         | 0        | **33**              | 2        | Soft-complete early                    |
| 129 | 11  | UK SME financing                | 187  | **0**  | 0         | 0        | **29**              | 3        | Soft-complete early                    |
| 130 | 11  | “Find companies in the UK…”     | 38   | **12** | 0         | **11**   | 1                   | 1        | Quota filled, **11/12 low confidence** |

### What the lead cards themselves show (samples)

After run **#130** (UK ICP 11), most saved leads are `low_confidence=true`, `icp_recommended=false`. Several cards later show **United States** locations (e.g. Norton Rose Fulbright, A&O Shearman) even though search was aimed at the UK — consistent with **keeping unknown geo at gate time**, then enrichment/extraction filling a foreign location afterward.

After run **#127** (England / emerging markets ICP 14), all four leads were advisory/low-confidence, including weak entity names and at least one India-located company.

---

## 4. How the pipeline works (stations)

```text
Confirm / chat generate
        │
        ▼
1. Build queries   ← ICP “what we search for” + fan-out variations + country clause
        │
        ▼
2. Serper / Hunter ← often 70–180 hits (working)
        │
        ▼
3. Gather/extract  ← junk titles, invalid names, empty extract, CREATABILITY, time cut
        │              ★ largest leak after the geo patch
        ▼
4. Final gates     ← wrong country drop; unknown geo → advisory + low_confidence
        │              industry miss → advisory if LinkedIn / trusted URL
        ▼
5. Lead cards      ← few cards, many marked low confidence
```

---

## 5. Root causes (layered — ordered by impact _today_)

### A. Empty location used to fail territory (mostly fixed live; still document)

**Was primary for #119–#121.**  
Serper hits carry `location: null`. Older gate always evaluated territory when ICP listed countries → empty = fail.

**Live prod (`79cf4e6`) already changed this:** territory is only evaluated when location text exists; blank location is treated as unknown and kept as advisory (`unknown_geo_kept`).

Local workspace at `4573d77` still has the old fail-closed shape — **pull/reconcile before implementing further**.

### B. Gather creatability is the main volume killer now (primary)

On #123–#129, `gather_creatability` is routinely **21–33** while hard-gate drops are often **0**.

What that means:

- Search returns articles, LinkedIn _posts_, market reports, phrase-like titles (“UK SME Funding”, “Big and Bulky”).
- Creatability correctly rejects many as “not a real company/person lead.”
- Too few **entity** hits remain before the ~150s wall clock (`gather_time_cut` 2–4).

So the user’s intuition is right: **how we search** (query structure / result mix) plus **how we filter** (creatability) jointly produce a thin list.

### C. Advisory path explains “low confidence” on the few that survive

When location is unknown or industry cannot be verified, prod keeps trusted profiles as **advisory**:

- `icp_recommended = false`
- `low_confidence = true`
- counters: `kept_advisory_profile`, `unknown_geo_kept`

Examples:

- **#127** — 4 leads, **4** advisory
- **#130** — 12 leads, **11** advisory

Filling the quota with advisory cards feels like “I got leads,” but quality UI correctly flags them. That matches “I got four and some still show low confidence.”

### D. Unknown-geo keep + later location stamp can surface wrong countries

Gate may keep a candidate while location is blank (search was geo-aimed). Later extraction/enrichment may write `United States` onto a UK-aimed run. Wrong-country hard-drop does not re-run after that stamp.

### E. Query fan-out burns time without improving entity density

Run **#127** executed **19** near-duplicate long queries (same ICP blob + “England” + hiring/funded/Forbes/YC variants). That burns Serper + wall clock; unused hit lists are still full of non-entity pages.

### F. Soft-complete / deadline

Hard budget ~150s. Under half-quota, soft-complete is supposed to keep backfilling — but #128/#129 still soft-complete with **0** leads because gather never produces creatable candidates, not because the job crashes.

### G. Secondary (not the main switch)

- Fylings / Apollo / YouTube often **0** hits in `sources_hit_count`
- Typos in ICP search text (“sipping”, “ecommerence”) hurt quality but do not explain 90+ Serper hits → 0–4 leads alone
- Frontend confirm card is not inventing empty results — backend `lead_count` is already low

---

## 6. What already changed on production (do not re-invent)

Image `79cf4e6` already has:

1. Territory evaluate-only-when-location-present (empty ≠ fail)
2. `unknown_geo_kept` / `wrong_country_dropped` counters
3. Gather counters: `gather_junk_title`, `gather_invalid_name`, `gather_empty_extract`, `gather_creatability`, `gather_time_cut`
4. `unused_hits` persisted for “Generate more”
5. Advisory keep for unknown geo + industry-only miss with trusted URL

**So the remaining strategy is not “re-fix empty location.”** It is **raise entity yield** and **stop low-confidence from being the default way we fill quota.**

---

## 7. Recommended strategy (plan only — do not implement until approved)

### Goal

When a user asks for N leads (e.g. 12–20) and search returns dozens of hits:

1. Return a **usable first batch** closer to N when entity evidence exists.
2. Prefer **ICP-recommended** cards over advisory.
3. Still **hard-drop proven wrong countries**.
4. Make every thin batch explain _which station_ emptied the funnel (already partially done via counters — surface them in UI/chat).

---

### Phase 1 — Sync + measure (must-have, low risk)

1. Bring local `main` in line with deployed `79cf4e6` (or newer) so plans match live code.
2. Add a one-page ops view or chat footnote from `result_summary.gate_stats`  
   (“Checked 150 sources → 27 failed company/person checks → 4 kept as low-confidence”).
3. Define success metrics on the next 10 Generate runs:
    - `lead_count / min(requested, 12)` ≥ 0.7 when `candidates_extracted` ≥ 40
    - `kept_advisory_profile / lead_count` ≤ 0.3 on first batch
    - `wrong_country_dropped` stays > 0 when foreign locations appear
    - `gather_creatability` rate trending down without rising junk leads

---

### Phase 2 — Search for entities, not articles (highest yield lever)

**Problem:** Queries are long ICP essays + generic boosters; Serper returns content URLs; creatability then discards them.

**Plan:**

1. **Short entity queries** from ICP industries + territory + 1–2 role/ niche tokens (not the full search-brief paragraph).
2. Bias queries toward **LinkedIn `/company/` / `/in/`**, company directories, and registries; de-prioritize pulse/posts/articles in ranking (prod already boosts LinkedIn somewhat — strengthen + filter earlier).
3. Cap fan-out: fewer, more diverse queries (e.g. 6–8) instead of 15–19 near-duplicates.
4. Optional: Serper `num` + site filters tuned for company discovery vs news.

**Success:** Higher share of hits that pass creatability; unused list has fewer article titles.

---

### Phase 3 — Creatability & gather budget (second lever)

**Problem:** 21–33 creatability drops per run with only ~1.5× quota gather cap and time cuts.

**Plan:**

1. Raise gather cap when under quota (process more hits before extract timeout).
2. Cheap prefilter: skip pulse/posts/market-report URL patterns before GLM extract.
3. For **company** mode: allow website-domain hits with clear company names even without LinkedIn, scored lower — not only LinkedIn.
4. For **people** mode: keep LinkedIn `/in/` requirement for first-batch high confidence; allow a bounded secondary pool without profile URL only if user asked for volume.
5. Spend wall clock on extract/score of entity-like hits first (already partly sorted — extend sort key using URL class).

---

### Phase 4 — Confidence & geo honesty (quality lever)

**Problem:** Quota fills with `low_confidence`; unknown-geo keep can later show US on a UK search.

**Plan:**

1. **Re-check territory after enrichment** — if location becomes a known wrong country, drop or demote out of the returned batch.
2. Split quotas: e.g. fill up to N with recommended first; advisory only tops up if `recommended < N/2`, and label clearly in chat (“4 strong matches, 8 needs review”).
3. Infer location from title/snippet/URL via `DiscoveryGeo::inferLocationFromText` **before** advisory keep (already used in places — apply consistently on Serper hit mapping).
4. Never set `low_confidence` solely because geo was blank if search was geo-aimed **and** URL is in-country TLD / `ng.linkedin.com` / similar strong proxy — treat as medium confidence instead of “low.”

---

### Phase 5 — Product / ICP hygiene (supporting)

1. Clean ICP “What we search for” text (remove definition-style essays and typos).
2. Confirm card already shows “Searching in: {territories}” — add post-run “why so few” using gate_stats.
3. Cap default generate at a number the pipeline can fill in ~150s **or** raise worker timeout only after Phase 2–3 improve entity density (timeout alone will not fix article-heavy SERPs).

---

## 8. Suggested implementation order (when approved)

| Step | Work                                                 | Risk | Expected user impact                       |
| ---- | ---------------------------------------------------- | ---- | ------------------------------------------ |
| 0    | Sync local to prod image commit                      | Low  | Avoid fixing already-fixed code            |
| 1    | Surface gate_stats in chat / UI                      | Low  | Trust + debugging                          |
| 2    | Entity-first query builder + fan-out cap             | Med  | More real companies/people in the hit list |
| 3    | Gather prefilter + creatability/budget tuning        | Med  | Higher lead_count for same Serper spend    |
| 4    | Post-enrichment geo re-check + advisory quota policy | Med  | Fewer low-confidence / wrong-country cards |
| 5    | ICP search-brief hygiene + optional timeout tune     | Low  | Cleaner inputs; better completion rate     |

**Do not** revert geo aiming (`gl` / country clause) — it is working.  
**Do not** return to fail-closed on blank location.

---

## 9. Decision needed

Please choose one:

1. **Approve Phases 1–4** as the implementation track (recommended).
2. **Approve a thinner slice** (e.g. only Phase 2 query changes + Phase 4 geo re-check).
3. **Adjust policy** — e.g. if you prefer **never** show advisory/low-confidence on first batch (empty is better than weak), say so explicitly — that will change Phase 4.

No code will be written until you approve a path.

---

## 10. Appendix — key files

| File                                                         | Role                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `app/Services/Discovery/DiscoveryOrchestrator.php`           | Gather, creatability, hard gate, advisory keep, counters |
| `app/Services/Discovery/DiscoveryGeo.php`                    | Serper geo + `inferLocationFromText`                     |
| `app/Services/Discovery/Adapters/SerperDiscoveryAdapter.php` | Search; hits often `location: null`                      |
| `app/Services/Discovery/QueryVariationGenerator.php`         | Fan-out query explosion                                  |
| `app/Services/IcpFiltering/IcpFilterService.php`             | Fail-closed when field is evaluated                      |
| `app/Services/Scoring/ScoringService.php`                    | Firmographic unknown / scoring                           |
| `docs/ZERO_LEAD_ROOT_CAUSE.md`                               | Earlier empty-location root cause (pre-`79cf4e6`)        |

### Related production IDs

- Discovery runs **#119–#130** (ICPs 11, 14, 15)
- Image **`sales-engine-api:79cf4e6`**
- Prior zero-lead analysis: runs **#119–#121**, commit **`4573d77`** (geo fail-closed introduction; later image softened empty location)
