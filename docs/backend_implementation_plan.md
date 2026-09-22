# Sales Engine — Backend Implementation Plan (v2)
### Rebuilding Buyer Signal Detection & Enrichment around `new_plan.md`

**Audience note:** Written so both engineers and non-technical stakeholders can follow it. Every phase opens with a **Plain-English summary** (what we're doing and why it matters to the business), followed by **Technical implementation details** (files, code, data model) for the engineering team.

**Repo:** `sales-engine` (Laravel backend)
**Companion doc:** `frontend_implementation_plan.md` (the-factory / Next.js)
**Source spec:** `new_plan.md`
**Prior work being extended, not discarded:** `implementation.md`, `docs/SOCIAL_LISTENING_FIELD_GAP.md`, `docs/SOCIAL_LISTENING_PERSONALIZATION_PROPOSAL.md`

---

## Implementation status (updated as work lands)

- ✅ **Generate Prospects geo retrieval (2026-09-22)** — Discovery now geo-retrieves ICP territory (Serper `location`/`gl` plus an always-on country clause on the default 12-lead run) and fail-closes missing or mismatched location. LinkedIn advisory keep no longer bypasses a failed territory match. Geography is an explicit exception to “ICP fields never become search text”; size, revenue, and roles still do not. Supersedes the Phase 2.2 note that Discovery had no hard gate, **for territory only**.
- ✅ **Phase 1 (data model)** — `signal_type_definitions`, Stage 1-3 columns on `social_signals`, `enrichment_logs` linkage. Shipped, tested.
- ✅ **Phase 2.2 (Stage 1 hard filter)** — `IcpFilterService` built and wired into `SocialListeningOrchestrator` only (industry + territory, since neither pipeline can supply companySize/revenue yet — see the service's docblock). **Not wired into `DiscoveryOrchestrator`**, by deliberate decision: Discovery recently added an intentional "secondary pool" UX for below-ICP leads instead of hard-dropping them; overriding that wasn't this rebuild's call to make unilaterally.
- ✅ **Phase 3 (partial)** — `SignalGroundingGate` (mandatory source_url/source_date, hard reject on either missing) shipped and wired in, replacing the old "unknown date passes with a discount" behavior. `SignalTypeRegistry` + seeder (4 core spec types + 2 case-study packs) shipped. Per-signal-type query generation (`buildSignalTypeQueries`) shipped as **strictly opt-in** — an ICP must set `config.signalTypePacks` (not yet exposed in the frontend ICP builder) or zero extra queries/cost are incurred. `signal_type_key` now populates honestly (only for hits found via a tagged signal-type query; never guessed from the legacy taxonomy).
- ✅ **Phase 5 (partial)** — `SocialSignalResource` now exposes `icpFilter`, `discreteSignalType`, `territory`, `namedPeople`, `enrichment.{status,attemptedAt}`, additive to all existing fields.
- ✅ **Phase 4 (Stage 3 extension)** — `SignalToLeadService` now loops every named person on a signal (not just one), logging a separate `EnrichmentLog` attempt per person; a signal naming no person at all falls back to `RoleBasedContactSearch` against the ICP's `decisionMakers` roles via a new `ApolloPersonEnricher::enrichByTitle()`. `social_signals.enrichment_status` is now written for real (`attempted_found` / `attempted_not_found`) whenever an attempt is made, and stays `not_attempted` when there was genuinely nothing to enrich. Caught and fixed a real latent bug in the process: the old single-person fallback used the Lead's own display name, which can itself be the placeholder "Social prospect" — that would have "enriched" a placeholder string as if it were a real person's name.
- ✅ **Phase 6 (partial)** — `SocialListeningRun.result_summary` is now a structured object (`totalChecked`, `qualified`, `rejected.{icpMismatch,missingSourceUrl,missingSourceDate,stale,total}`) instead of a human-readable sentence, with a backward-compatible `array` cast (legacy runs with a plain-string summary read back as `null` for this field, same graceful-degradation pattern as every other new field in this rebuild). This is what the frontend's pipeline-visibility panel now consumes.
- ✅ **Phase 2.4 (stop feeding ICP fields into query text)** — caught during a final acceptance-criteria audit: `buildQueries()`, the *primary* query generator every scan uses, was still sending `industries`/`territories`/`decisionMakers` into the GLM prompt (and the non-LLM fallback still concatenated them into a literal search string) — the exact anti-pattern the spec opens with, still live for 100% of runs despite Phase 3's opt-in per-type queries existing alongside it. Fixed: only `customPrompt`/`description` now seed query generation; industries/territories/decisionMakers are structured Stage 1 filter fields only, applied post-detection via `IcpFilterService`. **Accepted tradeoff:** orgs with no `customPrompt` get a weaker, more generic fallback query than before — this was a deliberate decision (see conversation) to prioritize spec compliance over recall for that specific case; Stage 1 filtering + `min_score` remain the quality backstop. Locked in with a dedicated test asserting distinctive ICP field values never appear in the GLM request body.
- ✅ **Dedicated per-type extraction (lighter-weight than the original plan's `SignalExtractor`)** — rather than a separate service with its own LLM call (extra cost/latency/risk for marginal gain), `SocialSignalEnricher::enrich()` now accepts the matched `SignalTypeDefinition` and sharpens the *same* extraction prompt with that type's own trigger description, explicitly telling the model to say so honestly if a hit doesn't actually match on closer reading rather than forcing a fit. For types that name a person (`feeds_enrichment: true`, e.g. Leadership Hire in Territory), it also now asks for `named_people` explicitly. This is what finally makes Phase 4's multi-person enrichment loop reachable in practice — `named_people` was structurally supported since Phase 1 but nothing ever populated it until now. Verified end-to-end: a Leadership-Hire-tagged hit naming two people now produces a signal with `signal_type_key: "leadership_hire_in_territory"` and `named_people: ["Jane Doe", "John Smith"]`, ready for Phase 4's per-person enrichment loop to actually run. Zero prompt change for the untagged (default) path beyond always requesting `named_people` (harmless additive field).
- ✅ **Phase 5 completion** — `SocialSignalResource.enrichment.contacts[]` now exposes per-attempt detail (person, provider, tier, found email/phone), sourced from the `enrichmentLogs` relation which both the list and show endpoints now eager-load (`whenLoaded` — omitted entirely rather than firing a query per signal when a caller doesn't eager-load it). Caught a real subtlety while testing: `JsonResource::toArray()` does **not** strip an unresolved `whenLoaded()` — it leaves a `MissingValue` object sitting at the key; only `->resolve()` (what the actual HTTP response pipeline calls) filters it out. A test asserting the key was absent via `toArray()` directly gave a false failure until switched to `->resolve()`.
- ✅ **Phase 8 completion (feature flag)** — `social_listening_settings.icp_filter_enabled` (default `true`, seeded from `config('services.social_listening.icp_filter_enabled_default')`) is a real per-org/per-ICP kill switch for Stage 1's hard gate: when off, `IcpFilterService` evaluates zero fields (all pass), and `icp_filter_reasons` honestly reflects "not evaluated" rather than fabricating a genuine match. Lets ops revert one misbehaving org to the old soft-scoring behavior without a deploy.
- ✅ **`docs/SOCIAL_LISTENING_FIELD_GAP.md`** now carries a status banner pointing to the current contract (`FRONTEND_INTEGRATION.md`) rather than being silently stale — kept as the historical record it is, not rewritten.
- ✅ **Phase 7 completion** — added per-signal-type test coverage confirming the 3 non-person default-pack types (New Market Entry, Distribution/Partnership Announcement, Export/Trade Activity Mention) do *not* trigger the named-people extraction instruction, complementing the existing Leadership-Hire-does-trigger-it test. Caught a real PHPUnit gotcha: this codebase uses attribute-based `#[DataProvider]`, not the docblock `@dataProvider` annotation — the latter silently no-ops on this PHPUnit version (tests run with zero arguments and immediately error).
- ✅ **`LeadResource.contact_status` tri-state** — built after all, on reflection this was narrower than first assessed: it's purely additive (a new `EnrichedLeadProfile->enrichmentAttempted` flag threaded through `LeadProfileEnrichmentService::enrich()`/`enrichCompanyDecisionMaker()` into `Lead.meta.contact_status`), not a change to Discovery's ICP-gating/scoring/secondary-pool logic — so it didn't actually reopen the excluded decision, just implement a sibling of it. `not_attempted` when `enrichContactDetails` is off on the ICP; `found`/`not_found` otherwise, based on the existing `contact_ready` heuristic. `contact_ready` is untouched for backward compatibility. Null (not a guess) on leads created before this shipped.
- All work so far: **272/272 backend tests passing**, full regression run after every change.

### Acceptance criteria scorecard (re-verified against `new_plan.md`)

| Criterion | Status |
|---|---|
| No signal without source URL + date | ✅ Met — `SignalGroundingGate`, tested |
| No signal older than recency window | ✅ Met — same gate, tested |
| Signals tagged by discrete signal type, not generic topic | ⚠️ Only for ICPs that opt into a `signalTypePack` — `discreteSignalType` stays null otherwise (this is honest, not a mislabel, but it means most orgs today still see only the legacy taxonomy) |
| Every named person has a logged enrichment attempt | ✅ Met — never left undetermined; attempts fire at signal→lead conversion time, not scan time, which is consistent with the spec's own "separate build, not automatic" framing for Stage 3 |
| ICP fields never sent as free-text search queries | ✅ Met as of this fix, for both the opt-in per-type path and the primary general-query path |

---

## Changelog — why this document was revised

The first version of this plan (v1) was written against an older snapshot of the backend. Since then, **~29 commits** landed that materially changed the enrichment layer, the discovery/scoring layer, and CRM sync hygiene. This is a full re-audit against the current code, and the plan below is rewritten to build **on top of** what actually exists now rather than proposing things that already shipped in a different shape.

**What's genuinely new and good (keep, extend — don't rebuild):**
- A real, cost-tiered contact enrichment waterfall now exists: `app/Services/Enrichment/ContactEnrichmentOrchestrator.php` (Tier 1: Serper snippets + GLM → Tier 2: Bytemine/Cleanlist → Tier 3: Apollo/Hunter), with every attempt written to a durable `EnrichmentLog` table via `EnrichmentUsageTracker`. This is most of Stage 3 already.
- A dedicated `SignalToLeadService` now exists — it's the explicit, separate "turn a signal into a real lead" step the spec asks for (not automatic from search), and it's where enrichment gets triggered today.
- CRM sync hygiene is materially better: `DuplicateLeadChecker`, `LeadFieldValidator`, character-length fixes — good, preserve as-is.
- A new social source, `MetaGraphPagesAdapter`, was added (official Facebook/Instagram business page posts) — widens Stage 2 source coverage.

**What got worse or stayed the same relative to `new_plan.md` (this is the real work):**
- `ScoringService::score()`'s system prompt now **explicitly and intentionally** states: *"ICP fit is advisory — results that answer the query but fall outside ICP industries/territories should still have high query_relevance_score."* This is a deliberate design decision in the current code that moves further *away* from the spec's core demand (ICP as a hard filter), not closer. This needs a conscious, documented reconciliation, not a silent overwrite — see Phase 2.
- `social_signals` table schema is **unchanged** since the last audit: `post_url` and `posted_at` are still nullable, and `SignalFreshnessScorer::isStale()` still treats an unknown date as "not stale" (passes through). The spec's hardest rule — *"if source_url or source_date is missing, the signal is discarded"* — is still not enforced anywhere.
- Signal types are still one flat, generic taxonomy (`recommendation`, `switching`, `pricing`, `funding_event`, etc.), classified after the fact by one shared LLM prompt. No discrete, per-event-type trigger definitions (New Market Entry, Leadership Hire in Territory, etc.) exist yet.
- `ContactEnrichmentOrchestrator` enriches exactly **one** person (`profile_name`) per signal, and only when a non-empty, non-"unknown" name exists (`SignalToLeadService::enrichContactsIntoMeta()`). There is no `named_people` list, and no role-based company-only search fallback when no person is named — Stage 3's second path from the spec ("for companies with no named person yet, run a role-based search using the ICP's target roles") doesn't exist yet.
- `IcpBrief::searchQuery()` and its `icpFallbackSearchQuery()` still assemble industries/territories/decisionMakers into a literal search string when there's no free-text user query — the exact anti-pattern the spec opens with is still present, and has grown a second layer (`QueryVariationGenerator`, multi-query fan-out) built on top of it.

This plan now treats **Stage 3 (enrichment) as roughly 60% done — extend, don't replace.** Stages 1 and 2 remain the real gap, and Stage 1 now has an explicit, documented policy conflict to resolve first.

---

## 0. Why we're doing this (context for everyone)

Today, when someone sets up a target customer profile ("ICP") and asks the system to find opportunities, the system treats the ICP description like a search phrase — it hands "expanded into Africa in the last 6 months" straight to a search/AI engine and gets back a pile of loosely-related results: old news, general commentary, big established companies that technically mention Africa somewhere. There's no guarantee a result has a real source link, no guarantee it's recent, and no automatic way to find a real, contactable person at the company.

`new_plan.md` asks us to split this into three separate, independently verifiable steps:

1. **ICP Filter** — a hard checklist (industry, size, revenue, territory, roles) that decides *who qualifies*. This never gets sent to a search engine as a sentence — it's used to check candidates after they're found.
2. **Signal Detection** — a set of very specific "event trackers" (e.g. "a company just opened an office in Kenya," not "companies doing well in Africa"). Every detected event must have a real source link and a real publish date, or it's thrown away — not shown with a caveat, thrown away.
3. **Enrichment** — once we have a company or a named person from a signal, a separate, explicit step looks them up in a contact database to get a verified email/LinkedIn. If nothing is found, we say so clearly — we never just go quiet about it.

The last two months of backend work built real product value in a *different, adjacent* direction — a chat-driven, query-first "find me leads" experience with genuinely good enrichment plumbing underneath it. That work is not wasted; most of it (adapters, Apollo/Hunter/Bytemine/Cleanlist integrations, CRM sync hygiene, the enrichment waterfall) is exactly the raw material Stage 3 needs. What's missing is the **discipline layer on top**: a hard ICP gate, discrete signal-type detectors, and mandatory source/date grounding — applied without breaking the query-driven UX that's already shipped and working.

---

## 1. Current-state summary (re-audited)

| Concern | Current file(s) | Current behavior |
|---|---|---|
| ICP storage | `app/Models/IcpProfile.php`, `icp_profiles` table | Industries, territories, companySizes, revenueRanges, decisionMakers, minMatchScore, customPrompt — good field coverage, unchanged |
| ICP → query (free-text mode) | `IcpBrief::searchQuery()`, `QueryVariationGenerator`, `LeadQueryNormalizer`, `QueryIntentService` | Heavily reworked for **higher-yield free-text search** (multi-query fan-out via `withSearchQueryOverride()`/`withTarget()`, prospect-count stripping, generic-request detection). This is good UX work, but it's all downstream of treating firmographic ICP fields as query fuel when there's no user query (`icpFallbackSearchQuery()`) |
| ICP as a ranking signal | `ScoringService::score()` | **Explicitly documented as advisory now** — GLM prompt literally instructs "ICP fit is advisory." `priority_score` blends `query_relevance_score` (65%) and `icp_fit_score` (35%) when there's a user query; ICP never gates, only nudges |
| Discovery (company/people search) | `DiscoveryOrchestrator.php` | Search → extract → score → (maybe) enrich. No hard ICP gate; `icp_recommended` remains a soft flag on the lead payload |
| Social Listening (event/opportunity search) | `SocialListeningOrchestrator.php`, `SocialSignalEnricher.php` | Still one fused LLM call per hit doing classification + scoring + all enrichment framing. Now pulls from an additional source (`MetaGraphPagesAdapter`) but detection logic itself is unchanged |
| Source/date requirements | `social_signals` table (unchanged since last audit) | `post_url` and `posted_at` both nullable; `SignalFreshnessScorer::isStale()` returns `false` (not stale) for a `null` date — undated hits still pass through with only a mild 0.85 score discount |
| Enrichment (person-level) | `ContactEnrichmentOrchestrator.php` (**new**), `EnrichmentUsageTracker.php` (**new**), `EnrichmentLog` model (**new**), `BytemineEnricher.php`, `CleanlistEnricher.php` (**new**), `ApolloPersonEnricher.php`, `HunterEmailEnricher.php` | A real 3-tier waterfall now exists, with a durable attempt log. Wired into `SignalToLeadService::enrichContactsIntoMeta()` — triggered explicitly when a signal converts to a lead, which matches the spec's "separate build, not automatic" intent |
| Signal → Lead conversion | `SignalToLeadService.php` (**new**) | Handles company/individual distinction, dedupes against existing `lead_id`, resolves CRM destination, pushes to CRM, triggers enrichment. Good architectural seam — this is where Stage 1's hard gate and Stage 3's expanded logic both belong |
| "Not found" logging | `EnrichmentLog` (`found_email`, `found_phone` booleans per attempt) | Exists at the **attempt** level (good — this is real progress) but not surfaced back onto the `SocialSignal`/`Lead` record as a clear tri-state (`not_attempted` / `found` / `not_found`) for the UI to read directly |
| CRM sync hygiene | `DuplicateLeadChecker.php`, `LeadFieldValidator.php` (**new**) | Solid, unrelated to the 3-stage rebuild — preserve untouched |

**Bottom line of the re-audit:** Stage 3 has had real, good investment since the last review — we build on it, not around it. Stages 1 and 2 are still the gap, and Stage 1 now requires an explicit policy decision (see Phase 2) because the codebase has moved further toward "ICP as a vibe" rather than closer to "ICP as a gate."

---

## 2. Target architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌────────────────────┐
│   STAGE 1        │      │   STAGE 2             │      │   STAGE 3           │
│   ICP Filter     │─────▶│   Signal Detection     │─────▶│   Enrichment        │
│  (hard checklist, │      │ (per-signal-type       │      │ (existing waterfall:│
│  two modes — see  │      │  detectors, source+date│      │  snippets→Bytemine/ │
│  Phase 2)          │      │  mandatory)             │      │  Cleanlist→Apollo/  │
│                   │      │                         │      │  Hunter — extended) │
└─────────────────┘      └──────────────────────┘      └────────────────────┘
      pass/fail                 keep/discard                found/not-found
   (never a search query   (audit trail: source_url,      (already logged via
    in ICP-driven mode)     source_date, signal_type)       EnrichmentLog — extend
                                                              to signal/lead status)
```

Each stage becomes its own service with its own input/output contract and its own tests, so a company can fail Stage 1 and never touch Stage 2, and a signal missing a source/date fails Stage 2 and never touches Stage 3 — exactly as the spec requires, while preserving the free-text "chat search" experience that's had significant recent investment.

---

## Phase 1 — Data model: give every stage a place to record its work

**Plain-English summary:** Before changing any logic, we need database columns/tables to store the outcome of each stage separately — was this checked against ICP, and how? What specific event type matched, with what source link and date? Was enrichment attempted, and what happened? Most of Stage 3's storage already exists (`EnrichmentLog`) — this phase fills the Stage 1/2 gaps and links Stage 3's existing log back onto the signal record.

**Technical details:**

### 1.1 New table: `signal_type_definitions`
Replaces the hardcoded `SocialSignalEnricher::CANONICAL_SIGNAL_TYPES` array with a config-driven registry, so new verticals (the spec's Case Study 1/2 pattern) can be added as data, not code.

```php
Schema::create('signal_type_definitions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete(); // null = global/system default
    $table->string('key', 64); // e.g. 'new_market_entry', 'leadership_hire_in_territory'
    $table->string('label', 128);
    $table->text('trigger_description'); // human + LLM-facing definition of what counts as a match
    $table->text('example_valid')->nullable();
    $table->text('example_invalid')->nullable();
    $table->boolean('feeds_enrichment')->default(false); // e.g. Leadership Hire = true
    $table->unsignedTinyInteger('default_recency_window_days')->default(180); // spec default: 6 months
    $table->boolean('active')->default(true);
    $table->timestamps();
    $table->unique(['organization_id', 'key']);
});
```

### 1.2 `social_signals` table — enforce and extend
```php
Schema::table('social_signals', function (Blueprint $table) {
    $table->string('source_url', 2048)->nullable(false)->change(); // enforced at application layer, see Phase 3.4
    $table->date('source_date')->nullable(false)->change();

    // Stage 1 audit trail
    $table->boolean('icp_filter_passed')->default(false)->after('icp_profile_id');
    $table->json('icp_filter_reasons')->nullable()->after('icp_filter_passed');

    // Stage 2: structured signal detection
    $table->string('signal_type_key', 64)->nullable()->after('signal_type');
    $table->json('named_people')->nullable()->after('signal_type_key'); // list<string>, spec's record shape
    $table->string('territory', 255)->nullable()->after('location_text');

    // Stage 3: roll up EnrichmentLog attempts onto the signal for fast UI reads
    $table->string('enrichment_status', 24)->default('not_attempted'); // not_attempted | attempted_found | attempted_not_found
    $table->timestamp('enrichment_attempted_at')->nullable();
});
```
> `nullable(false)` cannot be enforced retroactively on existing rows without real data — the hard rejection lives in application code (Phase 3.4), not a DB constraint that would break history.

### 1.3 Link `EnrichmentLog` to `SocialSignal` (small addition, not a new table)
`EnrichmentLog` already has `lead_id`; add a nullable `social_signal_id` so an enrichment attempt triggered from the Social Listening path is traceable back to the originating signal, not just the resulting lead:
```php
Schema::table('enrichment_logs', function (Blueprint $table) {
    $table->foreignId('social_signal_id')->nullable()->after('lead_id')->constrained('social_signals')->nullOnDelete();
});
```
And add `person_index` (int, default 0) so multiple named-people enrichment attempts against the same signal are distinguishable (Phase 4.2).

### 1.4 `icp_profiles` — no schema change needed
`config` JSON already has everything Stage 1 needs. The fix is entirely in *how* these fields are used (Phase 2), matching the existing project precedent of not redesigning the ICP schema unless required.

**Deliverables:** migrations for 1.1–1.3, updated `SocialSignal::$fillable`/`casts()`, updated `EnrichmentLog::$fillable` for the new columns.

---

## Phase 2 — Stage 1: resolve the "ICP is advisory" conflict, then build a real hard gate

**Plain-English summary:** This is the phase that changed most since the last audit. The engineering team's recent work made the AI's scoring instructions *explicitly* say "ICP fit is optional, the search words matter more" — which is the opposite of what the new spec wants. Before we can build a hard filter, we need to decide, on purpose, when the system is allowed to be flexible (someone typing their own search — they should get what they asked for) and when it must be strict (an automatic scan running against a saved ICP profile with no live human typing a query — that must obey the checklist exactly). Right now that distinction exists in the code (`hasUserQuery()`) but the ICP-driven path still isn't a hard gate; it's just a weaker version of the same soft scoring.

**Technical details:**

### 2.1 Formal two-mode policy (make the existing `hasUserQuery()` split load-bearing, not cosmetic)
The codebase already has the right primitive — `IcpBrief::hasUserQuery()` — used to decide search-query construction. We extend it to also govern **filtering strictness**:

- **Query mode** (`hasUserQuery() === true`, i.e. someone typed a specific ask in chat): current "advisory" scoring behavior is *correct* and stays as-is. A user asking "find me tech companies in Kenya even if they're not exactly my ICP" should get real answers. No behavior change here — this preserves all the recent query-relevance investment (`QueryVariationGenerator`, `LeadQueryNormalizer`, multi-query fan-out).
- **ICP-driven mode** (`hasUserQuery() === false` — scheduled/automatic scans, "generate leads from my ICP" with no free text, and **all** Social Listening runs, which are always ICP-driven by definition): Stage 1 becomes a **hard, deterministic gate** — no LLM, no "advisory" language, pass or fail.

This is a policy decision, not a code preference — flag it explicitly to product/stakeholders as: *"Chat search stays flexible. Saved-ICP automatic scans become strict."* This resolves the conflict without walking back the recent query-relevance work.

### 2.2 New service: `app/Services/IcpFiltering/IcpFilterService.php`
```php
class IcpFilterService
{
    public function passes(IcpBrief $brief, CandidateCompany $candidate): IcpFilterResult
    {
        // Pure, deterministic, no LLM call:
        // - industry: candidate industry must overlap $brief->industries (empty list = any)
        // - companySize: candidate size bucket must be in $brief->companySizes
        // - revenue: candidate revenue must fall in one of $brief->revenueRanges
        // - territory: candidate territory must match $brief->territories
        // Returns IcpFilterResult { passed: bool, reasons: array<string, bool> } — one reason per field
    }
}
```
`customPrompt` is explicitly **not** used here — it's Stage 2 interest context, matching the spec's own field table, which never lists `customPrompt` under Stage 1.

### 2.3 Apply the gate only in ICP-driven mode
- `DiscoveryOrchestrator::finalizeCandidates()`: when `! $brief->hasUserQuery()`, call `IcpFilterService::passes()` and exclude failures outright (today they're just tagged `icp_recommended: false` and still shown). When `hasUserQuery() === true`, keep current behavior unchanged.
- `SocialListeningOrchestrator::run()`: **always** ICP-driven (there's no live chat query in a scheduled scan) — the gate always applies here. See Phase 3.5 for exact wiring order.

### 2.4 Stop feeding structured ICP fields into search-query text, in ICP-driven mode only
`IcpBrief::icpFallbackSearchQuery()` and `SocialListeningOrchestrator::buildQueries()` currently assemble industries/territories/decisionMakers into literal query text when there's no free-text query — this is precisely the anti-pattern the spec opens with, and it only fires in ICP-driven mode (by construction — `searchQuery()` only calls `icpFallbackSearchQuery()` when `hasUserQuery()` is false). Replace this fallback with the signal-type-driven query builder from Phase 3.2, which uses `customPrompt`/`description` as interest context and **signal-type trigger patterns** as the actual query seed — not raw firmographic fields.

**Deliverables:** documented two-mode policy (short internal doc, referenced from code comments at the `hasUserQuery()` branch points), `IcpFilterService` + `IcpFilterResult` DTO, unit tests per field, updated `DiscoveryOrchestrator`/`SocialListeningOrchestrator` call sites, regression tests proving query-mode chat search behavior is byte-for-byte unchanged.

---

## Phase 3 — Stage 2: signal detection as discrete, source-grounded event trackers

**Plain-English summary:** Instead of one AI prompt trying to find "anything interesting" and sorting it into a generic bucket afterward, we build a library of specific event definitions — "a company opened an office somewhere new," "a company hired a country manager," etc. — searched for individually, with mandatory grounding. This phase is unchanged in substance from the last audit (this part of the backend hasn't moved), except it now needs to also search the new `MetaGraphPagesAdapter` source and integrate with `SignalToLeadService` as the natural downstream consumer.

**Technical details:**

### 3.1 New service: `app/Services/SignalDetection/SignalTypeRegistry.php`
Loads active `signal_type_definitions` rows (global defaults + org-specific packs).

### 3.2 Rebuild `SocialListeningOrchestrator::buildQueries()` to be per-signal-type
One focused query set per active signal type (bounded to control API spend — Serper *and* the new Meta Graph budget both feed the existing `daily_api_cap` check in `SocialListeningOrchestrator::run()`, which already accounts for `meta_graph` as a provider — good, no change needed there):

```php
// app/Services/SignalDetection/SignalQueryBuilder.php
public function buildQueriesForType(SignalTypeDefinition $type, IcpBrief $brief): array
{
    // system prompt = $type->trigger_description + example_valid/example_invalid pair
    // user payload = territories + customPrompt (interest context only)
}
```

### 3.3 New service: `app/Services/SignalDetection/SignalExtractor.php`
Replaces the after-the-fact classification in `SocialSignalEnricher::normalizeSignalType()`. Since we now know which signal type generated each query, extraction is targeted, not guessed:

```php
final class DetectedSignal
{
    public function __construct(
        public readonly string $company,
        public readonly string $signalTypeKey,
        public readonly string $description,
        public readonly ?string $sourceUrl,
        public readonly ?\DateTimeImmutable $sourceDate,
        public readonly ?string $territory,
        /** @var list<string> */
        public readonly array $namedPeople,
    ) {}
}
```

### 3.4 Hard gate — the mandatory-grounding rule (still the single most important change in this plan)
```php
// app/Services/SignalDetection/SignalGroundingGate.php
class SignalGroundingGate
{
    public function admit(DetectedSignal $signal, int $recencyWindowDays): GateResult
    {
        if (blank($signal->sourceUrl))   return GateResult::reject('missing_source_url');
        if ($signal->sourceDate === null) return GateResult::reject('missing_source_date');
        if ($signal->sourceDate < now()->subDays($recencyWindowDays)) return GateResult::reject('stale');
        return GateResult::admit();
    }
}
```
This replaces `SignalFreshnessScorer::isStale()`'s current behavior where a `null` date is treated as "not stale" and passes through with a discount. Under the new gate, a null date **always rejects**, no exceptions. `SignalFreshnessScorer` itself is kept for its actual job — the freshness *scoring curve* for signals that already passed the hard gate — but its "unknown date = 0.85 factor" branch is deleted since unknown dates never reach scoring anymore.

### 3.5 Wire Stage 1 (Phase 2) and Stage 2 in the right order
```php
foreach ($detectedSignals as $signal) {
    $gateResult = $this->groundingGate->admit($signal, $recencyWindowDays);
    if (! $gateResult->admitted) { $run->incrementRejected($gateResult->reason); continue; }

    $icpResult = $this->icpFilter->passes($brief, $signal->asCandidateCompany()); // always ICP-driven mode here
    if (! $icpResult->passed) { $run->incrementRejected('icp_mismatch'); continue; }

    // → proceed to Stage 3 via SignalToLeadService / ContactEnrichmentOrchestrator (Phase 4)
}
```

### 3.6 Seed the built-in signal types + two case-study packs
Same as before: the spec's four core types (New Market Entry, Distribution/Partnership Announcement, Leadership Hire in Territory, Export/Trade Activity Mention), plus the software-dev vertical pack and the Lagos corporate-transport pack, as optional attachable sets. New verticals become **data**, not code — this directly operationalizes the spec's closing point that the architecture doesn't change per client, only the signal-type definitions do.

**Deliverables:** `SignalTypeRegistry`, `SignalQueryBuilder`, `SignalExtractor`, `SignalGroundingGate`, seeders, unit tests per signal type using the spec's own valid/invalid example pairs as fixtures, feature test proving null source_url/date always rejects, regression test confirming `MetaGraphPagesAdapter` hits flow through the same gate as Serper hits.

---

## Phase 4 — Stage 3: extend the existing enrichment waterfall, don't replace it

**Plain-English summary:** The good news from the re-audit: most of Stage 3 already exists and works well — a tiered lookup (free sources first, paid APIs last) that tries to find a real email/phone/LinkedIn, with every attempt written to a permanent log. What's missing is two things: (1) it only ever tries to enrich *one* person per signal, but a signal can name several people (e.g. "Jane Doe replaces John Smith as country manager"), and (2) when a signal names *no* person at all, there's no fallback that searches for the right *role* at that company instead — which the spec explicitly asks for.

**Technical details:**

### 4.1 Extend `SignalToLeadService::enrichContactsIntoMeta()` to handle multiple named people
Currently this method enriches a single `profile_name`. Once Phase 3.3's `DetectedSignal::$namedPeople` list exists, loop it:

```php
foreach ($signal->named_people ?: [$signal->profile_name] as $index => $personName) {
    if (blank($personName) || mb_strtolower($personName) === 'unknown') continue;

    $enriched = $this->contactOrchestrator->enrichContacts(
        $organization, $personName,
        ['company' => $company, 'linkedin_url' => $leadMeta['linkedin_url'] ?? null],
        [], $lead->id,
    );
    // EnrichmentUsageTracker::logEnrichment already writes an EnrichmentLog row per call —
    // extend its signature (Phase 1.3) to also pass social_signal_id + person_index.
}
```
This reuses `ContactEnrichmentOrchestrator` exactly as it exists today — no new provider integrations needed, just a loop and better attribution.

### 4.2 New: `app/Services/Enrichment/RoleBasedContactSearch.php` — the genuinely missing piece
Implements the spec's Stage 3 fallback path: *"For companies with no named person yet: run a role-based search within the enrichment provider using the ICP's target roles."* Thin addition on top of `ApolloPersonEnricher` (Apollo's `mixed_people/search` already accepts organization + title filters — `ApolloPersonEnricher::enrich()` just needs a title parameter added):

```php
class RoleBasedContactSearch
{
    public function __construct(private readonly ApolloPersonEnricher $apollo) {}

    public function findContact(Organization $org, string $companyName, array $targetRoles): ?array
    {
        foreach ($targetRoles as $role) {
            $result = $this->apollo->enrichByTitle($org, $companyName, $role); // new method, title-filtered search
            if ($result !== []) return $result + ['matched_role' => $role];
        }
        return null;
    }
}
```
Wire this into `ContactEnrichmentOrchestrator::enrichContacts()` as a final tier (or a distinct entrypoint called by `SignalToLeadService` when `namedPeople` is empty) — either way, every `EnrichmentLog` write already captures `provider`, so `'role_based_search'` slots in as a new provider value with no schema change beyond Phase 1.3.

### 4.3 Roll `EnrichmentLog` attempts up onto the signal record
After Phase 4.1/4.2 run for a given signal, compute and persist the aggregate status:
```php
$attempts = EnrichmentLog::where('social_signal_id', $signal->id)->get();
$signal->update([
    'enrichment_status' => match (true) {
        $attempts->isEmpty() => 'not_attempted',
        $attempts->contains(fn ($a) => $a->found_email || $a->found_phone) => 'attempted_found',
        default => 'attempted_not_found',
    },
    'enrichment_attempted_at' => $attempts->isNotEmpty() ? now() : null,
]);
```
This is what makes the spec's "logged, never blank" criterion mechanically checkable from the signal record directly — today you'd have to join against `EnrichmentLog` and infer it; after this it's a first-class field the API/UI can read.

### 4.4 Cost control — already solved, just confirm it covers the new call sites
`ContactEnrichmentOrchestrator`'s tiered design (free tiers first, paid last, early-exit on `hasCompleteContacts()`/`hasUsableProfile()`) is already the right cost-control pattern — no new budget cap needed beyond ensuring `RoleBasedContactSearch` (Phase 4.2) respects the same early-exit logic and doesn't fire when a named-person enrichment already succeeded.

**Deliverables:** extended `enrichContactsIntoMeta()` loop, `RoleBasedContactSearch`, `ApolloPersonEnricher::enrichByTitle()`, `EnrichmentUsageTracker` signature extension (`socialSignalId`, `personIndex`), signal-status rollup logic, tests confirming: multi-person signals log one attempt per person, a no-person signal triggers role-based search, and `enrichment_status` always ends up in one of the three defined states (never left at a stale/undetermined value).

---

## Phase 5 — API layer: expose the three stages, not just the end result

**Plain-English summary:** The app that people actually look at needs to be able to show *why* something is on their screen — which ICP checks it passed, what specific event was detected and where the source link is, and whether we found a contact or not, for which named people specifically. Today the API returns a flattened result with good personalization fields (from the prior redesign) but none of the new stage-by-stage data.

**Technical details:**

Extend `app/Http/Resources/SocialSignalResource.php` (current shape confirmed above — keep every existing key, this is additive):

```php
'icpFilter' => [
    'passed' => $this->icp_filter_passed,
    'reasons' => $this->icp_filter_reasons,
],
'signalType' => $this->signal_type_key,          // e.g. 'new_market_entry' — new, discrete
'signalTypeLabel' => optional($signalTypeDefinition)->label,
'source' => [
    'url' => $this->source_url,                    // note: existing 'post_url' key stays for backward compat
    'date' => optional($this->source_date)?->toDateString(),
],
'territory' => $this->territory,
'namedPeople' => $this->named_people ?? [],
'enrichment' => [
    'status' => $this->enrichment_status,           // not_attempted | attempted_found | attempted_not_found
    'attemptedAt' => optional($this->enrichment_attempted_at)?->toIso8601String(),
    'contacts' => $this->enrichmentLogs()->get()->map(fn ($log) => [
        'personName' => $log->person_name,
        'foundEmail' => $log->found_email,
        'foundPhone' => $log->found_phone,
        'provider' => $log->provider,
        'tier' => $log->tier,
    ]),
],
```
Add `SocialSignal::enrichmentLogs(): HasMany` relation (Phase 1.3's new `social_signal_id` FK makes this trivial).

Also extend `LeadResource` similarly for the Discovery path's `contact_ready` boolean to become a proper tri-state alongside it (`contact_status: not_attempted|found|not_found`), reusing the same `EnrichmentLog` rollup logic from Phase 4.3 — `contact_ready` stays for backward compatibility, `contact_status` is additive.

Update `docs/FRONTEND_INTEGRATION.md` and `docs/SOCIAL_LISTENING_FIELD_GAP.md` with the new field map and a changelog entry (these docs already exist and track this exact contract — extend them, don't fork a new doc).

**Deliverables:** updated `SocialSignalResource`, `LeadResource`, new `SocialSignal::enrichmentLogs()` relation, updated docs, resource unit tests asserting shape for all three enrichment states.

---

## Phase 6 — Orchestration wiring

**Plain-English summary:** We change the internal "assembly line" so each of the three stages runs as its own distinct, recorded step, and so Stage 3 (already built) gets called consistently from both the Social Listening path and the Discovery path through the same seam (`SignalToLeadService` / `ContactEnrichmentOrchestrator`) rather than two divergent code paths.

**Technical details:**

Refactor `SocialListeningOrchestrator::run()` to explicitly sequence Phase 3.5's gate → filter, and to hand qualifying signals to `SignalToLeadService` (or a lighter-weight enrichment-only call, if full CRM push should stay a separate, explicit user action — confirm with product: today `SignalToLeadService::convert()` is called on-demand, e.g. when a user clicks something or a scan auto-converts qualifying signals; keep that trigger point as-is, just ensure `named_people`/`enrichment_status` are populated at signal-creation time via 4.1–4.3, not only at conversion time, so the "no contact found" state is visible on unconverted signals too).

`SocialListeningRun.result_summary` gains rejection breakdown counts (`missing_source_url`, `missing_source_date`, `stale`, `icp_mismatch`) — needed for the frontend's pipeline-visibility panel and for tuning signal-type query prompts without a redeploy (they're DB rows per Phase 3.1).

Keep `RunSocialListeningJob`, `DispatchDueSocialListeningCommand`, and `SignalToLeadService`'s existing CRM-push contract unchanged — only internals change.

**Deliverables:** refactored orchestrator, expanded `SocialListeningRun.result_summary` schema, integration test running a full mocked pipeline (fake Serper + fake Meta Graph + fake GLM + fake Apollo/Hunter/Bytemine/Cleanlist) verifying rejection counts and final signal shape end-to-end.

---

## Phase 7 — Testing & acceptance criteria verification

**Plain-English summary:** Before this ships, we prove — with automated tests, not manual spot-checks — that every rule in the spec is enforced, and that nothing in the substantial recent Discovery/enrichment/CRM work regresses.

**Technical details:**

| Acceptance criterion (`new_plan.md`) | Test |
|---|---|
| No signal without source URL + date | `SignalGroundingGateTest::rejects_missing_source_url`, `::rejects_missing_source_date` |
| No signal older than recency window | `SignalGroundingGateTest::rejects_stale_signal` |
| Signals tagged by discrete signal type | `SignalExtractorTest` per type, using spec's own valid/invalid example pairs as fixtures |
| Every named person has a logged enrichment attempt | `SignalToLeadServiceTest::logs_attempt_per_named_person`, `::role_based_search_runs_when_no_named_person`, `::enrichment_status_never_left_undetermined` |
| ICP fields never sent as free-text search queries (ICP-driven mode) | `SignalQueryBuilderTest::does_not_include_structured_icp_fields_in_prompt` (Http::fake body assertion) |
| Strong signal, failed ICP → discarded | `SocialListeningOrchestratorTest::discards_signal_failing_icp_filter_in_icp_driven_mode` |
| Chat/query-mode search behavior unchanged | Full regression run: `DiscoveryTest`, `HighCapacityDiscoveryTest`, `LeadGenerationFastPathTest`, `ChatIntentTest`, `QueryVariationGeneratorTest`, `LeadQueryNormalizerTest` — all must stay green with **zero** changes to query-mode assertions |
| Existing CRM sync/dedup/outreach unaffected | Full regression run: `SignalPosterCrmSyncTest`, `CrmSyncPayloadTest`, `LeadFieldValidatorTest`, `OutreachPreviewTest`, `SendGridWebhookTest`, `OutreachSendServiceTest` |

Run full `php artisan test` before considering any phase "done." Given how much of the suite now touches Discovery/Chat/Outreach, this regression pass is non-negotiable — the recent 29-commit run shows this codebase is actively iterated on by another workstream, and a naive rebuild risks reverting real fixes ("fix lead generation failing" appears three times in recent history — that instability must not return).

---

## Phase 8 — Rollout strategy

**Plain-English summary:** We roll this out carefully so nothing currently working (CRM sync, chat-driven lead generation, outreach, the new enrichment waterfall) breaks, and old data without the new fields still displays sensibly.

**Technical details:**

1. **Feature flag** (`config('services.signal_detection.v2_enabled')`, per-organization override) for the Stage 1 hard-gate + Stage 2 rebuild. The Stage 3 extension (Phase 4) is lower-risk (additive to working code) and can ship ungated.
2. **Backward compatibility:** all new columns nullable at the DB level; existing `post_url`/`recommended_action` flat fields stay supported indefinitely.
3. **No mandatory backfill** for historical signals — old signals show `enrichment_status: not_attempted`, no `signalTypeLabel` — document in `FRONTEND_INTEGRATION.md`.
4. **Monitoring:** log rejection-rate metrics per run (Phase 6); alert if a signal-type's queries produce too much noise or too few hits.
5. **Cost monitoring:** Apollo/Hunter/Bytemine/Cleanlist call volume against `ContactEnrichmentOrchestrator`'s existing tiering — no new spend risk expected since Phase 4 reuses the existing cost-ordered waterfall, but watch `RoleBasedContactSearch`'s new Apollo calls specifically since that's the one genuinely new paid-API call path.
6. **Coordinate with the active workstream:** given the pace of recent commits to `DiscoveryOrchestrator`/`ScoringService`/`IcpBrief`, confirm with whoever owns that work before merging Phase 2/3 changes to the same files — high risk of silent merge conflicts in logic (not just text) if two people are reshaping `IcpBrief`'s query-building methods concurrently.

---

## Summary of new/changed files

**New:**
- `app/Services/IcpFiltering/IcpFilterService.php` (+ `IcpFilterResult` DTO)
- `app/Services/SignalDetection/{SignalTypeRegistry,SignalQueryBuilder,SignalExtractor,SignalGroundingGate}.php` (+ `DetectedSignal`, `GateResult` DTOs)
- `app/Services/Enrichment/RoleBasedContactSearch.php`
- `app/Models/SignalTypeDefinition.php`
- Migrations: `signal_type_definitions`, `social_signals` extension, `enrichment_logs` extension
- Seeders: built-in signal types + 2 case-study packs

**Changed (extended, not rewritten):**
- `app/Services/Intent/SocialListeningOrchestrator.php` — sequences the 3 stages explicitly, adds rejection-count tracking
- `app/Services/Intent/SocialSignalEnricher.php` — classification logic moves to `SignalExtractor`; personalization fields (why_this_matters_to_you, benefits, etc.) unchanged
- `app/Services/Discovery/DiscoveryOrchestrator.php`, `IcpBrief.php`, `ScoringService.php` — two-mode policy (Phase 2.1); query-mode paths untouched
- `app/Services/Enrichment/ContactEnrichmentOrchestrator.php` — gains a role-based-search tier; existing tiers untouched
- `app/Services/Intent/SignalToLeadService.php` — loops `named_people` instead of a single `profile_name`
- `app/Services/Enrichment/ApolloPersonEnricher.php` — gains `enrichByTitle()`
- `app/Services/Enrichment/EnrichmentUsageTracker.php` — logs `social_signal_id`/`person_index`
- `app/Http/Resources/SocialSignalResource.php`, `LeadResource.php` — expose stage-by-stage data
- `docs/FRONTEND_INTEGRATION.md`, `docs/SOCIAL_LISTENING_FIELD_GAP.md` — updated field map + changelog

**Unchanged (explicitly preserved):**
- CRM sync/dedup (`CrmSyncService`, `DuplicateLeadChecker`, `LeadFieldValidator`), full Outreach/SendGrid flow, chat/query-mode Discovery behavior (`QueryVariationGenerator`, `LeadQueryNormalizer`, multi-query fan-out), `RunSocialListeningJob`/`DispatchDueSocialListeningCommand` contracts, existing ICP schema, existing `ContactEnrichmentOrchestrator` tier ordering.
