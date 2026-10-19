# Sales Engine Frontend: API Gaps Report

**Audit date:** 19 October 2026
**What was audited:** the Sales Engine client frontend (the Next.js app at the root of `sales-engine/`). The `admin/` app was not reviewed.
**Companion document:** `BACKEND_API_READINESS.md` says whether the backend (`sales-engine/backend/`) can already serve each API listed here, and what setup is needed where it can't.

---

## How to read this document

The document has three parts:

- **Part 1 (plain language).** This is for anyone: product, design, QA, management. It explains what works, what is fake or unfinished, and where.
- **Part 2 (technical).** This is for developers. For each gap it gives the exact file, what the code does today, the API it needs (method, path, request and response) and where to connect it.
- **Part 3 (reference).** This lists every API the frontend already calls successfully, plus notes on leftover code.

Every gap has an ID such as **FE-13**. The backend document uses the same IDs, so you can read the two side by side.

---

# PART 1: Plain-language summary

## 1.1 The short version

Most of the Sales Engine is properly connected to the backend. Lead generation chat, ICP Builder, Pending Review, Social Listening, CRM boards and lead pages, outreach drafting and sending, and email domain setup all load and save real data.

The gaps fall into four groups:

1. **Account pages that point at the wrong server.** Forgot password, reset password, email verification, workspace setup, team invitation and agent login still talk to the old Factory23 server (`api.thefactory23.com`), not to the Sales Engine backend. Users who signed up on Sales Engine **cannot reset their password**. The "Set New Password" page has no save action at all.
2. **Numbers and charts that are drawn rather than calculated.** On Smart Leads, the weekly performance chart and its "+27%" badge are a fixed drawing. The "% increase this week" text on the metric cards is never calculated. The "searches remaining" counter is stored only in the user's browser.
3. **Dashboard cards that always say "Unavailable".** SMS, voice calls and "emails received" have no real data behind them.
4. **Buttons that only half-work.** "Not relevant" on a lead disappears when you refresh the page. WhatsApp "Send" is permanently greyed out. Reminders are always set for 24 hours, with no way to pick a time or see them later. The map on a CRM lead page is a decorative drawing, not a real map.

There is also one opportunity: **the backend can already send SMS**, but the frontend has no SMS option anywhere.

## 1.2 Page-by-page status

| Page (URL) | Overall status | What's not real yet |
|---|---|---|
| Landing page (`/`) | 🟢 Static marketing page (no API expected) | The "Get started" box throws away what the visitor types (FE-32) |
| Login (`/login`) | 🟢 Connected | — |
| Register (`/register`) | 🟢 Connected | — |
| Forgot Password (`/forgot-password`) | 🔴 Wrong server | Sends to the old Factory23 server (FE-01) |
| Reset Password (`/reset-password/[token]`) | 🔴 Wrong server | Same problem (FE-02) |
| Set New Password (`/set-new-password`) | 🔴 Not connected | The form has no submit action at all (FE-03) |
| Verify OTP (`/verify-otp`) | 🔴 Wrong server, no way to reach it | Not used by signup; talks to Factory23 (FE-04) |
| Complete Onboarding (`/complete-onboarding`) | 🔴 Wrong server | Workspace setup goes to Factory23 (FE-05) |
| Team invitation (`/onboarding/internal`) | 🔴 Wrong server | Invitation acceptance goes to Factory23 (FE-06) |
| Agent Login (`/agent/login`) | 🔴 Wrong server, dead ends | Goes to Factory23 and redirects to pages that don't exist (FE-07) |
| Dashboard (`/sales-engine`) | 🟡 Mostly connected | SMS, Voice Calls and "Received" cards are empty; "Account Owner" always "—" (FE-09 to FE-12) |
| Smart Leads (`/smart-leads`) | 🟡 Mostly connected | Trend chart is fake; "% this week" never calculated; search counter is browser-only; "Not relevant" isn't saved; chat feedback icons do nothing; no SMS; WhatsApp can't send (FE-13 to FE-20) |
| Social Listening (`/social-listening`) | 🟡 Mostly connected | All three stat cards show the same %; some filter options don't match real data; reminders fixed at 24h with no list (FE-21 to FE-27) |
| Outreach Activities (`/sales-engine/outreach`) | 🟢 Connected | No SMS tab or count (FE-28) |
| Pending Review (`/sales-engine/pending-review`) | 🟢 Connected | No way to reject or discard a lead (FE-29) |
| CRM board (`/crm`) | 🟢 Connected | — |
| CRM leads list (`/crm/leads`) | 🟢 Connected | — |
| CRM lead details (`/crm/leads/[id]`) | 🟡 Mostly connected | Map is a decorative drawing; "Map Link" never filled; incoming emails not shown (FE-30, FE-31, FE-11) |
| Profile menu (top-right, every page) | 🟡 Minimal | Only "Log out"; no profile, password, team or organisation settings; avatar always default (FE-08) |
| Offline page (`/offline`), Privacy (`/privacy`) | 🟢 Static | Privacy page is still branded "Factory 23" (content, not API) |

🟢 = works with real data · 🟡 = works but some parts are placeholder · 🔴 = not working against the Sales Engine backend

## 1.3 What a user would actually notice

