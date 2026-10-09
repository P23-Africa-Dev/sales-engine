# Sales Engine integration implementation plan

Prepared: 6 October 2026  
Status: **For review — application implementation has not started**

## 1. What you are approving

The goal is to make the standalone Sales Engine frontend work completely with its own Sales Engine backend while preserving its existing screen designs. Factory is the reference for working behavior: searching for leads, reviewing results, confirming CRM saves, listening for social buying signals, and preparing and managing outreach.

In everyday terms: a user searches for a prospect, clicks **Add to CRM**, confirms where to save it, and then sees that same prospect in CRM. The record stays there after refreshing or signing in again. The dashboard and outreach screens show actual stored information, with no sample businesses or invented totals.

This document proposes both frontend and backend work. Approval of the document will authorize implementation in `sales-engine-frontend` and `sales-engine`. `the-factory` will remain a reference unless a separately agreed change becomes necessary.

### Repository roles

| Repository | Purpose in this work |
| --- | --- |
| `sales-engine-frontend` | Primary implementation target: Smart Leads, Social Listening, CRM, outreach dashboard, outreach activities, API clients and query hooks. |
| `sales-engine` | Backend target: missing native CRM capabilities, local saves, dashboard aggregates and complete activity listing; reuse existing discovery, social and sending services. |
| `the-factory` | Reference implementation for functional behavior, API payloads, confirmations, duplicate handling and CRM management. It also contains its own backend under `backend/src`. |

## 2. Investigation findings

These findings come from source inspection. They describe the checked-out repositories, not a verified deployment. No live account flow, production API call, build, lint run or application test suite has been executed for this planning stage. The reported missing-modal symptom still needs reproduction during implementation.

### 2.1 The confirmation modal exists, but its dependencies are wrong for standalone CRM

The standalone Smart Leads and Social Listening routes render `components/sales-engine/sales-engine-view.tsx`. That component already imports and renders `AddToCrmPipelineModal` from `crm-action-modals.tsx`. Smart Leads already holds single-save and batch-save modal state.

However:

- `LeadInlineResults` checks `useFactory23IntegrationStatus()` and can disable Add to CRM when Factory integration is unavailable.
- `hooks/use-sales-engine-pipelines.ts` loads pipelines through `useCrmPipelines` and Factory-style company and role context.
- `lib/api/crm.ts` calls `apiRequest` from `lib/api/onboarding.ts` and requests `/admin/crm/...` or `/agent/crm/...`.
- That general API client defaults to `https://api.thefactory23.com/api/v1`, whereas `lib/api/sales-engine.ts` uses the separate Sales Engine URL and organization header.

**Meaning for users:** an existing confirmation component cannot complete its job if it is blocked by an unrelated integration or cannot retrieve suitable pipelines. Adding another modal alone would not fix the complete flow.

**Planned correction:** make standalone CRM availability and pipeline selection depend on native Sales Engine authentication and organization data. Reproduce the exact missing-modal behavior and verify all Add to CRM entry points before declaring the issue resolved.

### 2.2 Backend CRM save currently means “send to Factory”

`routes/api.php` includes single and batch `/leads/.../sync-to-crm` endpoints. `LeadSyncController` sends records through `Services/Integrations/Factory23/CrmSyncService`, which calls Factory's CRM API.

The frontend sends `pipeline_id`, but the current single-save controller does not consume the request body. The batch controller validates only `lead_ids`; it does not apply the requested pipeline either. Social signal saving has the same selection gap: the controller accepts only the signal ID and calls the conversion service without a requested pipeline.

**Meaning for users:** selecting a pipeline in the confirmation screen does not currently guarantee that the record lands in that pipeline.

**Planned correction:** add a native save destination and validate and persist the selected pipeline. Preserve the optional Factory integration as a distinct behavior so the shared backend does not break Factory callers.

### 2.3 Native CRM is too small for the existing frontend

