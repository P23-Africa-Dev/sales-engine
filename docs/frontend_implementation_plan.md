# Sales Engine — Frontend Implementation Plan (v2)
### Updating the UI for the Stage-Based Signal Detection & Enrichment Rebuild

**Audience note:** Written so both engineers and non-technical stakeholders can follow it. Every phase starts with a **Plain-English summary**, then **Technical implementation details** for engineers.

**Repo:** `the-factory` (Next.js)
**Primary files:** `components/sales-engine/sales-engine-view.tsx`, `lib/api/sales-engine.ts`, `components/sales-engine/icp-builder-modal.tsx`
**Companion doc:** `backend_implementation_plan.md` (v2) — this plan assumes those backend changes ship
**Source spec:** `new_plan.md`

---

## Implementation status (updated as work lands)

- ✅ **Phase 2 quick wins were already live before this rebuild started** — correcting v1/v2's assumption. `ChatLead`/lead-card rendering of `contact_ready`, `contact_enrichment_tier`, `contact_enrichment_provider`, `icp_relevance_reason`, and `crm_duplicate` all already existed in `sales-engine-view.tsx` prior to this session. No work needed there.
- ✅ **Phase 1 types (partial) + Phase 3 (partial)** — `SocialSignalApi` now has `icpFilter`, `discreteSignalType`, `territory`, `namedPeople`, `enrichment.{status,attemptedAt}`, matching the backend's shipped `SocialSignalResource` fields. The Social Listening detail panel (`SocialOpportunityDetail` in `sales-engine-view.tsx`) now renders: a "Detected Event" row (formatted from the discrete signal-type key) and a "Territory" row in the Intent & Context grid when present, a "Named in this signal" chip list when `namedPeople` is non-empty, and a "Contact Enrichment" block showing found/not-found (nothing rendered when `not_attempted`, to avoid cluttering legacy signals).
- ✅ **Phase 6 (pipeline visibility panel)** — new `ScanRunSummaryPanel` component renders "Checked N potential signals — N qualified" plus a plain-language rejection breakdown ("N didn't match your ICP filters, N had no publish date...") right where the in-progress `SocialScanPanel` used to leave a gap after a scan completed. Reads the backend's newly-structured `result_summary`; renders nothing for legacy runs (plain-string summary), in-progress runs, or a zero-hits run. 6 dedicated component tests.
- ✅ **Compact signal list-row badge** — the discrete signal type (when present) now shows as a small outlined pill under the existing intent-color badge in the signal table row, not just in the detail panel.
- ✅ **ICP builder signal-type-pack selector** — `IcpConfig.signalTypePacks?: string[]` added; a toggle-chip UI (matching the existing industries/decision-makers pattern) lets a user opt into "Core Buyer Signals," "Software / Dev Buying Signals," or "Lagos Corporate Transport" — each chip's tooltip explains what it adds. Unselected (default) = zero change in scan behavior or cost, matching the backend's strict opt-in design. (The custom-prompt placeholder already invited "opportunity interests beyond sales leads" before this session — that v1-planned copy tweak turned out to already be live too.)
- ✅ **Trust-mode explainer** — a one-line subtitle under the Smart Lead / Social Listening tab bar now states the mode's actual behavior ("follows your question first" vs. "strictly follows your saved ICP filters"), sourced from a single copy table keyed by tab so it can't drift out of sync with which tab is active.
- ⏳ **Not yet done:** nothing from the original v2 punch list remains — all planned Phase 1-6 frontend items have shipped in some form. Future work would be net-new (e.g. an admin UI for org-specific `signal_type_definitions` overrides), not backlog.
- **Verification:** TypeScript compiles clean, full test suite passes (320/320), `npm run lint` on all touched files shows 0 errors (pre-existing warnings elsewhere in the codebase, none introduced). **Not verified in a running browser** — the detail-panel, scan-summary, and pack-selector changes render/behave correctly against real Stage 1/2/3 data that requires a live backend scan against an ICP with a signal-type pack enabled; this was not exercised end-to-end in this session.

---

## Changelog — why this document was revised

