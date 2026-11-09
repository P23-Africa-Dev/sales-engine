# Sales Engine UI Merge — Technical Report

**Branch:** `merge-space-dev`
**Merge commit:** `abc3558052b5675bc373c923a0e19f2854b99305` ("Merge branch 'dev-work' into merge-space-dev")
**Date:** 2026-09-08
**Scope:** `components/sales-engine/sales-engine-view.tsx`, `components/sales-engine/icp-builder-modal.tsx`, `components/dashboard/dashboard-cards.tsx`

---

## 1. Objective

Merge `dev-work` into `merge-space-dev` (referred to below as `space`) to bring `dev-work`'s Sales Engine UI work into `space` **without regressing any of the live API integration already built on `space`**. `dev-work` was purely front-end (mock/hardcoded data); `space` had continued building real backend wiring on the same base. The merge needed to be additive on the UI side and lossless on the API side — not a wholesale pick of either branch.

## 2. Branch history / why this was a real 3-way conflict

Both branches share a common ancestor at commit `02ea6969` ("add social listening tab and analytics dashboard"). After that point they diverged for ~20 commits each:

**`space` (ours) added, on top of the shared base:**
- Live hooks: `use-sales-engine-social-listening.ts`, `use-sync-leads-to-crm.ts`, `use-sales-engine-social-settings.ts`, `use-sales-engine-outreach-sender.ts`, `use-factory23-integration-status.ts`, `use-pending-chat-discovery.ts`
- Real typed API data (`SocialSignalApi`, `ChatLead`, etc. from `lib/api/sales-engine.ts`) replacing the branch-point's mock arrays
- CRM sync logic, ICP advisory/badge logic (`lib/icp-advisory-leads.ts`), Factory23 integration status gating
- Supporting components: `ProcessingPanel`, `SocialScanPanel`, `SocialOpportunityEmptyState` / `SocialSignalsEmptyState`, `SocialOpportunityDetailSkeleton` / `SocialSignalsTableSkeleton`

**`dev-work` (theirs) added, on top of the same shared base, using hardcoded mock data throughout:**
- A `SignalActionMenu` component and `AllOutreachModal`
- Clipboard-copy on AI-suggested outreach messages
- Table pagination and scrollbar/styling polish
- A toggleable "Show Full / Show Summary" view for social signal detail
- A `summary` field on `SocialSignal`, a `recommendedAction` field, Google Search as a signal source
- "Leads" → "Prospects" terminology rename across UI copy
- An inline ICP-confirmation gate on the chat flow (`kind: "confirm-icp"`, `targetCount`)
- An "Add to CRM pipeline" picker modal (`AddToCrmPipelineModal`) with a hardcoded `MOCK_CRM_PIPELINES` list

This is why `git status` showed the merge touching 31 files at the tip-to-tip diff level, but only **3 files** actually had unresolved conflicts (`sales-engine-view.tsx`, `icp-builder-modal.tsx`; `dashboard-cards.tsx` auto-merged cleanly) — Git's 3-way merge correctly auto-resolved everything else because `dev-work` hadn't touched those files since the common ancestor.

## 3. Resolution principle applied

For every conflicting hunk:

1. **API/data/hooks/backend-typed logic → keep `space`'s side.** Never reintroduce `dev-work`'s hardcoded mock arrays or older, simpler versions of functions `space` had already replaced with API-backed implementations.
2. **Genuine new UI-only additions with no equivalent on `space` → bring in `dev-work`'s UI, rewired to call `space`'s real hooks/types instead of mock data.**
3. **Both sides had orthogonal additions to the same type/prop list → merge, don't choose** (e.g. the `ChatMessage` type gained both `space`'s `meta` field and `dev-work`'s `kind`/`targetCount` fields).
4. **Drop UI that has no real backend support**, rather than wire it to something that fakes success (see §5).

## 4. Conflict resolution — file by file

### `components/sales-engine/icp-builder-modal.tsx`
One conflict (copy text on the "Minimum ICP Match Threshold" description). Kept `space`'s wording ("Leads below this score are still shown when you ask directly — they'll be labeled as outside your ICP") because it describes the actual filtering behavior; `dev-work`'s line ("Prospects scoring below this will be filtered out") described behavior that isn't what the real implementation does.

