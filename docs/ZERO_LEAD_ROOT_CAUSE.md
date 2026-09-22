# Why Generate Prospects Returns Zero Leads

**Date:** 2026-09-22  
**Status:** Root cause identified for runs #119–#121. **Follow-up:** production image `79cf4e6` already softens empty-location fail-closed; low yield / low confidence after that is covered in [`LEAD_YIELD_STRATEGY.md`](LEAD_YIELD_STRATEGY.md) (runs #119–#130).  
**Audience:** Product, ops, and engineering  
**Evidence:** Production discovery runs #119–#121, live gate checks on the deployed API, and the geo retrieval work shipped in commit `4573d77`

---

## 1. Plain-English summary (read this first)

When you click **Confirm & Generate**, the system does find companies and people on the web. It is **not** “broken” in the sense of crashing or timing out.

What happens instead:

1. Search finds dozens of candidates (often **70–100+**).
2. Before any of them become a lead card, a **location checklist** runs.
3. Almost every candidate has **no location written on the record**.
4. The checklist treats “no location” the same as “wrong country” and **throws them away**.
5. You see: _“No leads in Nigeria… met your ICP search brief.”_

So the leads are **found**, then **discarded at the final filter**. That is why the user gets nothing.

---

## 2. What we checked (so this is not a guess)

### Production run #121 (Logistics & E-commerce ICP)

| What we measured                                     | Result                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| Job status                                           | `completed` (success, not failed)            |
| Search hits collected                                | **92** (Serper 74 + Hunter 18)               |
| Leads returned to the user                           | **0**                                        |
| Dropped by location/firmographic hard gate           | **5** (the few that reached the final check) |
| Saved as “advisory” LinkedIn profiles                | **0**                                        |
| Dropped by “not a real person/company” at final step | **0**                                        |
| Time used                                            | ~146 seconds (near the hard stop)            |

The chat message for that run said leads in Nigeria / Lagos / Abuja were not found — even though search was aimed at Nigeria.

### Live proof on the production code

We asked the same checklist the app uses:

| Candidate’s location field  | Does territory pass? |
| --------------------------- | -------------------- |
| _(empty — nothing written)_ | **No — fail**        |
| `Lagos, Nigeria`            | **Yes — pass**       |
| `San Francisco, USA`        | **No — fail**        |

**Empty location fails.** That single fact explains the empty UI.

---

## 3. How lead generation is supposed to work

Think of it as a factory line with five stations.

```text
  You confirm generate
           │
           ▼
  ┌─────────────────────┐
  │ 1. Build the search │  Vague ask → use ICP “What we search for”
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 2. Search the web   │  Serper (+ Hunter, etc.)
  │    Aim at country   │  e.g. Nigeria via gl=ng + “Nigeria” in queries
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 3. Gather / extract │  Turn raw hits into people/companies
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 4. Quality gates    │  Real name? Real profile? Right country?
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 5. Show lead cards  │  What the user sees in chat
  └─────────────────────┘
```

Stations 1–2 are working. Station 4 is where the batch dies.

---

## 4. What recently changed (and why it matters)

Documented in:

- [`docs/backend_implementation_plan.md`](backend_implementation_plan.md) — status line **“Generate Prospects geo retrieval (2026-09-22)”**
- [`docs/frontend_implementation_plan.md`](frontend_implementation_plan.md) — confirm card **“Searching in: {territories}”**

### Intent of that work (good idea)

Geography should mean something:

- **Search** in the right country (Serper `location` / `gl`, plus country words in queries).
- **Reject** candidates that are clearly in another country.
- Do **not** let a LinkedIn profile alone override a failed country check.

That intent is sound for quality.

### What the implementation actually did

