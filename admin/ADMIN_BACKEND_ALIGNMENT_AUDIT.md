# Sales Engine Admin — Backend Alignment Audit

**Status:** Alignment draft only. No backend implementation started.  
**Audit date:** 2 November 2026  
**Audience:** Product + engineering alignment before admin backend work.  
**Scope audited:** `sales-engine-backend/admin/` (Next.js admin frontend on port 3001)  
**Related existing systems:** `sales-engine-backend/backend/` (Laravel client API), client Next.js app at `sales-engine-backend/` root  
**Prior gap docs note:** `docs/FRONTEND_API_GAPS.md` explicitly states the `admin/` app was **not** reviewed. This document fills that gap.

---

## How to use this document

1. Read **Part A** for shared product understanding (what the admin side is).
2. Read **Part B** for module-by-module frontend reality (what exists today).
3. Read **Part C** for backend readiness (what the Laravel API already has vs what admin still needs).
4. Read **Part D** for frontend integration gaps that must be closed when wiring real APIs.
5. Read **Part E** for the proposed production-ready work breakdown and open decisions.
6. Mark agreement / disagreement in **Part F** before any implementation begins.

---

# PART A — What the Admin Side Is

## A.1 Product definition

The admin app is a **platform oversight workspace** for Sales Engine operators (not client sales users).

| Dimension    | Client Sales Engine app                                                       | Admin app (`admin/`)                                                         |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Primary user | Client business users (org owners/admins/members)                             | Platform administrators overseeing many client businesses                    |
| Job          | Execute sales: ICP, discovery, outreach, CRM, social listening inside one org | Cross-business visibility, quality control, account lifecycle, ops decisions |
| Data scope   | Single organization (`X-Organization-Id`)                                     | All organizations / selectable business scope                                |
| Mutations    | Client sales execution (send mail, move deals, dismiss signals)               | Oversight decisions with **required reasons** and audit trail                |
| Branding     | Sales Engine client shell                                                     | Same inherited visual world (teal canvas, mint actions, wine analytics)      |

Source of truth for product intent: `admin/PRODUCT.md`.

## A.2 Explicit product principles (must survive backend design)

1. **Business ownership visible on every record.** Every entity is scoped to a client business/organization.
2. **Explain analytic definitions** and keep charts/tables consistent with the same underlying records.
3. **Record admin management decisions with reasons.** Corrections, reviews, archive, suppress, policy changes require a reason and audit entry.
4. **Keep client sales execution distinct from platform oversight.** Admin approve ≠ send outreach. Admin CRM oversight ≠ client deal execution UI.
5. **Demo/fixture behavior is not production behavior.** Today’s UI resets on refresh and must not be mistaken for live results.

## A.3 Route map (what the admin UI currently exposes)

| Route                              | Module             | In main nav?                                   | Notes                                                |
| ---------------------------------- | ------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| `/`                                | Outreach Dashboard | Indirect (redirects conceptually to dashboard) | Renders same dashboard as `/sales-engine`            |
| `/sales-engine`                    | Outreach Dashboard | Yes — “Dashboard”                              | Cross-business outreach overview                     |
| `/sales-engine/smart-leads`        | Smart Leads        | Yes                                            | Cross-business prospect pool oversight               |
| `/sales-engine/social-listening`   | Social Listening   | Yes                                            | Cross-business signal/ops oversight                  |
| `/sales-engine/crm`                | Admin CRM          | Yes                                            | Cross-business CRM health & management               |
| `/sales-engine/account-management` | Account Management | No — user dropdown only                        | Create/edit/search client businesses; demo “sign in” |
| `/sales-engine/settings`           | Settings           | Linked in navbar dropdown                      | **Route does not exist** (dead link)                 |

Shared shell: `app/layout.tsx` + `components/layout/navbar.tsx`.

## A.4 Current technical reality (one sentence)

**The entire admin frontend is a high-fidelity UI prototype over local fixtures/React state. There are zero admin API calls, zero authentication, and zero persistence.**

Confirmed by `PRODUCT.md` and every module README under `components/*/README.md`.

## A.5 Critical naming trap (must align before API design)

Admin UI language and existing client API language collide on the word **business**:

| Admin UI says                                | Means in admin product              | Maps to Laravel                 | Must NOT confuse with                                                                                            |
| -------------------------------------------- | ----------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- |
| Business / client / account (scope selector) | Tenant workspace using Sales Engine | `**organizations.id**`          | `companies.id`                                                                                                   |
| Prospect / company in Smart Leads or CRM row | Account/person being sold to        | `companies` / `leads`           | Organization                                                                                                     |
| Org role “admin”                             | Client workspace permission (`owner | admin                           | member`)                                                                                                         | `organization_users.role` | Platform staff admin |
| Outreach dashboard fixture `businessId`      | Client tenant in admin UI           | Should become `organization_id` | Client API `GET /outreach/dashboard?business_id=` today filters by `**company_id**` (prospect), not organization |

**Rule for admin APIs:** prefer explicit names (`organization_id`, `company_id`, `lead_id`). Do not reuse the client query param `business_id` with a different meaning.