The native backend currently exposes `GET /crm/pipeline` and `PATCH /crm/leads/{id}`. The pipeline endpoint groups all organization leads by the fixed `Lead::STAGES`; the update endpoint accepts stage, summary and score.

The frontend expects considerably more: pipeline management, preferences, labels/stages, paginated leads, editable contact details, notes, activities, import/export, analytics and assignees. Factory provides these through its CRM controller and `Services/Crm/LeadService`.

The native pipeline currently has no saved-only filter. `LeadResource` derives `crm_synced` from `synced_to_f23_at`, so it describes external sync rather than native CRM membership.

**Meaning for users:** changing only the frontend API base URL would still leave many buttons without suitable backend endpoints and could show discovery drafts in CRM before the user saves them.

### 2.4 Default pipeline exists in Factory, not as a native managed CRM feature

Factory's `LeadService::ensureDefaultCrmSetup()` creates Default, Sales and Marketing pipelines for an uninitialized company and seeds stage labels. Its preferred-pipeline resolver chooses a personal preference before the company default.

Sales Engine currently has fixed stage groups, but no equivalent native managed pipeline catalog in its API routes.

**Planned correction:** create one real **Default Pipeline** per organization, with persistent stages and a default selection. Extra pipelines are created through the existing management UI rather than seeded as sample sales data.

### 2.5 Dashboard currently defaults to sample data

`app/(dashboard)/sales-engine/page.tsx` renders `OutreachDashboard`. `components/dashboard/outreach-dashboard.tsx` imports `data/outreach-dashboard.json` and uses it unless `NEXT_PUBLIC_OUTREACH_DASHBOARD_DATA` is exactly `live`.

The live adapter currently combines recent outreach and pending-review leads. It counts loaded rows, supplies unavailable company details as dashes and leaves several totals null. It does not have the complete dashboard contract.

**Planned correction:** make the dashboard use the API unconditionally and provide an aggregate endpoint designed for its actual cards, filters and business details.

### 2.6 Outreach services exist, but the activity list is incomplete

The backend already implements drafting, preview/detail, regeneration, sending, deletion, sender settings, domain verification, inbox confirmation, setup requests and SendGrid delivery events. The standalone preview modal and outreach query hook match their Factory counterparts in the files compared.

However, `OutreachController::recent()` returns at most 20 activities. The standalone activities page filters, calculates metrics and paginates the returned collection locally.

**Meaning for users:** older activities can disappear from the screen, and totals can represent only a recent subset.

**Planned correction:** keep the recent endpoint for small widgets and add a complete paginated activity endpoint with server-side filters and truthful aggregates.

### 2.7 Social conversion and CRM success are different states today

`SignalToLeadService` can create a local lead even when Factory sync cannot run. Its signal status is `synced` only when external sync succeeds, otherwise it can be `reviewed`. The frontend uses `signal.lead_id` as an already-in-CRM shortcut.

Social mutations currently invalidate social signals and social metrics; native CRM and dashboard invalidation must also be included. Bulk social saving currently starts individual saves without pipeline confirmation and clears selection after the attempt.

**Planned correction:** distinguish conversion, native CRM save, and external sync. Confirm bulk destinations, update all affected screens, and retain failed selections for retry.

## 3. Target architecture and important decisions

### One source of truth for standalone CRM

The standalone app will use the Sales Engine token and `X-Organization-Id` for Smart Leads, Social Listening, CRM and Outreach. Native CRM operations must work without Factory credentials or a Factory account link.

Factory behavior will be used as a reference, adapted to Sales Engine's organization model. Factory `company_id` represents tenant ownership in many CRM calls; Sales Engine `company_id` can represent the discovered business. These IDs must not be treated as interchangeable. Organization isolation belongs to `organization_id`.

### Keep discovery and CRM membership separate