Additional non-conflicting hunks were auto-merged in from `dev-work`'s "rename lead-related terminology to prospects" commit (`829edb1c`), updating three other copy strings from "lead" → "prospect".

### `components/sales-engine/sales-engine-view.tsx`
33 conflict blocks, resolved as follows. Net diff: **+329 / −56 lines** relative to pre-merge `space`.

**Kept `space`'s side outright** (~14 blocks) — all real API wiring, hooks, CRM sync, ICP advisory logic, and the fuller/newer `LeadInlineResults` implementation (batch CRM sync, ICP advisory banner, per-lead sync state) over `dev-work`'s simpler mock-data version of the same function.

**Brought in `dev-work`'s UI, rewired to real data** (~11 blocks):
- **Inline ICP confirmation gate on `generate_leads`.** New `IcpConfirmationCard` component (`sales-engine-view.tsx:597`) renders inside the chat transcript as a `kind: "confirm-icp"` message. When a user submits a `generate_leads` prompt, the flow no longer calls the chat API immediately — it inserts a confirmation card first, listing the user's ICP profiles (via the existing `useIcpProfiles`/`useActivateIcpProfile` hooks) and requiring an explicit "Confirm & Generate" click before `sendMessage.mutate(...)` (the real chat API call) fires. This uses `space`'s real hooks — `dev-work`'s dummy chat-reply generator was discarded entirely.
- **`resolveGenerateLeadsPrompt`** (`sales-engine-view.tsx:145`) — parses an explicit numeric count out of the user's prompt (regex `\b(\d{1,4})\b`); if none is found, appends `"(Find 100 prospects unless a different number is specified.)"` to the outgoing prompt body and reports `targetCount: 100`. The resolved `targetCount` is shown as a caption under the user's chat bubble ("Target: N prospects").
- **Signal full/summary toggle** in `SocialOpportunityDetail` — a new `showFullSignal` state per signal lets the user expand from the short `summary`/`description` to the full raw `signal` text, with a "Show Full" / "Show Summary" toggle button.
- **Google Search as a social listening source** — added to `sourceFilterOptions`, a Google "G" icon variant in `SourceBadge`, and Google-specific copy ("See Search Result", "Intent Search Query") and a constructed `google.com/search?q=` link in `SocialOpportunityDetail`.
- **`SignalActionMenu` / `SocialSignalRow` active-state styling** — added an `isActive` prop so the "more actions" menu and row icon coloring respond to row selection instead of relying on CSS `:hover`/`:focus` group-selector tricks (which didn't compose cleanly with `dev-work`'s changes). Row selection was also renamed from `onHover` to `onSelect` and given a proper `onKeyDown` (Enter/Space) handler for keyboard accessibility, fixing a naming bug introduced by the raw merge where `SocialSignalRow` internally called `onHover(signal)` against a prop that had been renamed to `onSelect`.
- **Table scrollbar styling** — thin custom scrollbar classes on the signals table's scroll container.
- **`Scan` icon → `RefreshCw`** for the "Scan" button (cosmetic icon swap from `dev-work`).

**Merged both sides** (~8 blocks):
- `ChatMessage` type: kept `space`'s `meta?: Record<string, unknown> | null` **and** added `dev-work`'s `kind?: "confirm-icp"` and `targetCount?: number`.
- `SignalActionMenu` / `SocialSignalRow` prop lists: kept `space`'s `onCreateOutreach`/`onSetReminder` callbacks alongside `dev-work`'s `isActive` prop.
- Import block: superset of both sides' hooks/components/types.

**Also fixed during the merge (not conflict-marked, but broken by the raw 3-way merge):**
- `SocialSignalRow` called `onHover(signal)` internally against a prop that had actually been renamed `onSelect` — would have thrown at runtime on row click/select. Fixed by consistently using `onSelect`.
- A `timersRef` (`useRef<number[]>([])`) needed by the retained "how many searches do I have left" synthetic-thinking flow was missing a home; added with a cleanup `useEffect` that clears any pending `setTimeout`s on unmount.