The backend just landed ~29 commits (re-audited in `backend_implementation_plan.md` v2). None of those commits touched `the-factory` — this is still a frontend rendering a backend contract that hasn't shipped the new fields yet. What changed is **what the frontend needs to be ready for**, because the backend's actual current shape (and its near-term plan) is different from what v1 of this document assumed:

- **Enrichment is more mature than assumed.** The backend now has a real 3-tier waterfall (`ContactEnrichmentOrchestrator`: snippets/GLM → Bytemine/Cleanlist → Apollo/Hunter) with a durable log (`EnrichmentLog`: provider, tier, found_email, found_phone per attempt). The frontend plan below now expects **richer enrichment data** (which tier/provider found a contact) rather than a bare found/not-found boolean — worth surfacing, since "we found this via a free source" vs. "we spent an Apollo credit" is genuinely different information for a user managing cost.
- **A new `SignalToLeadService` concept exists on the backend** — "converting" a signal into a lead is now its own explicit action/moment, not something that happens invisibly during a scan. The frontend should have a clear "Convert to Lead" (or equivalent) action per signal, distinct from just viewing it, since that's the point at which CRM push + full enrichment now fire.
- **The backend has an explicit, documented tension** between "chat search is flexible" and "ICP-driven scans are strict" (see backend plan Phase 2.1). The frontend's copy and behavior need to reflect this distinction clearly — Smart Lead (chat) results and Social Listening (ICP-driven scan) results are now conceptually different trust levels, not just different tabs.
- **A new source, Meta Graph (Facebook/Instagram business pages), was added** — the source icon/label system needs to account for it.
- Everything else from v1 (source provenance, signal-type badges, filter taxonomy, pipeline visibility panel) still applies — the backend plan's Stage 2 (discrete signal types, hard source/date gate) still hasn't shipped, so those UI phases are unchanged in substance, just resequenced against the more concrete Stage 3 data shape below.

---

## 0. Why we're doing this, and sequencing with the backend

**Plain-English summary:** The backend is being rebuilt so every opportunity shown to a user has proof behind it: which checklist it passed, exactly what event was detected and where the source article is, and whether we found a real contact (and how — a free lookup or a paid one) or genuinely couldn't. The interface today shows a flattened card with some of that (thanks to the last redesign) but nothing that lets a user *see* the three-stage process, the enrichment method, or the search-mode trust distinction. This plan updates the UI to make all of that visible.

**Technical details:** Hard dependency is still backend plan Phase 5 (API layer) shipping `icpFilter`, `signalType`/`signalTypeLabel`, `source.url`/`source.date`, `territory`, `namedPeople`, and `enrichment.{status,attemptedAt,contacts}` (now with `provider`/`tier` per contact, per the updated backend plan). Recommended approach unchanged from v1: build against a typed mock of the new response shape first (Phase 1), so frontend and backend work proceed in parallel.

---

## 1. Current-state summary

| Concern | Current file(s) | Current behavior |
|---|---|---|
| Tabs | `sales-engine-view.tsx:215,269` | Two tabs: `smart-lead`, `social-listening`. No visual distinction of trust level (query-mode vs. ICP-driven-mode), no stage visibility |
| ICP builder | `icp-builder-modal.tsx` | industries, companySizes, revenueRanges, territories, decisionMakers, minMatchScore, customPrompt. Helper copy doesn't distinguish "hard filter" fields from the free-text interest field, and doesn't mention that Smart Lead search can still go outside the ICP by design |
| Social signal card/detail panel | `sales-engine-view.tsx` | Renders `summary`, `industry`, `keyTopics`, `competitors`, `followUpStrategy`, `whyThisMattersToYou`, `benefits`, `recommendedAction` (object-or-string tolerant), `post_url`/`posted_at` opportunistically. Solid foundation from the prior redesign |
| Lead card (Smart Lead / Discovery) | `sales-engine-view.tsx` | Backend `LeadResource` now returns `contact_ready` (bool), `contact_enrichment_tier`/`contact_enrichment_provider`, `icp_relevance_reason` — **not yet rendered** in the frontend at all |
| Source/date display | same | Rendered opportunistically when present; not visually required |
| Signal type filters | same | Flat list matching backend's flat taxonomy |
| Contact/enrichment display | same | No explicit "found / not found / not attempted" state anywhere, despite the backend now tracking this reasonably well via `EnrichmentLog` |
| API types | `lib/api/sales-engine.ts` (`SocialSignalApi`) | Mirrors the current flat backend resource; missing `contact_ready`, `icp_relevance_reason`, and all Stage 1/2/3 fields from the backend rebuild |