Recommended data model: retain existing discovery `Lead` records and add native CRM membership fields/relations, including pipeline, stage and the time the record entered CRM. Contact details, notes and activities will use validated persistent structures appropriate to their relationships.

Do not infer native membership exclusively from `save_status` or Factory timestamps: these fields already have existing discovery and external-sync meanings. Return explicit native membership and optional external-sync status in API resources.

Saving a discovery lead should normally attach CRM membership to the existing lead rather than create a second unrelated copy. Social conversion should link the signal to its canonical lead and save that lead in the same transaction.

### Preserve shared-backend compatibility

Add explicit native endpoints, such as `/crm/leads/from-discovery` and `/crm/leads/from-social-signal`, for standalone saves. Keep existing Factory sync endpoints working for existing consumers. Shared resources may receive additive fields; existing response fields must retain their documented meanings until clients migrate.

Native endpoints will return the canonical CRM lead ID, pipeline and stage, plus whether the save created membership, found an existing record, or updated allowed fields. Batch responses will identify successful and failed items individually.

### Default stages and preferences

Use the backend's current six canonical stages as the initial native stage set: New, Contacted, Engaged, Qualified, Won and Lost. Return their labels, ordering and colors through the API; remove the frontend's conflicting fallback assumptions (`newly_lead`, `proposal_sent`, etc.) from native flows.

Provide personal preferred pipeline and organization default pipeline behavior, using existing organization membership roles for permissions. Do not copy Factory's role or company assumptions directly. Pipeline management and deletion must have explicit permissions and reassignment rules.

## 4. Detailed implementation scope

### A. Authentication, API transport and cached data

1. Introduce a native CRM API adapter using the same Sales Engine session and organization resolution as the existing lead and outreach API client.
2. Replace Factory role-prefixed CRM calls in the standalone CRM screens and pipeline selectors.
3. Remove Factory integration gating from standalone native saves; display actual authentication, pipeline-loading and validation errors.
4. Scope query keys by organization and relevant filters. Clear or invalidate data on logout and organization switching.
5. Retain existing authentication error handling and session retry behavior without sending a native token to Factory as a recovery shortcut.
6. Normalize pagination, validation errors and resource shapes explicitly; avoid broad TypeScript casts that hide incompatible responses.

**User outcome:** every screen reads and writes the same organization's records with the same signed-in session.

### B. Smart Leads functional parity

Reuse the existing ICP setup, search brief, conversation, discovery polling/cancellation, processing labels, enrichment and result rendering where contracts already match.

Audit and verify these flows against Factory:

- Create, edit, activate, duplicate and delete an ICP; confirm a selected ICP before generation when required.
- Search for leads, preserve conversation results, show processing progress, handle cancellation and provider failures, and reload stored results.
- Display real contact and source information and available enrichment status.
- Open confirmation from every single-lead Add to CRM button.
- Load API pipelines, preselect the preferred/default pipeline, permit cancellation without saving, and submit only on confirmation.
- Prevent repeated clicks during saving; keep the modal open and show a useful error when saving fails.
- Save a selected batch with one destination confirmation; obey backend batch limits and report partial success accurately.
- Mark only confirmed successful records as saved; preserve failure selections for retry.
- Resolve duplicates within the organization, preserve existing higher-quality information, and return the canonical CRM record.
- Refresh CRM list, board, totals, pending-review data and dashboard after successful writes.

**Acceptance example:** search → Add to CRM → confirmation with Default Pipeline → confirm → success → open CRM and find the prospect → refresh and find it again.

### C. Social Listening functional parity

Verify and adapt the existing API-backed settings, enabled sources, signal-type definitions, score/freshness/intent filters, search, pagination, bootstrap/manual runs, scan progress and source-health/empty states.

Complete the action flows:

- Single and bulk Add to CRM use the same native destination confirmation and duplicate-safe save service.
- Save the actual poster/contact and source provenance consistently with Factory's conversion behavior; do not accidentally save a generic company instead of the person represented by the signal.
- Link repeat signals to the appropriate canonical record using reliable identity data. Missing contact details must remain missing rather than fabricated.
- Treat a linked discovery lead separately from confirmed CRM membership.
- Preserve Create Outreach confirmation, generated preview, recipient selection and send behavior using the existing services.
- Persist reminders and show the server's actual reminder time; audit the current “24 hours” message against the response.
- Dismiss signals persistently and remove them from appropriate lists and metrics.
- Refresh signals, CRM and dashboard after saves; outreach creation also refreshes activities.
- Display source limitations and provider errors honestly; no fake signals when a source returns none.

**Acceptance example:** select a social signal → confirm a CRM pipeline → save → inspect that person's contact and original social-post link in CRM → retry without creating duplicates.

### D. Native CRM backend and frontend

Implement the missing native contracts required by the existing CRM screens:

| Capability | Backend work | Frontend work |
| --- | --- | --- |
| Default setup | Persistent organization pipeline and stages; race-safe initialization for existing and new organizations. | Display the real default immediately, including an empty board for an organization with no saved leads. |
| Leads | Paginated list/detail/create/update/delete, validated contact data and pipeline/stage filters. | Wire board, list, add/edit/delete and detail views to native resources. |
| Pipeline board | Saved-only stage summaries, counts and pagination, consistent filter behavior. | Persist drag/drop and mobile stage changes; roll back optimistic changes on error. |
| Pipeline management | Create/rename/update/default/delete with permission and reassignment rules. | Wire existing manager and preferred/default selection controls. |
| Stage management | Ordered stage definitions and create/edit/reorder/delete; reject unsafe removal or require reassignment. | Wire label manager and return stage names/colors from the API. |
| Notes and activities | Organization-scoped persistent records and real actor/timestamp information. | Read and write existing detail tabs; show server confirmation before success. |
| Assignees | Eligible organization members and membership checks. | Load genuine assignee choices; no copied Factory user IDs. |
| Analytics | Saved-only counts, trends, budgets and filter-consistent aggregates. | Connect summary cards and charts; do not use loaded-page lengths as global totals. |
| Import/export | Preview, row validation, duplicate strategy, destination selection and filtered export. | Wire current wizard/download controls and row-level errors. |

The implementation will inventory every visible CRM control and its API dependency, including the existing email tab and map-related controls. Native CRM email history/compose support, if exposed by the current screen, requires auditing `lib/api/crm-emails.ts` and the Factory email service before adding an appropriate native contract. Reuse stored Outreach email history and the existing sender mechanism where suitable; inbound mailbox history is not provided by the currently reviewed Sales Engine routes. This dependency must be made explicit, not disguised with dummy messages.

Factory field-agent uploads, map saving and unrelated workforce systems are not part of these four core screens' backend ownership. If a copied CRM control requires one of those systems, adapt it to genuinely supported native data or visibly explain its unavailable capability; do not leave an enabled button calling a nonexistent API. Do not silently claim unrelated Factory functionality was ported.

### E. Outreach dashboard

Replace the default sample-data branch with the live native API. Production components must never fall back to sample JSON after an error or when an account has no data. Fixture data may remain inside tests only.

Create dashboard resources for the actual design:

- Overall totals and relevant period/filter metadata.
- Business list with genuine business IDs, industry, country, website and ownership/creation information where stored.
- Business-to-outreach associations so business selection really filters its activities.
- Per-business email, prospect and follow-up counts where the system records those events.
- Pipeline filter options and counts sourced from native CRM.
- Recent activity with genuine status and timestamps.
- Server-provided supported-channel metadata and unavailable metrics.

Define metric semantics before coding. Count an email as sent according to persisted send success/provider events, not merely draft creation. Use received-email counts only if inbound records actually exist. Count completed follow-ups from recorded completion events, not reminder creation. Percentages must identify their denominator and time range.