| Piece                           | What it does now                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DiscoveryGeo`                  | Correctly aims Serper at Nigeria (`location=Lagos, Nigeria`, `gl=ng`)                                       |
| Serper hit mapping              | Sets each hit’s `location` field to **`null`** (geo is only on the search request, not copied onto the hit) |
| Hard gate (`icpHardGateResult`) | If the ICP has territories, it **always** checks territory — even when the candidate has no location text   |
| Filter (`IcpFilterService`)     | Empty location = **fail closed**                                                                            |
| Advisory LinkedIn keep          | Only helps when **industry** fails but **territory already passed** — so it cannot save “no location” cases |

So the product decided: “search in Nigeria, then require Nigeria.”  
But most candidates never get a Nigeria label written on them → they fail the require step.

---

## 5. Root cause (exact)

### One sentence

**After geo-biased search, candidates usually have a blank location; the territory hard-gate always runs when the ICP lists countries, and blank location is treated as a fail — so every lead is discarded.**

### Where in code

1. **Hits arrive with no location**  
   `SerperDiscoveryAdapter` builds hits with `location: null`.

2. **Gate always evaluates territory if ICP has territories**  
   In `DiscoveryOrchestrator::icpHardGateResult`:
    - If `$brief->territories` is not empty → add `'territory'` to the fields being checked
    - Candidate territory is taken from extracted `location` / `territory` / `city` (often still empty)

3. **Empty = fail**  
   `IcpFilterService` fails closed when the field is checked and the value is empty.

4. **LinkedIn safety net does not apply**  
   Territory failure is a hard stop. Advisory keep only runs for industry-only failure after territory already passed.

### Why earlier “fixes” did not restore yield

| Earlier change                             | Why it did not fix #121                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Soft-complete under half quota             | Run still finishes; problem is filters, not early stop                        |
| Keep unknown firmographics if LinkedIn URL | Superseded: territory miss is always drop                                     |
| Keep on hard-gate fail if LinkedIn URL     | Narrowed to **industry-only** fail; territory still drops                     |
| Geo bias on queries (`… Nigeria`)          | Improves _search aiming_; does not fill the _location field_ used by the gate |

### Secondary contributors (real, but not the main switch)

These explain why only ~5 candidates even hit the hard-gate counter, while ~87 never get that far:

- Gather stage drops (junk titles, empty AI extract, creatability) **without** writing counters to `result_summary`
- Wall clock near 150s → gather loop can stop early (`remainingSeconds < 20`)
- Search brief quality (typos like “sipping” / “ecommerence”) reduces hit quality but **does not** explain zero leads when 74 Serper hits already exist

**Primary switch = blank location fails territory.** Fix that, and yield can return while still rejecting true foreign locations.

---

## 6. Flow of where leads are lost (run #121)

```text
  92 hits found
       │
       ▼
  Gather / extract
  (most never become “finalists”
   — few counters today)
       │
       ▼
  Only ~5 reach final gates
       │
       ▼
  Territory check: location empty?
       │
       ├─ Yes → DROP  (counts as dropped_hard_gate)
       └─ Known wrong country → DROP
       └─ Known Nigeria → would PASS (almost none have this stamped)
       │
       ▼
  0 leads shown to user
```

---

## 7. Recommended plan (do not implement until approved)

### Goal

Keep the good rule: **reject known wrong countries.**  
Change the bad rule: **do not treat “we don’t know the location yet” as “wrong country.”**

### Step A — Fix territory semantics (must-have)

In the Discovery hard gate:

- If location is **missing / unknown** → **do not fail** territory (skip the field, or treat as unknown).
- If location is **known and another country** → **still hard-drop**.
- Optionally, before the gate, try to fill location from title/snippet/URL using `DiscoveryGeo::inferLocationFromText`.

### Step B — Align advisory keep (must-have)

- Trusted LinkedIn `/in/` or `/company/` + **unknown** geo → keep as advisory (not “ICP recommended”).
- Trusted LinkedIn + **proven wrong country** → still drop.

### Step C — Make the next failure obvious (must-have)

Add gather-stage counters to `result_summary`, for example:

- `gather_prefilter`
- `gather_empty_extract`
- `gather_creatability`
- `gather_time_cut`

So “0 leads” always shows _which_ station emptied the belt.

### Step D — Optional hygiene (nice-to-have)

- Clean ICP “What we search for” text (fix typos / definition-style phrasing).
- Fylings DNS (`api.fylings.com` unresolved) is separate ops work; it is not why Serper batches go to zero.

### Success criteria after the fix

- Vague Generate on Logistics (Nigeria territories) returns a usable first batch when web hits exist.
- Candidates clearly in the US/UK/etc. still do not appear.
- `result_summary` shows non-zero `candidates_passed_gates` and/or `kept_advisory_profile` when location text is missing but search was geo-aimed at Nigeria.
- Full backend test suite stays green with new unit tests for: empty location ≠ fail; USA location = fail; Nigeria location = pass.

---

## 8. What this is not

| Not the root cause         | Why we ruled it out                                               |
| -------------------------- | ----------------------------------------------------------------- |
| API / queue job crash      | Runs finish as `completed`                                        |
| Serper key missing         | 74 organic hits on #121                                           |
| “No one in Nigeria exists” | Search is aimed at Nigeria; gate kills blank labels               |
| Frontend confirm card      | Backend returns empty lead list; chat narrates zero               |
| Soft-complete alone        | Soft-complete flag false on #121; filters already emptied the set |

---

## 9. Decision needed

Please review this root cause and the plan in §7.

- **Approve** → implement Steps A–C (and D if you want).
- **Adjust** → say which rule you prefer if you want missing location to stay fail-closed (that choice will keep producing empty batches until hits carry real location text).

---

## 10. Appendix — key files

| File                                                         | Role                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `app/Services/Discovery/DiscoveryGeo.php`                    | Country aiming for Serper/Hunter                       |
| `app/Services/Discovery/Adapters/SerperDiscoveryAdapter.php` | Search + hits with `location: null`                    |
| `app/Services/Discovery/DiscoveryOrchestrator.php`           | Gather, `icpHardGateResult`, advisory keep             |
| `app/Services/IcpFiltering/IcpFilterService.php`             | Fail-closed checklist                                  |
| `docs/backend_implementation_plan.md`                        | Documents geo retrieval + fail-closed missing location |
| `docs/frontend_implementation_plan.md`                       | Confirm card “Searching in…”                           |

### Related production IDs

- Discovery runs **#119, #120, #121** (Logistics ICP 15)
- Commit introducing geo fail-closed: **`4573d77`**