**Bottom line:** There are now two layers of frontend debt: (1) fields the backend *already returns today* and the UI ignores (`contact_ready`, `icp_relevance_reason`, `contact_enrichment_tier/provider` on leads), and (2) fields the backend *plans to return* once its rebuild ships (signal types, source gate, named people, enrichment status on signals). Phase 1 below tackles both, since (1) is essentially free — it's already in the API response.

---

## Phase 1 — API contract & types: catch up to what the backend already ships, then build ahead for what's coming

**Plain-English summary:** Two sub-steps here. First, a quick win: the backend already sends useful information (like "did we find contact info, and how?") on leads that the app currently throws away. We wire that up immediately — it's low-risk and adds real value today. Second, we prepare the app's data layer for the bigger fields coming from the Stage 1/2/3 rebuild, using realistic placeholder data so we're not blocked waiting on the backend team.

**Technical details:**

### 1.1 Immediate: add already-shipped Lead fields to `lib/api/sales-engine.ts`
```ts
export interface Lead {
  // ...existing fields
  contactReady: boolean;                          // from LeadResource.contact_ready
  contactEnrichmentTier: string | null;             // "tier1" | "tier2" | "tier3" | "seed" | null
  contactEnrichmentProvider: string | null;          // "snippet_extractor" | "bytemine" | "cleanlist" | "apollo" | "hunter" | "existing" | null
  icpRelevanceReason: string | null;                 // plain-language "why this matched (or didn't match) your ICP"
  crmDuplicate: boolean;
  crmDuplicateReason: string | null;
}
```
This is a same-sprint win — no backend work required, the data is already in the API response and just needs a type + render path (see Phase 2).

### 1.2 Forward-looking: Stage 1/2/3 types for the Social Listening rebuild
```ts
export interface SignalSourceInfo { url: string | null; date: string | null; }
export interface IcpFilterInfo { passed: boolean; reasons: Record<string, boolean>; }
export type EnrichmentStatus = "not_attempted" | "attempted_found" | "attempted_not_found";

export interface EnrichmentContact {
  personName: string | null;
  foundEmail: boolean;
  foundPhone: boolean;
  provider: string | null;   // "snippet_extractor" | "bytemine" | "cleanlist" | "apollo" | "hunter" | "role_based_search"
  tier: string | null;        // "tier1" | "tier2" | "tier3"
}

export interface EnrichmentInfo {
  status: EnrichmentStatus;
  attemptedAt: string | null;
  contacts: EnrichmentContact[];
}

export interface SocialSignal {
  // ...existing fields unchanged
  icpFilter: IcpFilterInfo | null;
  signalType: string | null;
  signalTypeLabel: string | null;
  source: SignalSourceInfo;
  territory: string | null;
  namedPeople: string[];
  enrichment: EnrichmentInfo | null;
}
```

### 1.3 Mock data for parallel development
`lib/api/__mocks__/sales-engine-signal.mock.ts` — fixtures covering: a fully-populated new-pipeline signal with a `tier1`-found contact (free source), one with a `tier3`/Apollo-found contact (paid source, worth flagging differently in UI per the cost-awareness note below), a legacy signal (all new fields null), an `attempted_not_found` case, and a multi-`namedPeople` signal. A local dev toggle (`?mockSignals=1`) renders the detail panel against these without a live backend.

### 1.4 Search-mode trust flag
Add `searchMode: "query" | "icp_driven"` to whatever wraps a Smart Lead result set vs. a Social Listening run result set (this may already be implicit from which tab/endpoint is active — make it explicit in the type so Phase 3's trust-level UI treatment doesn't have to infer it from context).

**Deliverables:** updated `sales-engine.ts` types (both the immediate Lead fields and the forward-looking Signal fields), mock fixtures, a short contract note referencing `backend_implementation_plan.md` v2.

---

## Phase 2 — Quick win: render what the backend already sends on Lead cards