The existing design includes SMS and in-person cards. The reviewed draft API supports email and WhatsApp, and the existing live adapter leaves SMS/in-person metrics null. Do not invent SMS sending or in-person completion data. Keep those cards clearly unavailable unless an audited source provides real recorded events; creating new SMS or field-visit systems would require an explicit scope extension. Known empty tracked totals are zero; unsupported measurements remain unavailable.

### F. Outreach activities page

Add full pagination/filtering rather than using `/outreach/recent` as the complete dataset. Support search, channel/status filtering and sorting with consistent totals. Return associations and timestamps needed by the screen.

Reuse and validate the existing Factory-equivalent behavior for:

- Preview/detail loading and copy actions.
- Draft creation and regeneration.
- Recipient edits and confirmed sending.
- Sender settings, verified domain and DNS/integrity feedback.
- Inbox creation, confirmation, resend, default selection and deletion.
- Setup requests and understandable setup errors.
- Delete actions and refresh after mutations.
- Queued, sent, delivered, opened, clicked, bounced, failed and other supported provider statuses.

The page must reflect actual provider events. A successful queue submission is not proof of delivery. Repeated send requests must not produce unintended duplicate sends. Use test transports/provider fakes for automated checks.

## 5. Proposed API additions

Paths below are proposed native `/api/v1` contracts. Exact naming can be refined during implementation while maintaining the agreed behavior and existing consumers.

| Proposed endpoint family | Purpose |
| --- | --- |
| `GET/POST /crm/pipelines`, `PATCH/DELETE /crm/pipelines/{id}` | Native pipeline catalog and management. |
| `POST /crm/pipelines/{id}/default`, `GET/PUT /crm/preferences` | Organization default and user preference. |
| `/crm/stages` management endpoints | Stage catalog, ordering and safe updates/removal. |
| `GET/POST /crm/leads`, `GET/PATCH/DELETE /crm/leads/{id}` | Full native lead lifecycle; extend existing update behavior without breaking callers. |
| `GET /crm/pipeline`, `GET /crm/analytics`, `GET /crm/assignees` | Saved board, summaries and eligible members. Preserve legacy behavior through explicit versioning/parameters or a separate board route if needed. |
| `POST /crm/leads/from-discovery` | Single/batch discovery saves with pipeline selection and per-item outcomes. |
| `POST /crm/leads/from-social-signal` | Single/batch signal conversion and native CRM save. |
| `/crm/leads/{id}/notes`, `/crm/leads/{id}/activities` | Durable notes and activity history. |
| `/crm/leads/import/preview`, `/crm/leads/import`, `/crm/leads/export` | Validated imports and filtered downloads. |
| `GET /outreach/dashboard` | Dashboard aggregates, supported metrics and associated business data. |
| `GET /outreach/activities` | Complete filtered, paginated activity collection and totals. |

Native email-tab endpoints will be specified after the dependency inventory, using the existing sending service where feasible. No Factory endpoint will be assumed to exist locally merely because its frontend client was copied.

Common contract requirements: authenticated access, organization scoping, validated IDs belonging to that organization, explicit authorization, meaningful HTTP errors, consistent envelopes, bounded pagination and additive shared resource changes. Route ordering must keep static paths such as `import` from being interpreted as lead IDs.

## 6. Data migration, duplicate handling and compatibility

1. Add native pipeline/stage/preference and CRM membership storage with suitable organization indexes and constraints. Add notes, contacts and activity tables as required by the chosen model.
2. Initialize default pipeline/stages idempotently for existing organizations and provision new organizations through the same service. Concurrent first visits must not create duplicate defaults.
3. Backfill native membership only from reliable evidence. Existing Factory-synced leads are migration candidates; a merely discovered or generated lead must not become a CRM record automatically.
4. Preserve original discovery metadata, social provenance, external IDs and historical timestamps.
5. Detect duplicates within one organization using reliable identity/source/contact data; ambiguous name-only matches must not merge different people automatically.
6. Make save retries idempotent and protect concurrent saves using database constraints/transactions, not only disabled frontend buttons.
7. Validate pipeline and stage ownership together. Protect default pipeline removal, and reassign records safely when deleting non-default pipelines or stages.
8. Keep existing Factory outbound sync functioning independently. Native saves must not trigger external writes as a hidden side effect.
9. Update metrics to count native membership correctly without changing legacy Factory metrics unexpectedly.
10. Document deployment order: backend schema and compatible APIs first, frontend client switch second. Describe rollback limitations and avoid deleting migrated business records as a rollback shortcut.