- **"I forgot my password."** The email never arrives for a Sales Engine account, because the request goes to a different system. *(FE-01, FE-02)*
- **"The Smart Leads chart never changes."** It's a picture. It shows "+27% Performance higher this week" for every user, every day. *(FE-13)*
- **"It says I have 500 searches."** The number is invented and kept in the browser. Clearing the browser or switching laptops resets it. *(FE-15)*
- **"I marked a lead as not relevant and it came back."** The choice is never saved. *(FE-16)*
- **"The dashboard says SMS Unavailable."** The backend can send SMS, but the dashboard isn't told how many were sent. *(FE-09, FE-18)*
- **"I can't send WhatsApp messages."** The button is always disabled; only "Copy message" works. *(FE-19)*
- **"The map on the lead page shows 'Dresta Street' for every lead."** It's a fixed drawing. *(FE-30)*
- **"Where are my reminders?"** You can set one, always for 24 hours later, and it arrives by email, but you can't see, change or cancel it. *(FE-25)*
- **"How do I add a teammate or change my name?"** There's no screen for it. *(FE-08)*

## 1.4 Priority order (suggested)

| Priority | Items | Why |
|---|---|---|
| **P0: Blocking** | FE-01, FE-02, FE-03 | Users can be locked out of their accounts for good |
| **P1: Misleading data** | FE-13, FE-14, FE-15, FE-21, FE-22, FE-09 | Users see numbers that are made up or wrong |
| **P2: Half-working features** | FE-16, FE-18, FE-25, FE-29, FE-08, FE-30 | Features look finished but don't stick or are limited |
| **P3: New capability** | FE-10, FE-11, FE-19, FE-12, FE-17 | Needs new integrations (telephony, inbound email, WhatsApp) |
| **P4: Polish / clean-up** | FE-04 to FE-07, FE-20, FE-23, FE-24, FE-26 to FE-28, FE-31, FE-32 | Leftovers, hardcoded lists, small improvements |

---

# PART 2: Technical detail

## 2.0 Architecture you need to know

The frontend talks to **two different servers**:

| Base URL constant | Env var | Default | Defined in | Used by |
|---|---|---|---|---|
| `SALES_ENGINE_API_BASE_URL` | `NEXT_PUBLIC_SALES_ENGINE_API_URL` | `https://api.salesengine.thefactory23.com/api/v1` | `lib/api/sales-engine.ts` | Everything in the live product: login, register, chat, ICP, social listening, outreach, CRM (via `lib/api/native-crm.ts`) |
| `API_BASE_URL` | `NEXT_PUBLIC_API_BASE_URL` | `https://api.thefactory23.com/api/v1` | `lib/api/onboarding.ts`, `lib/auth/server-session.ts` | **Legacy Factory23 server.** Still used by forgot/reset password, OTP, onboarding, invitations and agent login |

Sales Engine requests send `Authorization: Bearer <token>` plus `X-Organization-Id: <org id>`. The session is stored in `lib/sales-engine/session.ts`, and the cookie is managed by `lib/auth/session.ts`.

**Important:** the folder holds 437 frontend `.ts/.tsx` files, but **only 129 are reachable** from a page. The other 308 (operations, payroll, drive, map, tracking, settings, zones, notifications, and others) are copied from the Factory23 app and never render. This report covers only reachable code. See Part 3.2 for the leftovers.

---

## 2.1 Authentication and account

### FE-01: Forgot Password goes to the wrong server
- **Page:** `/forgot-password` → `app/(auth)/forgot-password/page.tsx`
- **Component:** `components/forms/forgot-password-form.tsx` (line ~53, `forgotPassword(...)`)
- **API function:** `lib/api/auth.ts` → `forgotPassword()` uses `apiRequest` from `lib/api/onboarding.ts`, so it calls **`POST {API_BASE_URL}/auth/forgot-password` (Factory23)**
- **Problem:** Login and register use the Sales Engine backend (`lib/api/sales-engine-native-auth.ts`). Accounts created on Sales Engine don't exist on Factory23, so the reset email is never sent.
- **Required API (Sales Engine backend):**
  ```
  POST /api/v1/auth/forgot-password
  Body:    { "email": "user@company.com" }
  200:     { "message": "If that email exists, a reset link has been sent." }   // always 200 (no account enumeration)
  422:     validation errors
  ```