**Plain-English summary:** Before touching the bigger Social Listening rebuild, there's an easy, low-risk improvement available right now on the Smart Lead / Discovery side: the backend already tells us whether a lead has a usable contact, how confident that enrichment is, and in plain language why it did or didn't match the target profile. None of that shows up in the app today. This is a fast, contained change.

**Technical details:**

### 2.1 Contact readiness indicator on lead cards
```tsx
{lead.contactReady ? (
  <ContactReadyBadge tier={lead.contactEnrichmentTier} provider={lead.contactEnrichmentProvider} />
) : (
  <Badge tone="neutral">No verified contact yet</Badge>
)}
```
`ContactReadyBadge` can differentiate visually between a free-tier find (`tier1`/`tier2` — snippet, Bytemine, Cleanlist) and a paid-tier find (`tier3` — Apollo/Hunter) with a subtle icon distinction — useful for anyone watching enrichment spend, and a nice preview of the fuller `EnrichmentStatusBadge` work in Phase 4.

### 2.2 ICP relevance reason
Render `lead.icpRelevanceReason` directly under the lead's name/title — it's already a complete, well-formed sentence from the backend (e.g. *"Fits your FMCG & Retail focus in Lagos, NG aligned with Head of Sales."* or, for an out-of-ICP query match, *"Answers your search for X; doesn't match your Retail focus in Lagos."*). This single line does a lot of the "why is this here" explanatory work the spec cares about, for free, today.

### 2.3 CRM duplicate flag
```tsx
{lead.crmDuplicate && (
  <Tooltip content={lead.crmDuplicateReason ?? "Matches an existing CRM record"}>
    <Badge tone="warning">Possible duplicate</Badge>
  </Tooltip>
)}
```

**Deliverables:** `ContactReadyBadge`, inline rendering of `icpRelevanceReason` and `crmDuplicate` on the lead card/detail view — ship this phase independently and early; it doesn't depend on any unshipped backend work.

---

## Phase 3 — ICP Builder: make the two-mode trust distinction visible

**Plain-English summary:** The backend has explicitly decided (see backend plan Phase 2.1) that typing your own search in chat stays flexible — you'll get relevant answers even slightly outside your saved profile — while an automatic scan running against your saved ICP is strict and will only show exact matches. Right now the UI doesn't say this anywhere, so a user could be confused about why chat search sometimes surfaces things "outside" their ICP while Social Listening never does. We make this distinction explicit, plus keep the v1 copy improvements for the filter-vs-interest distinction in the ICP builder itself.

**Technical details:**

### 3.1 Filter vs. interest field grouping (unchanged from v1)
Section label above structured fields: **"Filter criteria — a company must match these to qualify"**. Section label above `customPrompt`: **"What kind of opportunity are you looking for? — describe your interest in your own words."**