## 7. Verification plan

### Baseline and setup after approval

PHP and Composer are available (PHP 8.4.23; Composer 2.10.2). Laravel Boost is not listed in the inspected development dependencies. The repository requires installing Boost before application changes, so after approval run `composer require laravel/boost --dev`, `php artisan boost:install`, and reread generated `AGENTS.md`. This dependency change is deferred during the review-only stage.

Read installed Next.js documentation required by the frontend AGENTS instructions before writing code. Record baseline frontend build/lint/tests and backend tests/style checks before changing application behavior. Inspect existing environment configuration without exposing secrets. Do not migrate a production database or send real outreach messages during validation.

### Backend tests required for every new or changed API

- Authentication and organization isolation, including foreign-organization pipeline, stage, user, lead and signal IDs.
- Default pipeline initialization for new/existing organizations and repeated/concurrent setup.
- Discovery single and batch save, selected/default destination, malformed IDs and partial failure.
- Repeated/concurrent save and duplicate resolution without information loss.
- Social poster conversion, source linkage, pipeline destination and persistence without Factory configuration.
- Saved-only CRM listing, filtering, search, pagination, details and accurate stage totals.
- Lead edits, assignments, notes, activities and deletion/reference behavior.
- Stage moves, stage ordering and pipeline/stage deletion with reassignment.
- Preferences/default permissions and invalid ownership combinations.
- Import preview, invalid rows, duplicate policies and export scope.
- Dashboard totals/associations, empty organizations and unsupported metrics.
- More than 20 outreach records, pagination boundaries, filter/sort combinations and aggregate correctness.
- Existing drafting/sending/domain/inbox/webhook regressions using provider fakes; repeated send safety.
- Compatibility with current Factory sync tests and API shapes.

Existing relevant coverage includes `LeadSyncWithDuplicateTest`, `SignalPosterCrmSyncTest`, `SocialListeningTest`, `MetricsTest`, `OutreachPreviewTest`, `OutreachInboxTest`, `OutreachSenderSettingsTest`, SendGrid tests and integration service unit tests. Extend meaningful behavior coverage instead of duplicating implementation details.

### Frontend tests and browser verification

- Add to CRM opens confirmation from chat/result cards and selected batches.
- Preferred/default pipeline displays from API; loading, empty/error and retry states behave properly.
- Cancel produces no write; confirm passes the chosen pipeline; pending state prevents repeated submissions.
- Success updates only successfully saved records and refreshes CRM/dashboard; failures remain actionable.
- Standalone login works without Factory tokens or integration status.
- CRM board/list/detail show consistent saved records; edits and moves survive refresh.
- Social filters/runs/reminders/dismissals and single/bulk saves match real API outcomes.
- Dashboard never renders sample records or fabricated metrics; business and pipeline filters work.
- Outreach activity pagination includes older records and accurate filtered totals; preview/regeneration/send/settings/delete remain functional.
- Keyboard/modal behavior and mobile layouts remain usable.

Run `npm run lint`, `npm run build`, TypeScript checks as appropriate and `npm run test` in `sales-engine-frontend`. Run backend targeted tests during development, then `php artisan test` and `vendor/bin/pint --test`. Record exact results. Correct build/lint failures in the affected repositories before completion, including baseline issues that prevent the requested clean final checks.