Fixture scale today (for realism checks only): Smart Leads / CRM / Social Listening share **4** onboarded businesses → **24** CRM records, **16** signals; Outreach JSON has **~200** businesses/outreach rows; Account Management seeds **12** accounts on a **separate ID space**.

---

# PART B — Module Breakdown (Frontend Today)

## B.0 Shared foundation

### Identity / auth UI (stubbed)

- Navbar hardcodes actor: **Kwame Smith / username@gmail.com**.
- Avatar image is static.
- **Log out** closes the dropdown only; no session clear.
- **Notifications** button has no handler.
- **Settings** link points to a missing page.
- Actor name `"Kwame Smith"` is also hardcoded into CRM and Social Listening audit entries.

### Business identity fixtures (important inconsistency)

Two different fixture universes exist:

| Source                                             | Used by                                  | Sample businesses                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/smart-leads.ts` → `ONBOARDED_BUSINESSES_DATA` | Smart Leads, Social Listening, Admin CRM | `nord-tech`, `alpine`, `biz-5` (Novus), `biz-10` (and prospects under each)                                                                                                                        |
| `data/outreach-dashboard.json`                     | Outreach Dashboard                       | Large generated list (~200 businesses / ~200 outreach rows) including nord-tech/alpine/meridian/atlas + many `biz-*`                                                                               |
| Inline seeds in `account-management-view.tsx`      | Account Management                       | Nigeria Business, Antler in Nigeria, Meridian, Atlas, Blessing Ibunge, NordTech, Alpine, Oak & Stone, Paybridge, Clearpath, Luma, Fieldwork — **not the same set**, one-business-per-account model |

**Alignment implication:** before backend work, we must decide the canonical entity = **Organization** (existing Laravel model), and map admin “business/account/client” language onto it. Fixture IDs must not become production IDs.

### Data pattern shared by CRM / Smart Leads / Social Listening

- Client/business scope selector (`all` or one business).
- Sticky desktop client list / mobile compact selector.
- Summary metric cards + animated charts (IntersectionObserver).
- Tables with search, filters, pagination.
- Detail drawers/dialogs with focus trap + Escape.
- Local session notices (“Demo data”, “resets on refresh”).
- CSV export generated client-side from filtered rows (CRM + Social Listening).

---

## B.1 Outreach Dashboard

**Files:**  
`app/page.tsx`, `app/sales-engine/page.tsx`, `components/dashboard/*`, `lib/outreach-dashboard.ts`, `data/outreach-dashboard.json`

### Purpose

Platform-level snapshot of outreach volume across businesses: channel metrics, business directory, outreach list, and a per-business activity drawer.

### Data today

- 100% static JSON (`source: "demo"`).
- Types: `OutreachDashboardMetric`, `OutreachBusiness`, `DashboardOutreach`, `OutreachDashboardData`.

### Surfaces

1. Metric cards: Email / SMS / In-person (totals + primary/secondary percents + avatar counts).
2. Toggle views: Businesses | Outreach.
3. Search + filter panel + pagination.
4. Business selection scopes the view.
5. Activity drawer: tabs All / Emails / Meetings / Notes; **timeline events are hardcoded**, not derived from JSON outreach rows.
6. Local notes in drawer (React state only).
7. “Open Account” → confirmation modal → `**console.log` + `alert` only\*\* (no Account Management handoff, no API).

### Mutations today

None that persist. Notes reset when drawer remounts / page reloads.

### Fixture drift note

Same IDs (e.g. `nord-tech`, `alpine`) appear in outreach JSON and Smart Leads fixtures with **different names/industries/owners/metrics**. Production must use one org source of truth.

### Backend mapping candidates (existing client APIs — org-scoped only)

- `GET /outreach/dashboard`
- `GET /outreach/activities`
- `GET /metrics`, `GET /metrics/trend`
- `GET /dashboard`

These are **single-org** endpoints behind Sanctum + `org.resolve`. Admin needs **cross-org aggregates** that do not exist yet.

---

## B.2 Smart Leads (Admin)

**Files:**  
`app/sales-engine/smart-leads/page.tsx`, `components/smart-leads/*`, `lib/smart-leads.ts`

### Purpose

Inspect each onboarded client’s **prospect/sample pool**: fit, intent tier, buying signals, contacts, activity evidence. Admin can leave review notes and “prepare demo enrollment.”

### Entities / fields (from TypeScript)

**OnboardedBusiness**

- `id`, `name`, `company`, `industry`, `country`, `website`, `owner`, `created`, `avatarColor`, `emailsSent`
- `analytics` (counts, tier %, avg fit, buying signals, meetings, verified contact rate, signalBreakdown)
- `prospects[]`

**SmartLead (prospect)**

- Identity: `id`, `businessId`, `company`, `industry`, `location`, `country`, `employees`, `website`, `revenue`
- Scoring: `fitScore`, `tier` (`high|middle|low`), `intentLevel`, `intentTrigger`, `whyNow`
- Contact: `primaryContact` (`name`, `title`, `email`, `phone`, `verified`, `avatarColor`, `linkedin?`)
- Other: `techStack[]`, `matchedPresets[]`, `status`, `lastActive`, `activities[]`

**VelocityDayPoint** (illustrative 14-day cadence chart)

- `day`, `dayLabel`, `touches`, `opens`, `replies`, `meetings` — generated deterministically in `getBusinessVelocityData()`, **not from real outreach**.

### Surfaces / actions

| Action                                 | Behavior today                                                                                                             | Production expectation to align on                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Select client business                 | Local state                                                                                                                | Load org-scoped leads/companies                                                       |
| Search/sort clients                    | Local                                                                                                                      | Server filter/sort                                                                    |
| Filter prospects by tier/signal/search | Local                                                                                                                      | Server or client filter over API page                                                 |
| Chart segment → directory filter       | Local                                                                                                                      | Same                                                                                  |
| Open prospect drawer                   | Local fixture                                                                                                              | Lead/company detail API                                                               |
| Add admin note                         | Session state                                                                                                              | Persist note + audit actor                                                            |
| Copy email                             | Clipboard                                                                                                                  | Same (no API)                                                                         |
| Bulk/single “Prepare demo enrollment”  | Local “prepared” flag; cadence choices: Enterprise discovery / Funding follow-up / Expansion introduction; **no messages** | Decide: real cadence enqueue vs admin-only “mark ready for client outreach” vs remove |
| Pagination / page size                 | Local (4/6/8)                                                                                                              | Server pagination                                                                     |

### What it is _not_

- Not the client Smart Leads discovery chat flow.
- Not live enrichment.
- Enrollment does **not** call outreach send APIs.

### Backend mapping candidates

- `GET /companies`, `GET /leads`
- Discovery runs / pending leads
- Lead feedback / sync-to-CRM
- Metrics endpoints

Again: all org-scoped. Admin needs multi-org listing + per-org drilldown.

---

## B.3 Social Listening (Admin)

**Files:**  
`app/sales-engine/social-listening/page.tsx`, `components/social-listening/*`, `lib/social-listening.ts`

### Purpose

Cross-business monitoring oversight: portfolio health, per-business config, signal quality review, scan operations, audit log.

### Views

1. **Overview** — monitoring counts + 4 charts (capture trends, source mix, client review status, buying-stage mix).
2. **Businesses** — ICP blurb, monitoring config summary, recent evidence, pause/resume, queue scan, edit configuration.
3. **Signal review** — searchable queue, source/status filters, pagination, CSV export, bulk approve/suppress, evidence drawer.
4. **Scan operations** — per-source run history, failures, retry queueing.
5. **Activity log** — fixture + session admin actions scoped to selected business.

### Entities / fields

**ListeningBusiness**

- `id`, `name`, `owner`, `industry`, `paused`
- `sources[]` (`LinkedIn|Reddit|Web|Meta`)
- `cadence` (`14|30`), `minScore`, `freshness`
- `destination` (`human_review|qualified_pipeline`)
- `keywords`, `icp`

**Signal**

- `id`, `businessId`, `company`, `author`, `source`, `title`, `quote`, `reason`, `score`, `stage`
- `status` (`Needs review|Approved|Suppressed`)
- `issue`, `crm` (bool — whether already reflected in CRM in fixture)
- `date`

**Scan**

- `id`, `businessId`, `status` (`Completed|Failed|Queued`), `source`, `found`, `date`, `error?`

**AuditEntry**

- `id`, `businessId`, `action`, `detail`, `time`, `actor`

### Mutations (all local, require reason where review-related)

| Action                    | Requires reason? | Side effects claimed in UI copy                                | Actual side effect today     |
| ------------------------- | ---------------- | -------------------------------------------------------------- | ---------------------------- |
| Approve signal(s)         | Yes              | Quality decision only; does **not** create CRM / send outreach | Status flip + audit          |
| Suppress signal(s)        | Yes              | Same                                                           | Status flip + audit          |
| Return to review          | Yes              | Same                                                           | Status flip + audit          |
| Pause / resume monitoring | No (audit only)  | Keeps existing signals                                         | `paused` flip + audit        |
| Edit configuration        | Via form save    | Future scans only; does not purge history                      | Local field updates + audit  |
| Queue / retry scan        | No               | Worker would run; demo stays queued forever                    | Insert `Queued` scan + audit |
| Export CSV                | No               | Download current filter set                                    | Browser blob download        |

### Critical semantic gap vs client social APIs

Client backend already has org-scoped social listening (`SocialListeningController`):

- signals index/show, metrics, settings get/put
- runs store/bootstrap/show
- signal outreach / reminder / sync-to-crm / dismiss

Admin UI statuses (`Needs review / Approved / Suppressed`) do **not** match backend `social_signals.status` values (`new | reviewed | outreached | synced | dismissed`) 1:1.  
Admin “Approved” is an **oversight quality decision**, while client “sync-to-crm / create outreach” is **execution**. These must stay distinct in API design.

Admin “Paused” monitoring has no first-class pause flag called out in the same shape as the fixture; settings/runs exist, but platform pause-as-admin-override needs design.

---

## B.4 Admin CRM

**Files:**  
`app/sales-engine/crm/page.tsx`, `components/crm/*`, `lib/admin-crm.ts`

### Purpose

Platform CRM health and lightweight management across client pipelines — **not** a replacement for the client CRM board.

### Views

1. **Overview** — workspace count, open value, closed win rate, flagged count; charts (momentum, source donut, stage bars, client open vs won value); portfolio table.
2. **Client pipelines** — six-stage pipeline per client, assignments, stale deals, attention items, **review policy** (stale-day threshold).
3. **Records** — registry with search/filters/sort/pagination, drawers, CSV export, bulk archive/restore (select-all = all filtered, including other pages).
4. **Data quality** — unassigned, missing email, seeded duplicates; dismiss duplicate flag with reason (**does not merge**).
5. **Activity log** — outstanding follow-ups (overdue filter) + scoped admin audit history; complete follow-up with reason.

### Entities / fields

**CrmBusiness**

- `id`, `name`, `industry`, `owner`, `team[]`, `pipeline`, `staleDays`

**CrmRecord**

- `id`, `businessId`, `company`, `contact`, `role`, `email`, `owner`
- `stage` (`New|Qualified|Proposal|Negotiation|Won|Lost`)
- `source` (`Smart Leads|Social Listening|Manual / import`)
- `value` (illustrative EUR)
- `created`, `updated`, `due`, `nextAction`
- `archived`, `duplicateOf`, `duplicateReviewed`
- `notes[]` (`text`, `date`, `actor`)

**CrmAudit**

- `id`, `businessId`, `recordId?`, `action`, `detail`, `actor`, `date`

### Analytic definitions encoded in UI (must be preserved or consciously changed)

- **Open:** active, not Won/Lost, not archived.
- **Closed win rate:** Won / (Won + Lost); 0 if none closed.
- **Overdue:** open + due date before snapshot date; due-today is not overdue.
- **Stale:** open + `updated` older than client `staleDays`.
- **Quality issues:** unassigned / missing email / unresolved duplicate; archived excluded.
- Currency display: **EUR illustrative**, no FX conversion.
- Snapshot date in fixtures: `2026-10-13`.

### Mutations (local + reason-required for management)

| Action                                  | Reason required? | Notes                                            |
| --------------------------------------- | ---------------- | ------------------------------------------------ |
| Assign owner (from client team fixture) | Yes (via save)   | Team is fixture-only today                       |
| Change stage                            | Yes              | Stages fixed in prototype                        |
| Correct email                           | Yes              |                                                  |
| Add review note                         | Via note flow    | Notes survive later field corrections in session |
| Archive / restore (single or bulk)      | Yes              | Bulk select-all spans pages                      |
| Dismiss duplicate flag                  | Yes              | Retains both records; no merge                   |
| Complete follow-up                      | Yes              | Clears due date                                  |
| Change stale-deal policy                | Yes              | Per-business `staleDays`                         |
| Export CSV                              | No               | Filtered set                                     |

### Stage model mismatch vs backend (important)

| Admin CRM fixture stages                                 | Backend `Lead::STAGES` / native CRM seed stages       |
| -------------------------------------------------------- | ----------------------------------------------------- |
| New, Qualified, **Proposal**, **Negotiation**, Won, Lost | new, **contacted**, **engaged**, qualified, won, lost |

Admin UI also treats pipeline name as fixed `"Client sales pipeline"`, while backend supports multiple `crm_pipelines` per org with configurable stages.

**Alignment needed:** either (a) admin overview maps onto real org pipelines/stages dynamically, or (b) admin uses a normalized cross-org stage taxonomy. Do not silently force Proposal/Negotiation into production schema without a decision.

---

## B.5 Account Management

**Files:**  
`app/sales-engine/account-management/page.tsx`, `components/account-management/*`

### Purpose

Directory of managed client businesses/accounts: search/filter, create, edit, and demo “sign into” an account context.

### Entity: `Account`

- `id`, `username`, `password`, `companyName`, `industry`, `created`
- `status` (`Active|Pending|Inactive`)
- `prospectPool`, `avatarColor`, `country`, `owner`, `scope`

### Surfaces / actions

- Search by business name / owner / username.
- Filters: industry, prospect-pool range (`<1000`, `1000–2999`, `≥3000`), status.
- Pagination (6 / page).
- Detail panel for selected business.
- Create / edit drawer (name, industry, country, owner, username/email, password+confirm, setup scope, prospect pool).
- Deterministic “setup assistant” (local heuristics only; **no AI**).
- Demo sign-in with seeded password `Demo123!` — **context switch in React state, not real auth**.
- Return to all accounts clears active scope.

### What production likely needs instead

- Platform admin authentication (separate from client org membership).
- Organization CRUD / provisioning / status lifecycle.
- Owner user provisioning (invite or create credentials securely — **never store/display plaintext passwords** as the UI does now).
- Optional “impersonate / open client workspace” with audited break-glass, not password replay.
- Prospect pool as derived metric (from leads/companies), not a free-form editable vanity number — unless product wants quota allocation fields.

---

## B.6 Cross-module relationships (intended mental model)

```
Account Management  →  creates/manages Organizations (client businesses)
        │
        ▼
   Shared business scope appears in:
        ├── Outreach Dashboard   (volume / activity across orgs)
        ├── Smart Leads          (prospect pools / companies / leads per org)
        ├── Social Listening     (signals / scans / settings per org)
        └── Admin CRM            (crm entries / quality / follow-ups per org)

Social Listening "Approved"  ──(oversight)──► does NOT auto-create CRM in current product copy
Smart Leads "Enrollment"     ──(demo)──────► does NOT send outreach
CRM sources label records as coming from Smart Leads / Social Listening / Manual
Audit logs are per-module today; production may want a unified admin audit stream
```

---

# PART C — Existing Backend vs Admin Needs

## C.1 What already exists (client/org-scoped Laravel API)

Auth: Sanctum tokens; org context via `org.resolve` / `X-Organization-Id`.  
Org roles: `owner | admin | member` (organization membership — **not** platform admin).

Already covered domains (high level):

| Domain                        | Representative routes                                               | Models / tables                                                                   |
| ----------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Auth & profile                | `/auth/*`, `/auth/me`                                               | `users`, personal access tokens                                                   |
| Organizations & team          | `/organizations/*`, members, invitations                            | `organizations`, `organization_users`, invitations                                |
| ICP                           | `/icp-profiles/*`                                                   | `icp_profiles`                                                                    |
| Discovery / companies / leads | `/discovery/runs`, `/companies`, `/leads`                           | `companies`, `leads`, discovery tables                                            |
| Metrics / usage               | `/metrics`, `/usage`, `/dashboard`                                  | usage + aggregations                                                              |
| Outreach                      | `/outreach/*` (draft, send, domain, inboxes, dashboard, activities) | `outreach_activities`, domains, inboxes, quotas, etc.                             |
| Social listening              | `/social-listening/*`                                               | `social_listening_settings`, `social_listening_runs`, `social_signals`, reminders |
| Native CRM                    | `/crm/*` pipelines, labels, leads, notes, activities, import/export | `crm_pipelines`, `crm_stages`, `crm_entries`, `crm_notes`, `crm_activities`       |
| Integrations                  | Factory23 status/sync                                               | org F23 token fields                                                              |

Config knobs: `config/sales_engine.php` (monthly search/outreach/enrichment limits).

## C.2 What does **not** exist yet (admin-specific)

1. **Platform admin identity / authorization**
   - No `platform_admin` (or equivalent) role/flag on users.
   - No admin guard/middleware for cross-org access.
   - No admin login dedicated to the admin Next app.
2. **Cross-organization read APIs**
   - No “list all orgs with outreach/smart-leads/social/crm rollups”.
   - Existing dashboards/metrics stop at current org.
3. **Admin audit log store**
   - UI invents audit entries in React state.
   - No durable `admin_audit_events` (or similar) with reason, actor, target, org, payload.
4. **Admin CRM oversight APIs**
   - No cross-org CRM health, stale policy, duplicate review, bulk archive-as-admin.
   - Client CRM exists, but semantics/stages differ from admin UI.
5. **Admin social ops APIs**
   - No cross-org review queue with approve/suppress + reason as platform action.
   - No admin force pause / queue scan across orgs as a first-class admin surface (beyond acting inside one org token).
6. **Account provisioning as platform operation**
   - Orgs can be created by authenticated users today, but not via a platform “Account Management” admin API with status lifecycle + provisioning workflow matching the admin UI.
7. **Admin settings module**
   - Frontend link exists; backend and page both absent.

## C.3 Reuse strategy (recommended direction for alignment)

Do **not** build a second CRM/social/leads database. Prefer:

1. Add a **platform admin API surface** (e.g. `/api/v1/admin/...` or `/api/v1/platform/...` — name TBD in Part F) that:
   - Authenticates platform admins.
   - Queries existing org-scoped tables **across** `organization_id`s.
   - Writes oversight actions into an admin audit log.
   - Optionally triggers existing services (queue social run, update settings) with elevated auth.
2. Keep client execution endpoints unchanged for client app users.
3. Map admin UI “business” → `organizations` (plus owner user profile fields).
4. Map admin Smart Leads “prospects” → `leads`/`companies` (and enrichment metadata), not a new prospect table — unless product insists on a curated sample pool concept separate from live leads.
5. Map admin CRM records → `crm_entries` + `leads` (+ notes/activities), with careful stage mapping.
6. Map admin social signals → `social_signals` + runs/settings, with an explicit admin review state model (new columns or mapped statuses).

---

# PART D — Frontend Integration Gaps (must be closed for production)

These are incomplete or non-production pieces **on the admin frontend itself**, independent of backend build order.

## D.1 Missing / dead UI

| Gap ID | Item                         | Evidence                                                          | Needed for production                                    |
| ------ | ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| AF-01  | Settings page                | Navbar → `/sales-engine/settings` but no `app/.../settings` route | Define settings IA + page + APIs, or remove link         |
| AF-02  | Notifications control        | Button with no handler                                            | Real notification feed or remove                         |
| AF-03  | Logout                       | No auth session to clear                                          | Wire to admin auth logout                                |
| AF-04  | Hardcoded admin profile      | “Kwame Smith” everywhere                                          | Load from `/admin/me` (or equivalent)                    |
| AF-05  | Demo badges / snapshot dates | Hardcoded fixture snapshots                                       | Replace with live as-of timestamps or remove demo chrome |

## D.2 No API client layer

| Gap ID | Item                                 | Needed                                                                         |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| AF-06  | No `lib/api/*` for admin             | Create admin API client (base URL, bearer token, error handling)               |
| AF-07  | No env config for API base           | `NEXT_PUBLIC_...` (or server proxy) for admin → Laravel                        |
| AF-08  | All modules import fixtures directly | Replace with hooks/services; keep fixtures only for Storybook/tests if desired |

## D.3 Auth & tenancy UX unfinished

| Gap ID | Item                             | Needed                                                                                                     |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AF-09  | No login page / route guard      | Admin login + protected layout                                                                             |
| AF-10  | Account Management password demo | Replace with invite/reset flows; never show plaintext password                                             |
| AF-11  | “Sign in as account”             | Replace with audited impersonation **or** deep-link into client app with exchange token — product decision |
| AF-12  | Scope selector is display-only   | Backend must enforce authorization; FE should treat 403s correctly                                         |

## D.4 Behavior that is intentionally demo-only today (needs product call)

| Gap ID | Behavior                                              | Options to decide                                                                         |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AF-13  | Smart Leads “demo enrollment”                         | Real outreach enqueue / mark-ready flag / remove from admin                               |
| AF-14  | Social “Approved” does not create CRM                 | Keep as oversight-only **or** optional “approve + push to client CRM”                     |
| AF-15  | Queued scans never complete in UI                     | Wire to real runs + polling/websockets                                                    |
| AF-16  | CRM values in EUR illustrative                        | Use org pipeline currency / real budget fields                                            |
| AF-17  | Velocity/outreach charts in Smart Leads are synthetic | Replace with real outreach aggregates or label as unavailable                             |
| AF-18  | Dashboard activity timeline hardcoded                 | Bind to outreach activities + notes APIs                                                  |
| AF-18b | Outreach “Open Account” is `console.log`/`alert` only | Wire to org detail / Account Management / impersonation — or remove                       |
| AF-19  | Data quality duplicates are seeded pairs              | Implement real duplicate detection rules (backend already has some lead duplicate fields) |

## D.5 Data model / UX mismatches to reconcile during FE wiring

| Gap ID | Mismatch                                      | Notes                                                                  |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| AF-20  | CRM stage vocabulary                          | Admin vs backend stages differ                                         |
| AF-21  | Social status vocabulary                      | Admin review states vs `social_signals.status`                         |
| AF-22  | Social sources labels                         | UI: LinkedIn/Reddit/Web/Meta vs backend platform strings               |
| AF-23  | Business fixture sets disagree across modules | Unify on organizations API                                             |
| AF-24  | Account Management “one business per account” | Backend is user↔many orgs; decide admin directory grain                |
| AF-25  | Admin CRM team assignees are fake names       | Should be org members (`/crm/assignees` equivalent cross-org)          |
| AF-26  | Select-all-across-pages bulk archive          | Needs server-side “filter snapshot” or explicit “all matching IDs” API |

## D.6 Production non-functionals missing from FE

- Loading / empty / error / retry states for network failures (mostly absent; optimistic local state only).
- Optimistic updates vs invalidation strategy.
- Pagination total counts from server.
- Permission-aware UI (hide actions admin role cannot perform).
- CSV export may need server export for large datasets (client blob will not scale).
- Timezones: audits use Africa/Lagos in places; production needs consistent org/admin timezone policy.

---

# PART E — Production-Ready Work Breakdown

This is the proposed delivery map for alignment. **Not started.**

## E.0 Decisions to lock before coding (blockers)

1. **Who is an admin?** Platform role on Sales Engine users? Separate admin SSO? Factory23 staff assertion reuse?
2. **Impersonation:** required or not for v1?
3. **Admin social approve semantics:** oversight-only vs push-to-CRM/outreach.
4. **Smart Leads enrollment:** keep, redefine, or remove.
5. **CRM stage strategy:** dynamic per-org stages vs normalized admin taxonomy.
6. **Account provisioning:** create org + owner invite vs create org + temp password vs Factory23-linked only.
7. **API prefix & versioning:** `/api/v1/admin/...` vs `/api/v1/platform/...` on same Laravel app (recommended) vs separate service.
8. **Admin app hosting/auth cookie strategy:** token in memory/localStorage vs httpOnly cookie via BFF.
9. **ID vocabulary:** confirm admin “business” = `organization_id` everywhere, and never overload client `business_id` (= company) meaning.

## E.1 Phase 0 — Foundation (platform admin core)

**Backend**

- Platform admin role/flag + middleware/policies.
- Admin auth endpoints (`login`, `logout`, `me`) or reuse Sanctum with platform gate.
- `admin_audit_events` table (actor_user_id, organization_id, action, reason, subject_type/id, meta, created_at).
- Standard response envelopes, pagination, filtering conventions for admin list endpoints.
- Feature tests for authz: non-admin cannot hit admin routes; admin cannot be blocked by missing `X-Organization-Id`.

**Frontend**

- Login page + auth provider + route guards.
- Replace hardcoded navbar user.
- Wire logout/settings stub policy (even if settings is “coming soon”).
- Admin API client.

**Exit criteria:** Admin can log in, hit a secured `/admin/me`, and be rejected if not platform admin.

## E.2 Phase 1 — Account Management (canonical business directory)

**Backend**

- `GET /admin/organizations` (search, industry, status, pool ranges, pagination).
- `GET /admin/organizations/{id}`
- `POST /admin/organizations` (provision org + owner invitation/user).
- `PATCH /admin/organizations/{id}` (profile fields, status Active/Pending/Inactive).
- Derived metrics: prospect/lead counts, member counts.
- Secure credential flows (invite/reset) — no password echo.

**Frontend**

- Replace Account Management fixtures with API.
- Remove demo password sign-in or replace with approved impersonation flow.
- Align field names (`companyName` → org `name`, etc.).

**Exit criteria:** Admins can list/create/update real organizations; changes persist and appear in other modules’ scope selectors.

## E.3 Phase 2 — Outreach Dashboard (cross-org analytics)

**Backend**

- `GET /admin/outreach/dashboard` (cross-org metrics + business rollups).
- `GET /admin/outreach/activities` (filter by org, channel, status).
- `GET /admin/organizations/{id}/activity-timeline` (emails/meetings/notes/SMS as available).
- Clarify which channels are truly available (client gaps already note SMS/voice/received email limitations).

**Frontend**

- Replace `outreach-dashboard.json`.
- Bind activity drawer to real timeline; persist notes if product wants admin notes.

**Exit criteria:** Dashboard numbers match DB aggregations for selected scope; no demo JSON in production builds.

## E.4 Phase 3 — Smart Leads admin oversight

**Backend**

- `GET /admin/organizations/{id}/leads` (or `/admin/leads?organization_id=`) with fit/intent/signal filters.
- Lead detail with contacts, activities, admin notes.
- Decide enrollment endpoint or remove UI.
- Analytics endpoints for tier distribution / buying-signal coverage / real outreach velocity (if available).

**Frontend**

- Replace `ONBOARDED_BUSINESSES_DATA` usage.
- Remove or relabel synthetic velocity chart until real.

**Exit criteria:** Prospect directory reflects live leads/companies; notes persist with audit.

## E.5 Phase 4 — Social Listening admin oversight

**Backend**

- Cross-org signals queue with admin review states + reason.
- Pause/resume override.
- Settings read/update as admin.
- Queue/retry run using existing orchestrator/jobs.
- Run history + failure diagnostics across orgs.
- Explicit mapping document: UI status ↔ DB status; approve side effects.

**Frontend**

- Replace `lib/social-listening.ts` fixtures.
- Poll run status so Queued → Completed/Failed.
- Keep copy honest about whether approve creates CRM.

**Exit criteria:** Admin can review/suppress/pause/queue for real orgs; audits durable; workers process queued runs.

## E.6 Phase 5 — Admin CRM oversight

**Backend**

- Cross-org CRM records list + analytics matching agreed definitions.
- Record patch actions (owner, stage, email) with reason → audit.
- Archive/restore semantics (map to soft delete / status / meta — decide).
- Duplicate review workflow (leverage `crm_duplicate_of` / related fields where present).
- Follow-up completion (map to reminders/activities/due fields — decide source of truth).
- Per-org stale policy storage (new org setting or admin preference table).
- Export endpoint for large filtered sets.

**Frontend**

- Replace `lib/admin-crm.ts` fixtures.
- Dynamic stages/currency from org pipelines **or** normalized mapping layer.
- Bulk actions via server APIs.

**Exit criteria:** CRM overview/quality/activity views run on live `crm_entries`/`leads`; management actions persist and are audited.

## E.7 Phase 6 — Hardening to “production ready”

- Rate limits, pagination caps, query performance (cross-org indexes).
- PII handling / admin access logging / retention.
- RBAC if multiple admin tiers (support vs super-admin).
- Observability (admin action metrics, failed scan alerts).
- FE empty/error/loading polish; remove all “Demo data” chrome in prod.
- E2E tests for critical admin flows.
- Deploy path for `admin/` app (currently local `:3001`; needs hosting/CI like client app).
- Security review: impersonation, export, password/invite flows, cross-org IDOR tests.

---

# PART F — Alignment Checklist

**Status: implemented for v1** (locked decisions from plan `admin_full_backend_30a33889`). Marked below as Agree / Implemented / Out of v1.

### Product identity

- [x] Admin is platform oversight, not a second client sales app. — **Agree / Implemented**
- [x] Every record shows owning business/organization. — **Agree / Implemented** (`organization_id`)
- [x] Admin decisions require reasons and durable audit. — **Agree / Implemented** (`admin_audit_events`)
- [x] Approve-in-admin does not automatically mean outreach sent. — **Agree / Implemented** (oversight-only social review; Smart Leads “prepare outreach” meta flag only)

### Canonical entities

- [x] Admin “business/account/client” = Laravel `organizations` (+ owner user) — **not** `companies`. — **Agree / Implemented**
- [x] Admin APIs will not reuse client `business_id` query meaning (= company). — **Agree / Implemented**
- [x] Smart Leads prospects = existing leads/companies (or documented exception). — **Agree / Implemented**
- [x] Admin CRM records = `crm_entries`/`leads` (with stage strategy chosen). — **Agree / Implemented** (dynamic `crm_stages`)
- [x] Social signals = `social_signals` (UI Needs review/Approved/Suppressed ↔ `new|reviewed|dismissed`; `outreached`/`synced` read-only). — **Agree / Implemented**
- [x] API route group name: `admin` vs `platform`. — **Agree:** `/api/v1/admin/...`

### Auth

- [x] Platform admin auth approach chosen. — **Agree / Implemented** (`platform_admins` + Sanctum PAT + `admin.auth`)
- [x] Impersonation approach chosen (or explicitly out of v1). — **Out of v1** (Account Management demo sign-in removed)
- [x] Account Management will not ship with plaintext demo passwords. — **Agree / Implemented** (email invite owner)

### Phase order

- [x] Agree Phase 0 → 1 → 2… — **Agree / Implemented** (full admin phases 0–6)
- [x] MVP after foundation: Account Management → Dashboard → Smart Leads / Social / CRM. — **Agree / Implemented**

### Frontend cleanup in scope of backend project?

- [x] Settings page: stub “coming soon” (AF-01 deferred). — **Implemented stub**
- [x] Notifications: deferred / not productized in v1.
- [x] Demo enrollment: redefined as “Prepare for client outreach”. — **Implemented**
- [x] Synthetic charts: hide / empty when no real activity. — **Implemented**

### Explicit non-goals for first backend slice (proposed)

- [x] No new discovery providers solely for admin. — **Out of v1**
- [x] No merging of duplicate CRM records in v1 (dismiss flag only). — **Out of v1**
- [x] No admin outbound messaging composer. — **Out of v1**
- [x] No redesign of the admin visual system. — **Out of v1**

Deploy notes: [ADMIN_DEPLOY.md](./ADMIN_DEPLOY.md).

---

# PART G — File Index (quick reference)

### Admin frontend

- Product/design: `admin/PRODUCT.md`, `admin/DESIGN.md`, `admin/README.md`
- Shell: `admin/app/layout.tsx`, `admin/components/layout/navbar.tsx`
- Dashboard: `admin/components/dashboard/*`, `admin/data/outreach-dashboard.json`, `admin/lib/outreach-dashboard.ts`
- Smart Leads: `admin/components/smart-leads/*`, `admin/lib/smart-leads.ts`
- Social Listening: `admin/components/social-listening/*`, `admin/lib/social-listening.ts`
- CRM: `admin/components/crm/*`, `admin/lib/admin-crm.ts`
- Accounts: `admin/components/account-management/*`

### Existing backend (reuse, not admin yet)

- Routes: `backend/routes/api.php`
- Social: `backend/app/Http/Controllers/Api/V1/SocialListeningController.php`
- CRM: `NativeCrmController` + CRM models/migrations
- Orgs/Users: `Organization`, `User`, `OrganizationUser`
- Client FE gap doc (admin excluded): `docs/FRONTEND_API_GAPS.md`

---

# PART H — One-page executive summary

The Sales Engine **admin** app is a polished, multi-module platform console (Dashboard, Smart Leads, Social Listening, CRM, Account Management) that today runs entirely on **local fixtures and React state**. It encodes a clear product idea: **cross-business oversight with reasoned, auditable management actions**, separate from client sales execution.

The Laravel backend already implements rich **single-organization** capabilities for the same domains, but has **no platform-admin auth, no cross-org admin APIs, and no durable admin audit model**. Making admin production-ready means (1) deciding auth/provisioning/impersonation semantics, (2) adding an `/admin` API layer over existing tables/services, (3) reconciling stage/status vocabulary mismatches, and (4) replacing every fixture-backed screen—including dead Settings/notifications/logout paths—with real client wiring and honest empty/error states.

**Part F decisions are locked and implemented for v1.** See [ADMIN_DEPLOY.md](./ADMIN_DEPLOY.md) for environment seed/deploy steps.

---

_End of alignment audit. Implementation tracked via plan `admin_full_backend_30a33889` (phases 0–6)._