**Local search-usage tracker** (`sales-engine-view.tsx:33-64`): a small client-side feature carried over from `dev-work` — tracks a `{used, limit}` counter in `localStorage` (`sales_engine_search_usage_v1`, default limit 500) purely so the chat can answer "how many searches do I have left" locally without a real API round-trip. This is a soft, non-authoritative usage display; it is not connected to any backend quota enforcement.

**Other behavior change:** `SalesEngineView`'s default `activeTab` changed from `"social-listening"` back to `"smart-lead"` (this was `dev-work`'s value; `space`'s value looked like a leftover local testing default). Flagged for product sign-off — see the non-technical doc.

### `components/dashboard/dashboard-cards.tsx`
Auto-merged cleanly by Git (no conflict markers) — 21 lines changed, not reviewed line-by-line as part of this task since it required no manual resolution.

## 5. Deliberately dropped feature

**`dev-work`'s "Add to CRM pipeline" picker modal** (`AddToCrmPipelineModal`, plus its supporting state: `pipelines`/`MOCK_CRM_PIPELINES`, `crmContactNames` localStorage tracking, `handleAddToCrm`/`handleConfirmAddToCrm`) was **not** merged in.

Reason: this UI expects the user to pick a CRM pipeline before saving a lead/signal. There is no backend support for this — `useSyncLeadToCrm`, `useSyncSignalToCrm`, and `useSyncLeadsBatchToCrm` (the real sync hooks on `space`) all sync directly by id with no pipeline parameter in their request shape. Wiring the modal in would have presented a UI step that silently does nothing on the backend. This needs a backend endpoint (list/select pipelines, accept a pipeline id on sync) before it can be safely reintroduced.

Also removed as dead code from `dev-work`'s now-discarded dummy chat system: `wait()`, `DUMMY_LEAD_POOL`, `buildDummyLeads`, `buildDummyAssistantReply`, `readCrmContacts`/`writeCrmContacts`, and the `CrmPipelineOption` type.

## 6. A separate feature attempt that was explored and reverted (not part of the final merge)

After the merge was resolved, a follow-up request came in to replace the "ICP match" / "Outside ICP" pass/fail badge on lead cards with a percentage-based indicator, using the `icp_fit_score` field already present (but previously unused) on the `ChatLead` type. This was implemented in `lib/icp-advisory-leads.ts` (`icpFitPercent`, `icpFitTier`), `lib/icp-advisory-leads.test.ts`, and the `LeadInlineResults` card in `sales-engine-view.tsx`, then **fully reverted** at the user's request before the merge commit was made. The codebase today still uses the original `icpBadgeLabel` boolean badge described in §4. This is noted here only for completeness/history — no trace of it remains in the committed code.

## 7. Verification performed

- `grep` for `<<<<<<<` / `=======` / `>>>>>>>` markers: none remain in any file.
- `npx tsc --noEmit` (full project): clean, zero errors.
- `node scripts/run-vitest.js run lib/icp-advisory-leads.test.ts`: 3/3 passing (original test suite, unmodified in the final committed state).
- Confirmed via `git diff --stat` between `hooks/` and `lib/` at the pre-merge and post-merge commits: **zero changes** — every API hook and lib file from `space` survived the merge untouched.
- Dev server (`next dev`, Turbopack) restarted with a cleared `.next` cache and verified serving `200` on `/`. (One unrelated Turbopack panic — "Next.js package not found" — occurred mid-session; root-caused to a stale Turbopack build cache, not the merge, and resolved by a full `.next` cache clear + restart.)

## 8. Follow-ups / things worth a second pair of eyes

- Visual QA on the confirm-ICP chat card and the "Show Full/Show Summary" signal toggle — these got the most rework during conflict resolution.
- Confirm whether `activeTab` defaulting to `"smart-lead"` (vs. the pre-merge `"social-listening"`) is intentional for production.
- The `AddToCrmPipelineModal` UI exists in `dev-work`'s history if/when a backend pipeline-selection endpoint is built — it wasn't deleted from git history, only left out of this merge.
- The local search-usage counter (`sales_engine_search_usage_v1` in `localStorage`) is cosmetic only; if usage limits become a real product requirement, this should be replaced with a backend-enforced counter.