Use a local test organization for end-to-end validation. Real discovery-provider or email-delivery verification requires valid configured services; if unavailable, report precisely which live checks remain unverified. Passing mocked tests must not be described as proof of live delivery.

## 8. Delivery sequence

1. Establish baseline checks, setup guidance and the complete visible-action/API inventory.
2. Define native data contracts, membership semantics, permissions and migrations.
3. Implement/test default pipelines and native saves first, then connect Smart Leads confirmation end to end.
4. Complete native CRM list/board/detail and management APIs, then wire the existing UI controls.
5. Connect Social Listening actions to the same native save service and validate parity.
6. Add dashboard aggregates and full outreach listing, remove runtime sample-data paths and verify existing sender workflows.
7. Run complete regression/build/lint checks and browser acceptance scenarios; repair remaining issues.
8. Deliver a changed-file/API summary, test results, configuration/deployment notes and any explicitly unresolved live-service verification limits.

## 9. Definition of done

Implementation is complete only when:

- Smart Leads and Social Listening behavior has been checked against Factory's implementation and all supported actions work with Sales Engine's APIs.
- Single and bulk saves confirm their destination and produce persistent, duplicate-safe native CRM records.
- A genuine default pipeline exists for every usable organization.
- CRM board/list/detail, management and supported visible actions are connected to real persistent APIs.
- Standalone core flows work without Factory CRM credentials.
- The dashboard and outreach list use complete, appropriately filtered API data; no runtime sample records, false totals or success messages masking failed writes remain.
- Tenant isolation and shared-backend Factory compatibility are covered by tests.
- Every new backend API has meaningful passing tests.
- Frontend build, lint and relevant tests pass; backend tests and style checks pass.
- End-to-end persistence and failure/retry behavior are verified, and any unavailable live-provider checks are explicitly documented.

## 10. Review checkpoint

**Approved for implementation by the user’s “proceed” instruction.** This document is the review deliverable requested before frontend/backend changes. The recommended direction is a native Sales Engine CRM, preserving the current UI and using Factory as the behavioral reference while retaining optional external integration compatibility.

Once you approve this direction, implementation can proceed in the sequence above. Product decisions already made in this proposal are one persistent Default Pipeline, six initial canonical stages, native CRM ownership and honest unavailable states for untracked channels. Those can be adjusted in your review before code changes begin.


## 11. Implementation and verification — 6 October 2026

The user approved implementation with “proceed.” Native CRM storage, organization-scoped APIs, persistent default pipelines/stages, Smart Leads and social-signal confirmation/save flows, CRM management, CSV import/export, native outgoing email history/composition, live dashboard data, and paginated outreach activity APIs have been implemented. Existing external Factory sync routes remain compatible.

Automated verification: backend **416 tests passed, 1,705 assertions**; frontend **74 test files / 308 tests passed**; production Next.js build passed, including TypeScript checks; frontend lint completed with **zero errors** (existing warnings remain); Laravel Pint completed. The native CRM migration also ran successfully against a separate temporary SQLite database. Tests cover tenant isolation, default pipelines, save/retry/duplicate handling, social conversion, chat membership refresh, pending discovery beyond the old limits, CRM management/import/export, sender failures, and outreach filtering/pagination.

Deployment requirement: apply the new native CRM migration with `php artisan migrate` in each intended application environment. Production database migrations were not run during this work. The frontend must point `NEXT_PUBLIC_SALES_ENGINE_API_URL` to the Sales Engine backend.

Verification limits: the browser tool returned `ERR_CONNECTION_REFUSED` for the local frontend, so an interactive browser walkthrough could not be completed. Live discovery/provider calls and real email delivery were not exercised; automated tests isolate those providers. Inbound email is explicitly unavailable in the native CRM email panel; SMS/in-person metrics show unavailable values instead of fabricated measurements. Backend sender configuration and workers remain prerequisites for real email delivery.