### 3.2 New: trust-mode explainer near each tab
- Smart Lead tab: small info affordance — *"Smart Lead search follows your question first. Results may include strong matches outside your saved ICP — you'll see why each one is included."* (ties directly into Phase 2.2's `icpRelevanceReason` line, which is exactly how the backend explains those out-of-ICP inclusions.)
- Social Listening tab: *"Social Listening scans strictly follow your saved ICP filters. Nothing outside your filter criteria will appear here."*

This turns a backend policy decision into user-facing clarity instead of an invisible inconsistency between the two tabs.

### 3.3 Signal-type pack selector (unchanged from v1, still pending backend Stage 2)
```tsx
<SignalTypePackSelector
  available={["default", "software_dev_vertical", "lagos_corporate_transport"]}
  selected={formConfig.signalTypePacks}
  onChange={(packs) => setFormConfig(prev => ({ ...prev, signalTypePacks: packs }))}
/>
```
Default `["default"]` pre-selected. Held back behind the same readiness gate as the rest of Stage 2 UI (Phase 5) until the backend's `signal_type_definitions` registry ships.

**Deliverables:** updated `icp-builder-modal.tsx` copy/sections, new trust-mode explainer component, `SignalTypePackSelector` (built, but its data source stays mocked until backend Phase 3 ships).

---

## Phase 4 — Enrichment / contact status on Social Listening signals

**Plain-English summary:** Same intent as v1 — for every named person tied to a signal, show "Contact found," "We looked but couldn't verify," or nothing (not yet attempted) — but now richer, because the backend's real enrichment waterfall tells us *how* a contact was found, which matters for anyone tracking cost or trust in the data.

**Technical details:**

### 4.1 `EnrichmentStatusBadge`, now provider/tier-aware
```tsx
function EnrichmentStatusBadge({ status, contacts }: { status: EnrichmentStatus; contacts: EnrichmentContact[] }) {
  if (status === "not_attempted") return null;
  if (status === "attempted_not_found") return <Badge tone="neutral">No contact found</Badge>;

  const bestTier = contacts.find(c => c.foundEmail || c.foundPhone)?.tier;
  const sourceLabel = bestTier === "tier3" ? "verified (Apollo/Hunter)" : "found (free lookup)";
  return <Badge tone="success">Contact {sourceLabel}</Badge>;
}
```

### 4.2 Contact detail block, per person
```tsx
{enrichment?.contacts.map(c => (
  <ContactCard
    key={c.personName}
    name={c.personName}
    found={c.foundEmail || c.foundPhone}
    provider={c.provider}
    tier={c.tier}
  />
))}
```
Include "Copy email" and "Create Outreach" actions (unchanged from v1), pre-filling the existing `outreach-preview-modal.tsx` flow.

### 4.3 "Convert to Lead" as its own explicit action (new — reflects `SignalToLeadService`)
Since the backend now treats signal→lead conversion as a distinct step (where full enrichment + CRM push fire), the UI should mirror that: a signal card in its initial state may show `enrichment.status: not_attempted`, and a clear **"Convert to Lead"** button that, once clicked, triggers the backend flow and — after a short loading state — updates to show the real enrichment outcome. Don't imply enrichment happened automatically just because a signal is visible; match the backend's actual sequencing.

### 4.4 "No contact found" gets a clear next step (unchanged from v1)
*"We checked our contact database and couldn't verify a person at this company yet."* plus a manual "Add contact info" affordance.

### 4.5 Multiple named people (unchanged from v1)
Per-person status, not one aggregate badge, when `namedPeople.length > 1`.

**Deliverables:** `EnrichmentStatusBadge` (provider-aware), `ContactCard`, `ConvertToLeadButton` with loading/outcome states, wiring into detail panel, tests for all status/tier combinations.

---

## Phase 5 — Filters: rebuild around the discrete signal-type taxonomy

**Plain-English summary:** Unchanged from v1 in substance — the filter dropdown needs to grow to match specific event types and adapt per the active ICP's enabled signal-type packs. This remains blocked on the backend's Stage 2 rebuild (`signal_type_definitions`), so it ships with a fallback to today's flat list until that's ready.

**Technical details:**

### 5.1 Dynamic filter options from the active ICP's enabled packs
Fetch/derive from `GET /api/v1/signal-types?icpProfileId=...` (or embedded in the ICP profile response) once available.

### 5.2 Backward-compatible fallback
Falls back to the existing flat `intentFilterOptions` list when the endpoint/field isn't present — keeps frontend deployable independently of exact backend Stage 2 timing.

### 5.3 Empty-state copy update
`social-listening-empty-states.tsx` — specific per signal type once available (e.g. *"No New Market Entry signals in the last 6 months"*), generic fallback otherwise.

**Deliverables:** dynamic filter component with fallback logic, updated empty-state copy, tests for both paths.

---

## Phase 6 — Pipeline visibility panel

**Plain-English summary:** Unchanged from v1 — after a scan runs, show a simple summary: how many potential signals were checked, how many were rejected (and why — missing source, too old, didn't match filters), how many qualified, and for how many we found contact info. This is the single most demo-friendly, trust-building artifact of the whole rebuild.

**Technical details:**

```tsx
<ScanRunSummaryPanel
  totalChecked={run.resultSummary.totalChecked}
  rejected={{
    missingSource: run.resultSummary.rejected.missing_source_url,
    missingDate: run.resultSummary.rejected.missing_source_date,
    stale: run.resultSummary.rejected.stale,
    icpMismatch: run.resultSummary.rejected.icp_mismatch,
  }}
  qualified={run.resultSummary.qualified}
  contactsFound={run.resultSummary.enrichment.found}
/>
```
Sourced from the backend's expanded `SocialListeningRun.result_summary` (backend plan v2, Phase 6). Simple stat-tile row, collapsible.

**Deliverables:** `ScanRunSummaryPanel`, wired into `social-scan-panel.tsx`, skeleton/loading state extending `social-scan-skeletons.tsx`.

---

## Phase 7 — Testing

**Plain-English summary:** Automated checks confirming the interface correctly shows every enrichment state (including the provider/tier distinction), correctly falls back for old data and for backend features not yet shipped, and doesn't break existing outreach/CRM functionality — plus new coverage for the Phase 2 quick wins, since those ship first and independently.

**Technical details:**

- Component tests for: `ContactReadyBadge` (all tier combinations), `EnrichmentStatusBadge` (all status × tier combinations), `SourceProvenance`, `ScanRunSummaryPanel`, `ConvertToLeadButton` (idle/loading/found/not-found states).
- Regression pass on `outreach-preview-modal.tsx` flow with an enriched contact pre-filled.
- Manual QA checklist:
  - [ ] Lead cards show `contactReady`/tier/`icpRelevanceReason`/`crmDuplicate` correctly (Phase 2 — should be testable immediately, no backend rebuild needed)
  - [ ] New-pipeline signal renders badge, source, territory, named people, enrichment status correctly
  - [ ] Legacy signal (all new fields null) renders gracefully, no broken layout
  - [ ] Convert to Lead flow transitions states correctly and matches backend's actual async timing
  - [ ] Filter dropdown reflects the active ICP's signal-type pack, or falls back cleanly
  - [ ] Create Outreach still works, pre-filled from an enriched contact
  - [ ] CRM sync/duplicate flag actions unaffected
  - [ ] Scan run summary panel numbers match the filtered list below it

---

## Phase 8 — Rollout

**Plain-English summary:** Phase 2 (quick wins) ships first, independently, since it needs no backend changes. Everything else ships in step with the backend's own phased/flagged rollout (backend plan v2, Phase 8), degrading gracefully wherever the backend hasn't caught up yet.

**Technical details:**

1. **Phase 2 ships immediately** — no flag needed, purely additive rendering of already-available fields.
2. All other new UI reads are null-safe by construction — no feature flag needed on the frontend; it renders enhanced data when present and falls back when absent, matching the backend's org-by-org flag rollout.
3. Keep all legacy flat fields (`intentLabel`, `recommendedAction` as string-or-object, `post_url`, etc.) fully supported indefinitely.
4. After backend Phase 8 flips default-on broadly, revisit whether "legacy signal" muted states and the flat-list filter fallback can be simplified — track as a follow-up cleanup ticket.

---

## Summary of new/changed files

**New:**
- `components/sales-engine/contact-ready-badge.tsx` (Phase 2, ships first)
- `components/sales-engine/source-provenance.tsx`
- `components/sales-engine/enrichment-status-badge.tsx`, `contact-card.tsx`, `convert-to-lead-button.tsx`
- `components/sales-engine/signal-type-pack-selector.tsx`
- `components/sales-engine/scan-run-summary-panel.tsx`
- `components/sales-engine/trust-mode-explainer.tsx`
- `lib/api/__mocks__/sales-engine-signal.mock.ts`

**Changed:**
- `lib/api/sales-engine.ts` — immediate `Lead` fields (`contactReady`, `contactEnrichmentTier/Provider`, `icpRelevanceReason`, `crmDuplicate`) + forward-looking `SocialSignal` Stage 1/2/3 types
- `components/sales-engine/sales-engine-view.tsx` — lead card quick wins (Phase 2), detail panel + list row updates (Phase 4), dynamic filters (Phase 5)
- `components/sales-engine/icp-builder-modal.tsx` — section labeling, trust-mode explainer, signal-type pack selector
- `components/sales-engine/social-listening-empty-states.tsx` — copy updates
- `components/sales-engine/social-scan-panel.tsx` — mounts `ScanRunSummaryPanel`

**Unchanged (explicitly preserved):**
- Outreach creation/sending flow, CRM action modals, chat-based smart-lead flow, all existing personalization-field rendering (`whyThisMattersToYou`, `benefits`, etc.) from the prior redesign.