- **Where to wire it:** add a function to `lib/api/sales-engine-native-auth.ts` (for example `requestPasswordReset(email)`) that uses `SALES_ENGINE_API_BASE_URL`, and switch `forgot-password-form.tsx` to call it. Drop the `portal` query param (there's no agent portal).

### FE-02: Reset Password goes to the wrong server
- **Page:** `/reset-password/[token]` → `app/(auth)/reset-password/[token]/page.tsx`
- **Component:** `components/forms/reset-password-form.tsx` (line ~112)
- **API function:** `lib/api/auth.ts` calls `GET {API_BASE_URL}/auth/reset-password/{token}?email=…` (validate) and `POST {API_BASE_URL}/auth/reset-password` (Factory23)
- **Required APIs:**
  ```
  GET  /api/v1/auth/reset-password/{token}?email=user@company.com
  200: { "data": { "valid": true, "email": "user@company.com" } }
  410/422: { "message": "This reset link has expired or was already used." }

  POST /api/v1/auth/reset-password
  Body: { "token": "...", "email": "...", "password": "...", "password_confirmation": "..." }
  200:  { "message": "Password updated.", "data": { "redirect_path": "/login" } }
  ```
- **Where to wire it:** same file as FE-01. The reset email link must point to `{FRONTEND_URL}/reset-password/{token}?email=...`.

### FE-03: Set New Password has no submit action
- **Page:** `/set-new-password` → `app/(auth)/set-new-password/page.tsx`
- **Component:** `components/forms/set-new-password-form.tsx`. It has two password inputs and show/hide toggles only. There is no `<form onSubmit>`, no state for the values and no API call.
- **Decide the purpose first.** Either (a) delete the page, because FE-02 already covers resetting, or (b) make it a "change password while logged in" screen, reached from the profile menu (FE-08).
- **Required API (option b):**
  ```
  PUT /api/v1/auth/password            (auth:sanctum)
  Body: { "current_password": "...", "password": "...", "password_confirmation": "..." }
  200:  { "message": "Password changed." }
  422:  { "errors": { "current_password": ["The current password is incorrect."] } }
  ```

### FE-04: Verify OTP page talks to Factory23 and nothing links to it
- **Page:** `/verify-otp` → `components/forms/otp-form.tsx`
- **API:** `lib/api/onboarding.ts` calls `POST {API_BASE_URL}/auth/verify-email` and `POST {API_BASE_URL}/auth/resend-otp`
- **Problem:** `signup-form.tsx` sends new users straight to `/sales-engine` (line ~99), so this page can't be reached. If email verification is wanted, these APIs are needed on the Sales Engine backend:
  ```
  POST /api/v1/auth/verify-email   Body: { "email": "...", "code": "123456" }  → 200 { "data": { "verified": true } }
  POST /api/v1/auth/resend-otp     Body: { "email": "..." }                     → 200 { "message": "Code sent." }
  ```
  Then change the redirect in `signup-form.tsx` to `/verify-otp?email=...`. If verification isn't wanted, delete the page.

### FE-05: Complete Onboarding (workspace setup) talks to Factory23
- **Page:** `/complete-onboarding` → `components/forms/self-serve-onboarding-form.tsx`
- **APIs called today:** `GET {API_BASE_URL}/countries` (via `lib/api/enterprise.ts`) and `POST {API_BASE_URL}/onboarding/workspace` (via `lib/api/onboarding.ts`)
- **Form fields:** `company_name`, `country`, `team_size` (`solo|2-10|11-50|51-200|201-500|500+`), `purpose`, `user_type`
- **Required APIs:**
  ```
  GET   /api/v1/countries                     → { "data": { "countries": [ { "label": "Nigeria", "value": "NG", "code": "+234" } ] } }
  PATCH /api/v1/organizations/current         Body: { "name", "country", "team_size", "purpose", "user_type" }
                                              → { "data": { organization } }
  ```
  The register endpoint already creates an organisation from `organization_name`, so this page should **update** the current organisation, not create a new one.

### FE-06: Team invitation onboarding talks to Factory23
- **Page:** `/onboarding/internal` → `app/onboarding/internal/internal-onboarding-client.tsx`, `components/forms/onboarding-form.tsx`
- **APIs called today (Factory23):** `POST /internal/onboarding/preview`, `POST /internal/onboarding/complete`, `GET /avatars`, `POST /agent/login` (all in `lib/api/internal-onboarding.ts`)
- **Required APIs (only if team invitations are in scope; see FE-08):**
  ```
  POST /api/v1/invitations/preview    Body: { "token": "..." }  → { "data": { "email", "organization": { "id", "name" }, "role", "expires_at" } }
  POST /api/v1/invitations/accept     Body: { "token", "name", "password", "password_confirmation", "avatar"? }
                                      → { "token": "...", "user": {...}, "organization": { "id" } }   // same shape as /auth/login
  ```

### FE-07: Agent Login talks to Factory23 and redirects to missing pages
- **Page:** `/agent/login` → `app/(auth)/agent/login/page.tsx`, `components/forms/agent-login-form.tsx`
- **APIs called today:** `POST {API_BASE_URL}/agent/login`, plus `GET {API_BASE_URL}/user/me` on the server (`lib/auth/server-session.ts`)
- **Problem:** after login it redirects to `/agent/dashboard` or `/dashboard`. **Neither route exists** in this app. The Sales Engine backend has no "agent" role either (roles are `owner|admin|member`).
- **Recommendation:** remove the page and `lib/auth/server-session.ts`, unless a field-agent experience is planned. No API is required if it's removed.

### FE-08: Profile menu, account settings, team and organisation
- **Component:** `components/layout/navbar.tsx`. The dropdown has only **Log out**.
- **What's missing on screen:** edit profile (name, avatar), change password (FE-03), organisation settings, team members and invites, organisation switcher.
- **Today:** `components/providers/auth-initializer.tsx` calls `GET /auth/me` (✅ works) but always sets `avatar: null`, so the navbar shows a default image. The CRM "Assigned to" dropdown (`GET /crm/assignees` ✅) can only ever list the people already in the organisation, and there's no way to add any.
- **Required APIs:**
  ```
  PATCH  /api/v1/auth/me                       Body: { "name"?, "avatar"? (multipart or URL) }  → { "user": {...} }
  PUT    /api/v1/auth/password                 (see FE-03)
  PATCH  /api/v1/organizations/current         (see FE-05)
  GET    /api/v1/organizations/current/members → { "data": [ { "id", "name", "email", "role", "joined_at" } ] }
  POST   /api/v1/organizations/current/invitations   Body: { "email", "role": "admin|member" } → 201
  DELETE /api/v1/organizations/current/members/{userId}
  GET    /api/v1/organizations                 ✅ already exists (for an org switcher)
  ```
- **Where to wire it:** a new `/settings` page (or a profile modal) linked from the navbar dropdown. Store the chosen org with `setSalesEngineSession(token, orgId)` so `X-Organization-Id` follows the switch.

---

## 2.2 Dashboard (`/sales-engine`)

**Files:** `app/(dashboard)/sales-engine/page.tsx` → `components/dashboard/outreach-dashboard.tsx` → `live-outreach-dashboard.tsx` → `outreach-dashboard-view.tsx`, `outreach-activity-history.tsx`
**API used:** `GET /outreach/dashboard` ✅ and `GET /outreach/activities?lead_id|business_id=…` ✅ (activity history modal)

The page is wired, but several values arrive as `null` or as placeholder labels from the backend:

### FE-09: "No of SMS" card always shows "—" and "Unavailable"
- **Where:** `outreach-dashboard-view.tsx` metric cards (reads `data.metrics[id="sms"]`)
- **Cause:** the backend returns `total: null`, `primaryLabel: "Unavailable"`.
- **Required response change** (same endpoint, no new route):
  ```json
  { "id": "sms", "title": "No of SMS", "total": 42,
    "primaryLabel": "Sent", "secondaryLabel": "Delivered",
    "primaryPercent": 88, "secondaryPercent": 71,
    "primaryCount": 37, "secondaryCount": 30, "avatars": 0 }
  ```
- **Frontend:** no change needed. The card already renders `primaryCount`/`secondaryCount` when present.

### FE-10: "Number of Voice Calls" card is always empty
- **Where:** same metrics row, `id="voice-calls"`
- **Cause:** there's no telephony anywhere in the system.
- **Required API:** the same `metrics[]` entry filled with `{ total, primaryCount (incoming), secondaryCount (outgoing), primaryPercent, secondaryPercent }`, plus a call-logging integration (see the backend document).
- **Short-term option:** hide the card until telephony exists.

### FE-11: Email "Received" (and incoming emails on CRM lead pages) is unavailable
- **Where:** dashboard Email card (secondary label "Received unavailable"); CRM lead page **Emails** tab (`components/crm/email/email-panel.tsx`), which states "Incoming mailbox synchronization is unavailable."
- **Required:** inbound email capture (replies), exposed through:
  ```
  GET /api/v1/crm/leads/{id}/emails     → each item gains "direction": "outbound" | "inbound", "from_email", "received_at"
  GET /api/v1/outreach/dashboard        → email metric secondaryLabel "Received", secondaryCount = inbound replies
  ```
- **Frontend:** `email-panel.tsx` should show inbound items in the thread list and remove the "unavailable" notice.

### FE-12: "Account Owner" always "—" on outreach rows; "No of Prospects" blank for an outreach row
- **Where:** `outreach-dashboard-view.tsx` table cells and the Activity Overview side panel
- **Cause:** the backend sends `"owner": "—"` for every outreach item (outreach activities have no user column), and the frontend shows `null` prospects when an outreach row is selected.
- **Required response change:** each `outreach[]` item gets `"owner": "<sender's name>"` and the selected business's `prospects` count.

**Frontend-only bug (no API needed):** when `/outreach/dashboard` fails, the page shows "No Available Prospects / Click to create your ICP" instead of an error with a Retry button. The `onRetry` prop is passed but never used (`outreach-dashboard-view.tsx`, `error || empty` branch).

---

## 2.3 Smart Leads (`/smart-leads`)

**Files:** `app/(dashboard)/smart-leads/page.tsx` → `components/sales-engine/sales-engine-view.tsx` (tab `smart-lead`; contains `MetricCard`, `TrendChart`, `ChatWorkspace`, `LeadInlineResults`, `OutreachPanel`), plus `outreach-preview-modal.tsx`, `outreach-settings-modal.tsx`, `icp-builder-modal.tsx`, `crm-action-modals.tsx`.

**Already connected ✅:** chat sessions and history, sending prompts (all intents), discovery run polling and cancel, ICP list/activate/create/update/delete/duplicate, AI search-brief suggestion, geo place search, save leads to CRM (single and batch), recent outreach list/open/regenerate/send/delete, email sender, domain and inbox setup, `/metrics` counts.

### FE-13: Weekly performance trend chart is a hardcoded drawing
- **Where:** `sales-engine-view.tsx` → `function TrendChart()` (lines ~511-565)
- **What it does now:** fixed weekday labels `["Mon","Tues","Weds","Thurs","Fri","Sat"]`, a hand-written SVG path, and a fixed badge reading **"+27% Performance higher this week"**. There's no props and no data.
- **Required API:**
  ```
  GET /api/v1/metrics/trend?range=7d&metric=leads_discovered
  200: { "data": {
          "points": [ { "date": "2026-10-13", "day": "Mon", "value": 14 }, ... 7 items ],
          "change_percent": 27, "direction": "up" | "down" | "flat",
          "highlight_date": "2026-10-17" } }
  ```
  (Or add a `trend` block to the existing `GET /metrics`.)
- **Where to wire it:** add `fetchMetricsTrend()` in `lib/api/sales-engine.ts`, a hook next to `hooks/use-sales-engine-metrics.ts`, then render `TrendChart` with Recharts, the way `components/crm/crm-summary-cards.tsx` already does for CRM analytics.

### FE-14: "Lead Metrics" and "Pending Review" cards never calculate "% increase this week"
- **Where:** `sales-engine-view.tsx` → `SalesEngineView`, the two `<MetricCard … percent="—">` calls (~line 4753-4769). The card renders `{percent}% increase this week`, which displays as **"—% increase this week"**, and the gauge shows "—%".
- **Cause:** `GET /metrics` returns totals only (`leads_in_crm`, `leads_pending_review`, …) with no comparison to last week.
- **Required response change on `GET /metrics`:**
  ```json
  { "leads_in_crm": 120, "leads_in_crm_change_percent": 12,
    "leads_pending_review": 34, "leads_pending_review_change_percent": -5, ... }
  ```
- **Frontend:** pass the values into `percent`, and handle negative numbers (the label currently always says "increase").

### FE-15: Search usage counter lives only in the browser
- **Where:** `sales-engine-view.tsx` → `readSearchUsage()` / `writeSearchUsage()` (localStorage key `sales_engine_search_usage_v1`), `DEFAULT_SEARCH_USAGE_LIMIT = 500`, plus the branch in `handleSend()` that answers "how many searches left" **locally after a fake 900 ms delay** without asking the server.
- **Problem:** the limit is invented, the count resets per browser, and it isn't shared across the team.
- **Required API:**
  ```
  GET /api/v1/usage
  200: { "data": { "period_start": "2026-10-01", "period_end": "2026-10-31",
                   "searches": { "used": 37, "limit": 500 },
                   "outreach_emails": { "used": 12, "limit": 300 },
                   "enrichment_lookups": { "used": 80, "limit": 1000 } } }
  ```
- **Where to wire it:** replace the localStorage helpers with a React Query hook, and invalidate it after every `generate_leads` / `generate_more_leads` send. Also show it somewhere visible (for example under the chat input), not only in answer to a typed question.

### FE-16: "Not relevant" on a lead is not saved
- **Where:** `sales-engine-view.tsx` → `LeadInlineResults` "Not relevant" button → the `onNotRelevant` handler in `ChatWorkspace` (~line 2084). It removes the lead from React state and shows a toast.
- **Problem:** after a refresh the lead reappears (chat history is reloaded from `GET /chat/sessions/{id}/messages`), and it stays in **Pending Review**. The toast says "Generate more already skips prior lead names", which is only partly true: the backend skips *all* recently shown names, not specifically the rejected ones.
- **Required API:**
  ```
  POST /api/v1/leads/{id}/feedback
  Body: { "verdict": "not_relevant", "reason"?: "wrong industry" }
  200:  { "data": { "id": 123, "save_status": "rejected" } }
  ```
  The backend should then (a) drop the lead from `GET /crm/discovery-pending`, (b) mark it rejected inside the stored chat message `leads` JSON, and (c) add it to the exclusion list for future runs.
- **Where to wire it:** call it from `onNotRelevant`, and reuse it on Pending Review (FE-29).

### FE-17: Chat feedback icons (thumbs up, thumbs down, copy) do nothing
- **Where:** `sales-engine-view.tsx` ~line 2209. Three icons render under the welcome message only. They're plain `<ThumbsUp/> <ThumbsDown/> <Copy/>` elements with no buttons or handlers.
- **Required API** (for thumbs; copy can stay client-side with `navigator.clipboard`):
  ```
  POST /api/v1/chat/messages/{messageId}/feedback
  Body: { "rating": "up" | "down", "comment"?: "..." }
  200:  { "data": { "id": 991, "rating": "up" } }
  ```
- **Where to wire it:** put the controls on every assistant message (not only the welcome text), using the message `id` returned by the chat history API.

### FE-18: SMS outreach is missing from the UI (the backend already supports it)
- **Where:** `components/sales-engine/outreach-preview-modal.tsx` (prop `channel: "email" | "whatsapp"`), the `OutreachPreviewState` type in `sales-engine-view.tsx`, and the outreach list views
- **Today:** only Email can be sent, and WhatsApp is copy-only. There's no SMS choice, no phone-number field and no SMS sender status.
- **Backend endpoints that already exist ✅:**
  ```
  POST /outreach/activities/{id}/send      Body: { "channel": "sms", "to_phone": "+2348012345678", "body": "..." }
  POST /outreach/activities/{id}/regenerate Body: { "channel": "sms", "instructions"? }
  GET  /outreach/sender-settings            → data.sms = { configured, from, quota: { used, limit } }
  ```
- **Frontend work:** add `"sms"` to the channel union; add a phone input with E.164 validation (the `react-phone-number-input` package is already installed); add a **Send SMS** button calling `sendOutreachActivity({ channel: "sms", to_phone, body })`; show `sender-settings.sms.configured` and the quota inside `outreach-settings-modal.tsx`; add "Create SMS" to the chat outreach intent prompt.

### FE-19: WhatsApp "Send" is permanently disabled
- **Where:** `outreach-preview-modal.tsx` footer. In the `channel !== "email"` branch the button is hard-`disabled`, and the banner reads "WhatsApp direct dispatch is in beta. Use Copy Message…"
- **Required API:** the same `POST /outreach/activities/{id}/send` accepting `"channel": "whatsapp"` and `"to_phone"`. The backend currently rejects `whatsapp` on send (see the backend document).
- **Short-term frontend option (no backend needed):** add an "Open in WhatsApp" button that opens `https://wa.me/<phone>?text=<encoded body>`.

### FE-20: ICP Builder option lists and signal packs are hardcoded
- **Where:** `components/sales-engine/icp-builder-modal.tsx`, lines ~121-195: `AVAILABLE_INDUSTRIES` (8 items), `AVAILABLE_COMPANY_SIZES`, `AVAILABLE_REVENUE_RANGES`, `AVAILABLE_TERRITORIES` (8 cities), `AVAILABLE_DECISION_MAKERS`, `AVAILABLE_SIGNAL_TYPE_PACKS` (3 packs, with a comment saying they "must match the backend's `pack` values exactly")
- **Impact:** low. Custom values can be typed and territories use the live `GET /geo/places` search. But adding a new signal pack on the backend needs a frontend release.
- **Suggested API:**
  ```
  GET /api/v1/icp-profiles/options
  200: { "data": { "industries": [...], "company_sizes": [...], "revenue_ranges": [...],
                   "suggested_territories": [...], "decision_makers": [...],
                   "signal_type_packs": [ { "value": "default", "label": "...", "description": "..." } ] } }
  ```

---

## 2.4 Social Listening (`/social-listening`)

**Files:** `app/(dashboard)/social-listening/page.tsx` → `sales-engine-view.tsx` (tab `social-listening`: `SocialListeningTab`, `SocialListeningFilters`, `SocialSignalsTable`, `SocialOpportunityDetail`, `ListeningSettingsModal`), plus `social-scan-panel.tsx`, `scan-run-summary-panel.tsx`, `social-listening-empty-states.tsx`, `crm-action-modals.tsx`

**Already connected ✅:** signal list (search, source, signal type and buying-stage filters, sent to the server), signal types, metrics, run bootstrap/trigger/poll, settings read and save, create outreach from a signal, set a reminder, add to CRM, dismiss.

### FE-21: All three stat cards show the same percentage
- **Where:** `SocialListeningTab` → `statCards` (~line 4500). "Signals Detected", "High Opportunities" and "Added to CRM" all use `metrics.percent_change`, and negatives are hidden with `Math.max(0, …)`.
- **Cause:** `GET /social-listening/metrics` returns only one change value (signals detected this week vs. last week).
- **Required response change:**
  ```json
  { "signals_detected": 140, "signals_detected_change_percent": 18,
    "high_opportunities": 22, "high_opportunities_change_percent": -4,
    "added_to_crm": 9, "added_to_crm_change_percent": 50, ... }
  ```

### FE-22: Source filter options don't match the backend's real source labels
- **Where:** `sales-engine-view.tsx` → `sourceFilterOptions` (~line 377): `LinkedIn Post`, `X/Twitter Post`, `Reddit Post`, `Google Search`, `Meta Page Post`
- **Problem:** the backend filters on an exact `source_label`. Native adapters write **`X Post`** and **`YouTube`**, and nothing writes `Google Search`. Picking "Google Search" always returns nothing, and YouTube or native-X signals can't be filtered at all.
- **Required API** (or include it in `GET /social-listening/metrics`):
  ```
  GET /api/v1/social-listening/filters
  200: { "data": { "sources": [ { "value": "LinkedIn Post", "label": "LinkedIn", "count": 31 }, ... ],
                   "buying_stages": [ { "value": "Consideration", "count": 12 }, ... ] } }
  ```

### FE-23: Intent filter options are hardcoded
- **Where:** `intentFilterOptions` (~line 399): `Consideration`, `Vendor Evaluation`, `Research`, sent to the server as `buying_stage`
- **Problem:** `buying_stage` is filled from AI enrichment as free text (only the fallback value is `Consideration`), so other values never match.
- **Required API:** `buying_stages` from the same `/social-listening/filters` endpoint (FE-22).

### FE-24: Listen Settings source list is hardcoded and misses sources and health
- **Where:** `SOURCE_SETTING_OPTIONS` (~line 356): `linkedin_public`, `x_mentions`, `reddit`, `meta_pages`, `meta_graph_pages`
- **Problem:** the backend also supports **`youtube`** plus automatic native sources (`x_native`, `reddit_native`). It also returns per-source health (whether the API key is set, what happened in the last run) as `source_health` in both `GET /social-listening/metrics` and `GET /social-listening/settings`. **The frontend never displays `source_health`.**
- **Required API:** none new. ✅ `source_health` already exists. The frontend should render the list from `source_health` (label, configured or not, last-run status) instead of the static constant.

### FE-25: Reminders are fixed at 24 hours and can't be viewed or cancelled
- **Where:** `SocialListeningTab` → `openReminderConfirm()` always computes `now + 24h`; `executeSetReminder()` sends only `{ note }`. Modal: `crm-action-modals.tsx` → `SetReminderConfirmModal`.
- **Backend today:** `POST /social-listening/signals/{id}/reminder` ✅ already accepts `remind_at` (ISO date). The reminder is sent **by email** when it's due.
- **Frontend work:** add a date/time picker to the modal and send `remind_at`.
- **Missing APIs (for a "My reminders" list):**
  ```
  GET    /api/v1/reminders?status=upcoming|done   → { "data": [ { "id", "remind_at", "note", "signal": { "id", "company", "profile" }, "completed_at" } ] }
  PATCH  /api/v1/reminders/{id}                   Body: { "remind_at"?, "note"? }
  DELETE /api/v1/reminders/{id}
  ```

### FE-26: Signal detail avatar and score label are static
- **Where:** `SocialOpportunityDetail`. The author image is always `/avatars/male-avatar.png`, and `ScoreGauge` always prints **"High"** under the score, even for 41%.
- **Fix:** frontend only, for the label (e.g. ≥80 High, 60-79 Medium, below 60 Low). For a real avatar the API needs an `author_avatar_url` field on the signal resource (optional, since many sources don't provide one).

### FE-27: Bulk "Add to CRM" sends one request per signal
- **Where:** `SocialListeningTab` → `handleBulkAddToCrm()` loops `syncToCrm.mutateAsync({ id })`. Each call hits `POST /crm/leads/from-social-signal` with a single ID.
- **Backend already accepts** `signal_ids` arrays of up to 25 ✅. The fix is frontend-only: send IDs in chunks of 25.

---

## 2.5 Outreach Activities (`/sales-engine/outreach`)

**Files:** `components/sales-engine/sales-engine-outreach-view.tsx`; hook `useOutreachActivities` in `hooks/use-sales-engine-outreach.ts`
**Connected ✅:** paginated list with search, channel, status and sort filters (`GET /outreach/activities`), metrics block, open draft, send, delete, sender settings.

### FE-28: No SMS channel tab or count; card avatars always empty
- **Where:** channel pills (`all | email | whatsapp`, ~line 395) and `metricCards` ("No of Outreach" tracks only Email and WhatsApp)
- **Required response change:** add `smsCount` to the `metrics` object of `GET /outreach/activities`. Then add an "SMS" pill (the backend filter already accepts `channel=sms`).
- **Minor:** the `avatars` arrays are hardcoded to `[]`, so no avatars show. Either drop that UI or return the top recipients.
- **Status filter quirk:** choosing **Sent** filters `delivery_status = 'sent'`, but items that were sent with no webhook yet have `delivery_status = null` and display as "sent". They won't appear under the Sent filter (backend tweak; see the backend document).

---

## 2.6 Pending Review (`/sales-engine/pending-review`)

**Files:** `components/sales-engine/sales-engine-pending-review-view.tsx`, `hooks/use-sales-engine-pending-leads.ts`
**Connected ✅:** pending list (`GET /crm/discovery-pending`, all pages fetched), save one or many to CRM (`POST /crm/leads/from-discovery`), pipeline picker.

### FE-29: There is no way to reject or discard a pending lead
- **Where:** each lead row has Copy, Inspect and **Save to CRM**, but no Reject or Discard.
- **Impact:** the Pending Review count (`leads_pending_review`) only ever grows.
- **Required API:** the same as FE-16 (`POST /leads/{id}/feedback` with `verdict: "not_relevant"`), plus a bulk version:
  ```
  POST /api/v1/leads/feedback   Body: { "lead_ids": [1,2,3], "verdict": "not_relevant" }
  ```

---

## 2.7 CRM (`/crm`, `/crm/leads`, `/crm/leads/[id]`)

**Connected ✅:** pipelines (list, create, rename, delete, set company default, set personal default), labels/stages (list, create, update, reorder, delete), leads (list, filter, paginate by stage, create, update, delete, drag between stages), lead details, notes, activities, assignees, analytics (summary cards and 7-day trend chart), agent uploads overview, CSV import (preview and commit) and export, and the lead emails list and send.

### FE-30: The lead-details map is a decorative drawing
- **Where:** `app/(dashboard)/crm/leads/[id]/page.tsx` → `function MapPreview()` (~lines 329-416). It draws CSS grid lines, two diagonal "streets", a hardcoded **"Dresta Street"** label and a red pin at a fixed position, for every lead. The **"Map Link"** field reads `lead.linked_to_map`, which the API never returns, so it always shows the default text.
- **Required API change:** `GET /crm/leads/{id}` should return coordinates:
  ```json
  { "lead": { ..., "location": "Victoria Island, Lagos",
              "latitude": 6.4281, "longitude": 3.4219,
              "location_status": "resolved" | "unknown" | "outside_territory",
              "map_url": "https://maps.google.com/?q=6.4281,3.4219" } }
  ```
- **Frontend:** replace `MapPreview` with a real static map (for example a Mapbox or Google Static Maps image; `mapbox-gl` is already a dependency), or link out to `map_url`. Show "Location not confirmed" when there are no coordinates.

### FE-31: Lead photo or company logo is always the default ghost image
- **Where:** the lead-details hero card uses `/avatars/default-ghost.svg`.
- **Optional API field:** `logo_url` (company favicon or logo found during enrichment) or `avatar_url` on the lead resource. Low priority.

*(Incoming emails on the lead Emails tab: see FE-11.)*

---

## 2.8 Landing page (`/`)

### FE-32: The "Get started" box throws away what the visitor types
- **Where:** `components/landing/hero-stage.tsx`. A `<form action="/register" method="get">` with input `name="profile"` ("Trade, territory, size") sends the user to `/register?profile=...`.
- **Problem:** `components/forms/signup-form.tsx` never reads `profile`, so the visitor's description is lost.
- **APIs:** none new. After a successful register, call the existing `POST /icp-profiles` ✅ (or `POST /icp-profiles/suggest-search-brief` ✅ first) with the seed text, so the user lands with a draft ICP.
- **Also static (fine, but note):** `components/landing/proof-band.tsx` shows the marketing stat "3k+" as fixed text.

---

# PART 3: Reference

## 3.1 APIs the frontend already uses successfully (all on the Sales Engine backend)

| Area | Method and path | Called from |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `GET /auth/me` | `lib/api/sales-engine-native-auth.ts` |
| Geo | `GET /geo/places?q=` | ICP Builder territory search |
| ICP | `GET/POST /icp-profiles`, `PATCH/DELETE /icp-profiles/{id}`, `POST /icp-profiles/{id}/activate`, `POST /icp-profiles/{id}/duplicate`, `POST /icp-profiles/suggest-search-brief` | `icp-builder-modal.tsx`, `use-sales-engine-icp.ts` |
| Chat | `POST /chat/sessions`, `GET /chat/sessions/current`, `GET/POST/DELETE /chat/sessions/{id}/messages` | `use-sales-engine-chat.ts` |
| Discovery | `GET /discovery/runs/{id}`, `POST /discovery/runs/{id}/cancel` | `use-pending-chat-discovery.ts`, chat "Stop searching" |
| Metrics | `GET /metrics` | Smart Leads metric cards (counts only) |
| Outreach | `GET /outreach/recent`, `GET /outreach/activities`, `GET /outreach/dashboard`, `GET/DELETE /outreach/activities/{id}`, `POST /outreach/activities/{id}/send`, `POST /outreach/activities/{id}/regenerate` | Dashboard, Smart Leads panel, Outreach Activities, preview modal |
| Sender setup | `GET/PUT /outreach/sender-settings`, `GET/POST/DELETE /outreach/domain`, `POST /outreach/domain/verify`, `POST /outreach/domain/integrity-recheck`, `GET/POST /outreach/inboxes`, `POST /outreach/inboxes/{id}/confirm`, `…/resend`, `…/default`, `DELETE /outreach/inboxes/{id}`, `GET/POST /outreach/setup-request` | `outreach-settings-modal.tsx` |
| Social listening | `GET /social-listening/signals`, `GET /social-listening/signals/{id}`, `GET /social-listening/metrics`, `GET/PUT /social-listening/settings`, `POST /social-listening/runs`, `POST /social-listening/runs/bootstrap`, `GET /social-listening/runs/{id}`, `POST /social-listening/signals/{id}/outreach`, `…/reminder`, `…/dismiss`, `GET /signal-types` | Social Listening tab |
| CRM | `GET /crm/discovery-pending`, `GET/POST /crm/pipelines`, `PATCH /crm/pipelines/{id}`, `POST /crm/pipelines/{id}/delete`, `…/set-default`, `GET /crm/preferences`, `PUT /crm/preferences/preferred-pipeline`, `GET/POST /crm/labels`, `PATCH /crm/labels/{id}`, `POST /crm/labels/{id}/delete`, `POST /crm/labels/reorder`, `GET /crm/assignees`, `GET/POST /crm/leads`, `GET /crm/leads/pipeline`, `GET /crm/leads/analytics`, `GET /crm/leads/agent-uploads-overview`, `POST /crm/leads/from-discovery`, `POST /crm/leads/from-social-signal`, `POST /crm/leads/import/preview`, `POST /crm/leads/import`, `GET /crm/leads/export`, `GET /crm/leads/{id}`, `PATCH /crm/leads/{id}/native`, `DELETE /crm/leads/{id}`, `POST /crm/leads/{id}/notes`, `POST /crm/leads/{id}/activities`, `GET/POST /crm/leads/{id}/emails` | CRM pages, Pending Review, save-to-CRM modals |

## 3.2 Leftover code (not reachable from any page)

Removing or isolating this would make the codebase much easier to work on. None of it shows up in the app today.

- **308 unreachable files**, including `components/operations/*` (36), `components/map/*` (20), `components/payroll/*`, `components/drive/*`, `components/settings/*` (20), `components/tracking/*`, `components/zones/*`, `components/notifications/*`, `components/profile/*`, `components/dashboard/{ai-chat,dashboard-*}`, 42 hooks (`use-tasks`, `use-payroll`, `use-drive`, `use-tracking`, `use-territories`, `use-meetings`, `use-notifications`, and others) and 26 `lib/api/*` modules. Almost all of them call the Factory23 API.
- **Next.js server routes still present:** `app/api/places/*` (a Google Places proxy charged against Factory23 "map credits") and `app/api/support/*` (a Factory23 support-session proxy). Nothing reachable calls them.
- **`app/(dashboard)/generic-placeholder.tsx`**: an unused placeholder component.
- **Factory23 branding in reachable pages:** `/privacy` is titled "Privacy Policy | Factory 23"; `login-form.tsx` links to `/files/Factory23 Terms of Service.pdf` and `/files/Factory23 Privacy Policy.pdf`.
- **Unused functions in reachable files:** `lib/api/sales-engine.ts` still exports Factory23 bridge helpers (`resolveSalesEngineAccess`, `requestSalesEngineAccess`, `ensureFactory23CrmLink`, assertion/exchange helpers). Nothing calls them.
- **"Remember me" checkbox** on the login form is collected but has no effect (the session is always persisted).

## 3.3 Gap index

| ID | Page | One-line description | Backend status (see companion doc) |
|---|---|---|---|
| FE-01 | Forgot Password | Calls Factory23, not Sales Engine | ❌ Missing |
| FE-02 | Reset Password | Calls Factory23, not Sales Engine | ❌ Missing |
| FE-03 | Set New Password | No submit or API at all | ❌ Missing |
| FE-04 | Verify OTP | Calls Factory23; nothing links to it | ❌ Missing |
| FE-05 | Complete Onboarding | Calls Factory23 | ⚠️ Partial |
| FE-06 | Team invitation | Calls Factory23 | ❌ Missing |
| FE-07 | Agent Login | Calls Factory23; redirects to missing pages | ❌ Missing (remove page) |
| FE-08 | Profile menu / settings | No profile, password, team or org screens | ⚠️ Partial |
| FE-09 | Dashboard | SMS card empty | ⚠️ Partial (data exists) |
| FE-10 | Dashboard | Voice calls card empty | ❌ Missing |
| FE-11 | Dashboard + CRM lead | No received or inbound emails | ❌ Missing |
| FE-12 | Dashboard | Account Owner "—" | ⚠️ Partial |
| FE-13 | Smart Leads | Trend chart hardcoded | ⚠️ Partial |
| FE-14 | Smart Leads | "% this week" never calculated | ⚠️ Partial |
| FE-15 | Smart Leads | Search usage in localStorage | ⚠️ Partial |
| FE-16 | Smart Leads | "Not relevant" not saved | ⚠️ Partial |
| FE-17 | Smart Leads | Chat feedback icons do nothing | ❌ Missing |
| FE-18 | Smart Leads / Outreach | No SMS channel in UI | ✅ Ready |
| FE-19 | Smart Leads / Outreach | WhatsApp send disabled | ❌ Missing |
| FE-20 | ICP Builder | Option lists hardcoded | ⚠️ Partial |
| FE-21 | Social Listening | Same % on all stat cards | ⚠️ Partial |
| FE-22 | Social Listening | Source filter options mismatch | ⚠️ Partial |
| FE-23 | Social Listening | Intent filter hardcoded | ⚠️ Partial |
| FE-24 | Social Listening | Settings source list static, health unused | ✅ Ready |
| FE-25 | Social Listening | Reminder fixed 24h; no list or cancel | ⚠️ Partial |
| FE-26 | Social Listening | Static avatar; score label always "High" | Frontend only / optional field |
| FE-27 | Social Listening | Bulk add-to-CRM sends one request per signal | ✅ Ready |
| FE-28 | Outreach Activities | No SMS tab or count | ⚠️ Partial |
| FE-29 | Pending Review | No reject or discard | ❌ Missing |
| FE-30 | CRM lead details | Fake map; Map Link empty | ❌ Missing |
| FE-31 | CRM lead details | Default avatar only | ❌ Missing (optional) |
| FE-32 | Landing | Hero input discarded | ✅ Ready |
