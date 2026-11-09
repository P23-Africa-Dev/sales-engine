# Sales Engine Backend: API Readiness Report

**Audit date:** 19 October 2026
**What was audited:** the Laravel API in `sales-engine/backend/` (routes in `routes/api.php`, controllers in `app/Http/Controllers/Api/V1/`, models, services, jobs, migrations, `config/services.php`), checked against what the Sales Engine frontend (root of `sales-engine/`) needs.
**Companion document:** `FRONTEND_API_GAPS.md`. The gap IDs (**FE-01 … FE-32**) are the same in both documents.

---

## How to read this document

- **Part 1 (plain language).** What the backend can and can't do today for the unfinished parts of the frontend.
- **Part 2 (ready now).** Features the backend already supports. Only frontend work is needed.
- **Part 3 (partly ready).** Endpoints that exist but return placeholders or lack a field. These are small backend changes.
- **Part 4 (missing).** Features with no backend support, and the full setup needed for each: routes, controllers, database changes, services, background jobs, environment variables and third-party accounts.
- **Part 5 (reference).** Every backend route and whether the frontend uses it, plus an environment-variable checklist.

**Status legend:**

| Symbol | Meaning |
|---|---|
| ✅ **Ready** | The API exists and works. The frontend just needs to call it. |
| ⚠️ **Partial** | The API or the data exists, but needs a change before the frontend can use it properly. |
| ❌ **Missing** | Nothing exists yet. New backend work is needed. |

---

# PART 1: Plain-language summary

## 1.1 The big picture

The backend is in good shape for the core product. Every screen in the live app that loads or saves data uses an endpoint that **already exists** in this backend. **No frontend screen calls a Sales Engine endpoint that's missing.**

The problems come from two places:

1. **Some account screens were never moved over from Factory23.** Password reset, email verification, workspace setup, team invitations and agent login call the old Factory23 server. This backend has **no endpoints for any of them yet**, although some of the groundwork exists (for example, a password-reset table was created by Laravel's default migration).
2. **Some dashboard numbers are left blank or calculated too simply.** The data is often already in the database. For example, SMS messages are sent and tracked, but the dashboard endpoint hardcodes "Unavailable". These are small fixes.

## 1.2 Counts

Of the 32 frontend gaps:

| Status | Count | Gaps |
|---|---|---|
| ✅ Ready (frontend work only) | 4 | FE-18, FE-24, FE-27, FE-32 |
| ⚠️ Partial (small backend change) | 14 | FE-05, FE-08, FE-09, FE-12, FE-13, FE-14, FE-15, FE-16, FE-20, FE-21, FE-22, FE-23, FE-25, FE-28 |
| ❌ Missing (new backend feature) | 13 | FE-01, FE-02, FE-03, FE-04, FE-06, FE-07, FE-10, FE-11, FE-17, FE-19, FE-29, FE-30, FE-31 |
| Frontend-only fix | 1 | FE-26 (score label; avatar field optional) |

## 1.3 What each group means for the business

- **Ready now:** SMS outreach is the biggest win. The backend can already send SMS through Infobip, track delivery and enforce quotas, but there's no button for it in the app.
- **Small backend changes:** these turn fake or blank numbers into real ones. The trend chart, "% this week", SMS counts, usage limits and per-card social listening trends all fall here. Most are a few database queries added to existing endpoints.
- **New backend features:** password reset is the urgent one. Without it, any user who forgets their password is locked out. The others need new integrations (inbound email, WhatsApp, telephony, maps) or new product areas (team invitations, reminders list, feedback).

## 1.4 Suggested build order (backend)

1. **Password reset and change password** (FE-01, FE-02, FE-03). Needs a mail sender configured. *About 1 day.*
2. **Metrics upgrades:** trends, deltas, SMS counts, per-card % (FE-09, FE-13, FE-14, FE-21, FE-28). *About 1-2 days.*
3. **Lead feedback / reject** (FE-16, FE-29) and **social filter values** (FE-22, FE-23). *About 1 day.*
4. **Usage and limits endpoint** (FE-15). *About 1 day, or more if plans and billing are involved.*
5. **Account settings:** profile, organisation profile, team members and invitations (FE-05, FE-06, FE-08). *About 2-4 days.*
6. **Reminders list and cancel** (FE-25), **chat feedback** (FE-17), **outreach owner** (FE-12). *About 1-2 days.*
7. **Integrations:** lead geocoding and map (FE-30), WhatsApp (FE-19), inbound email (FE-11), telephony (FE-10). *Each depends on choosing and setting up a provider.*

*(Estimates are rough and for one experienced Laravel developer.)*

---

# PART 2: ✅ Ready now (frontend work only)

### FE-18: SMS outreach
**The backend is complete.** It just isn't exposed in the UI.

| Piece | Where it lives |
|---|---|
| Send endpoint | `POST /api/v1/outreach/activities/{id}/send` → `OutreachController@sendActivity`. Accepts `channel: "email" \| "sms"`, `to_phone`, `body`. For SMS it calls `OutreachSmsSendService::queueSms()` |
| Draft and regenerate | `POST /outreach/draft` and `POST /outreach/activities/{id}/regenerate` accept `channel: "sms"` |
| Transport | `app/Services/Outreach/Transport/InfobipSmsTransport.php`, job `app/Jobs/SendOutreachSmsJob.php` |
| Delivery webhooks | `POST /api/v1/webhooks/infobip/sms` → `InfobipSmsWebhookController` (updates `delivery_status`) |
| Phone validation | `app/Services/Outreach/PhoneNumber.php` |
| Status and quota | `GET /outreach/sender-settings` returns `data.sms = { configured, from, quota: { used, limit } }` |
| Database | migration `2026_10_05_100000_add_sms_fields_to_outreach.php` (`to_phone` on `outreach_activities`, SMS suppressions) |
| Filtering | `GET /outreach/activities?channel=sms` already works |

**Configuration to check:** `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_SMS_FROM` (registered sender ID), `INFOBIP_SMS_WEBHOOK_TOKEN`. Set the Infobip delivery-report URL to `https://<api-host>/api/v1/webhooks/infobip/sms`. A queue worker must be running (`QUEUE_CONNECTION=database` by default).

### FE-24: Social listening source health
`GET /social-listening/metrics` and `GET /social-listening/settings` both return `source_health` (from `app/Services/Intent/SocialSourceHealth.php`). It has one entry per source (`linkedin_public`, `x_mentions`, `reddit`, `meta_pages`, `meta_graph_pages`, `youtube`, plus automatic native sources), showing whether the API key is set and what happened in the last run. The frontend should build the settings checklist from this field instead of its own constant.
**Configuration:** each source needs its key for health to report "configured": `SERPER_API_KEY` (LinkedIn/X/Reddit/Meta search), `META_ACCESS_TOKEN` (+ `META_APP_ID`, `META_APP_SECRET`), `YOUTUBE_API_KEY`, `X_BEARER_TOKEN`, `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.

### FE-27: Bulk add signals to CRM
`POST /crm/leads/from-social-signal` → `NativeCrmController@saveSignals` already accepts `signal_ids: int[]` (1-25, distinct) plus an optional `pipeline_id`, and returns `{ synced: [...], errors: [...] }`. The frontend just needs to send IDs in chunks of 25.

### FE-32: Seed an ICP from the landing page
`POST /icp-profiles` and `POST /icp-profiles/suggest-search-brief` (throttled 20/min) already exist. Call them after register with the `?profile=` text.

### Other ready endpoints the frontend doesn't use

These exist and work, but no reachable screen calls them. Each is a possible improvement, or can be removed.

| Endpoint | Controller | Possible use |
|---|---|---|
| `GET /organizations`, `POST /organizations`, `GET /organizations/current` | `OrganizationController` | Organisation switcher and "current org" display (FE-08) |
| `GET /icp-profiles/active`, `GET /icp-profiles/{id}` | `IcpProfileController` | Cheaper than loading all profiles to find the active one |
| `POST /outreach/draft` | `OutreachController@draft` | Draft outreach directly (e.g. from a CRM lead page) without going through chat |
| `POST /discovery/runs` | `DiscoveryController@store` | Start lead discovery outside chat |
| `GET /companies`, `GET /companies/{id}`, `GET /leads` | `CompanyController` | Company and lead browsing |
| `POST /leads/{id}/sync-to-crm`, `POST /leads/sync-to-crm` | `LeadSyncController` | Legacy; superseded by `/crm/leads/from-discovery` |
| `POST /social-listening/signals/{id}/sync-to-crm` | `SocialListeningController@syncToCrm` | Legacy; superseded by `/crm/leads/from-social-signal` |
| `GET /crm/pipeline`, `PATCH /crm/leads/{id}` | `CrmController` (legacy, Factory23-era) | Superseded by the native CRM routes. Remove to avoid confusion |
| `GET /dashboard` | alias of `MetricsController@index` | Duplicate of `/metrics` |
| `GET /integrations/factory23/status`, `POST /integrations/factory23/ensure`, `POST /integrations/factory23/crm-sync` | `IntegrationController` | Factory23 bridge. Only unreachable frontend code uses it |
| `POST /auth/factory23/exchange`, `/provision`, `/login-link` | `AuthController` | Factory23 single sign-on bridge. Not used by the native login |
| `GET /health` | `HealthController` | Uptime monitoring |

---

# PART 3: ⚠️ Partly ready (small backend changes)

### FE-09: Dashboard SMS card
- **Endpoint:** `GET /outreach/dashboard` → `OutreachDashboardController@dashboard`
- **Today:** the metrics array hardcodes `$metric('sms', 'No of SMS', null, 'Unavailable', 'Unavailable', null)`.
- **Data available:** `outreach_activities.channel IN ('sms','sms draft')`, `sent_at`, `delivery_status` (updated by the Infobip webhook).
- **Change:** calculate `total` (all SMS activities), `primaryCount` (sent: `sent_at` not null), `secondaryCount` (`delivery_status = 'delivered'`) and the percentages, the same way it's done for email. Use labels "Sent" and "Delivered". No migration needed.

### FE-12: Outreach "Account Owner"
- **Endpoint:** `GET /outreach/dashboard` (also useful for `/outreach/activities`)
- **Today:** `'owner' => '—'` for every outreach row. The `outreach_activities` table has **no user column**.
- **Change:**
  1. Migration: add `user_id` (nullable FK to `users`, `nullOnDelete`) to `outreach_activities`.
  2. Add `user_id` to `OutreachActivity::$fillable` and add a `user()` relation.
  3. Set it everywhere activities are created: `OutreachDraftService`, `OutreachController@draft`, `SocialListeningController@createOutreach`, the chat `create_outreach` handler and `NativeCrmEmailController@store`.
  4. Return `owner: $a->user?->name ?? '—'` and eager-load `user`.
  5. Optional backfill from `meta` where a user ID was stored.

### FE-13: Smart Leads trend chart
- **Today:** `GET /metrics` (`MetricsController@index`) returns totals only. `GET /crm/leads/analytics` (`NativeCrmController@analytics`) **already** returns a 7-day `daily_trend` and a week-over-week `week_growth_percent`, but only for CRM entries.
- **Change, option A (fastest):** the frontend calls `/crm/leads/analytics?source=sales_engine`. It already returns `daily_trend[] { day, date, value }` and `week_growth_percent` / `week_growth_direction`. No backend work.
- **Change, option B (better):** add `GET /metrics/trend?metric=leads_discovered|leads_in_crm|outreach_sent&range=7d|30d` to `MetricsController`. Group `leads.created_at` (or `outreach_activities.sent_at`) by date for the org and return `{ points: [{date, day, value}], change_percent, direction, highlight_date }`. Add an index on `leads(organization_id, created_at)` if it isn't there.

### FE-14: "% increase this week" on the Lead Metrics and Pending Review cards
- **Endpoint:** `GET /metrics`
- **Change:** for each count (`leads_in_crm`, `leads_pending_review`, `leads_discovered`), also return `<name>_change_percent`: this week's count compared with last week's, by `created_at` (or `crm_entries.created_at` for "in CRM"). Use the same formula as `SocialListeningController@metrics`. Return signed numbers so the UI can show decreases.

### FE-15: Search usage and limits
- **Exists:** `api_usage` table and `ApiUsage` model (provider, endpoint, units, estimated_cost per org), written by the LLM, Serper and social adapters; `discovery_runs` (one row per lead search, with `user_id`, `intent`, timestamps); `outreach_send_quotas` plus `OutreachQuotaService` (daily send quotas).
- **Missing:** a concept of a **plan or limit per organisation**, and an endpoint.
- **Change:**
  1. Decide the limit source. The simplest is a config value (`config/sales_engine.php`: `limits.searches_per_month`, default 500). The flexible option is a column on `organizations` (migration: `search_limit_monthly`, `enrichment_limit_monthly`, nullable) or a `plans` table.
  2. New route `GET /usage` → `UsageController@show`. It counts `discovery_runs` for the org in the current period where `intent IN ('generate_leads','generate_more_leads')`, plus the enrichment lookups from `enrichment_logs` / `api_usage`, plus `OutreachQuotaService::snapshot()`.
  3. Optional: enforce the limit in `ChatService` / `DiscoveryController@store` with a 429 and a clear message.

### FE-16: "Not relevant" feedback (and FE-29 Reject on Pending Review)
- **Exists:** `leads.save_status` with constants `Lead::SAVE_DRAFT` / `Lead::SAVE_SAVED`. For `generate_more_leads`, `ChatService` already excludes every lead name shown in the recent session (`recentLeadNamesFromSession`).
- **Missing:** a way to mark a single lead rejected, and to remember it.
- **Change:**
  1. Add `const SAVE_REJECTED = 'rejected'` to `Lead`; add `rejected_at` (timestamp, nullable) and `rejection_reason` (string, nullable) through a migration.
  2. Routes: `POST /leads/{id}/feedback` (`{ verdict: "not_relevant", reason? }`) and `POST /leads/feedback` (`{ lead_ids: [...], verdict }`, max 100) → a new `LeadFeedbackController`.
  3. `NativeCrmController@pending`: exclude `save_status = rejected`. `MetricsController`: `leads_pending_review` already counts only `draft`, so it drops automatically.
  4. Update the stored chat message `leads` JSON (`chat_messages.leads`) so a reload shows the lead as hidden. Alternatively, the frontend filters out leads whose `save_status` is `rejected` when it maps history.
  5. Feed rejected company names and domains into the exclusion list used by `DiscoveryOrchestrator` / `ChatService` for future runs of the same ICP.

### FE-20: ICP Builder option lists
- **Exists:** signal-type packs are defined in `SignalTypeDefinition::PACK_*` (`default`, `software_dev_vertical`, `lagos_corporate_transport`, `none`), with definitions served by `GET /signal-types`.
- **Change:** add `GET /icp-profiles/options` returning `signal_type_packs` (value, label, description from the registry) and, optionally, curated `industries`, `company_sizes`, `revenue_ranges`, `suggested_territories` and `decision_makers` from a config file. No migration needed.

### FE-21: Per-card % change on Social Listening
- **Endpoint:** `GET /social-listening/metrics` (`SocialListeningController@metrics`)
- **Today:** one `percent_change` (signals created this week vs. last week).
- **Change:** calculate the same comparison for `high_opportunities` (`score >= min_score`) and `added_to_crm` (`status = synced` or has a CRM entry, by sync date). Return `signals_detected_change_percent`, `high_opportunities_change_percent` and `added_to_crm_change_percent`, and keep `percent_change` for backward compatibility.

### FE-22 and FE-23: Social Listening filter values
- **Today:** `indexSignals` filters with exact matches on `source_label` and `buying_stage`. Source labels written by adapters are `LinkedIn Post` (Serper), `X/Twitter Post` (Serper), **`X Post`** (native X), `Reddit Post`, `Meta Page Post`, **`YouTube`**. `buying_stage` comes from AI enrichment (`SocialSignalEnricher`), with `Consideration` as the fallback.
- **Change:**
  1. New route `GET /social-listening/filters` → returns the distinct `source_label` and `buying_stage` values (with counts) for the active ICP's non-dismissed signals.
  2. Recommended: normalise the source label (`X Post` → `X/Twitter Post`), or add a `source_key` column so labels can change without breaking filters.
  3. Recommended: limit `buying_stage` to a fixed vocabulary in the enrichment prompt (e.g. `Awareness | Consideration | Vendor Evaluation | Decision`) so filters stay stable.

### FE-25: Reminders
- **Exists:** `POST /social-listening/signals/{id}/reminder` accepts `remind_at` (date) and `note`; stores a `SignalReminder`; schedules `ProcessSignalReminderJob`, which emails the user through SendGrid when due and sets `completed_at`.
- **Missing:** list, edit and cancel.
- **Change:**
  1. Routes: `GET /reminders?status=upcoming|done`, `PATCH /reminders/{id}`, `DELETE /reminders/{id}` → `ReminderController`, scoped to `organization_id` and `user_id`.
  2. When `remind_at` changes, dispatch a new delayed job and have the job ignore stale runs: compare a `version` column, or check `remind_at <= now()` inside `handle()`. For cancel, set `cancelled_at` (migration) and have the job skip reminders where it's set.
- **Configuration:** reminder emails need `SENDGRID_API_KEY` and `SENDGRID_PLATFORM_FROM_EMAIL`. A queue worker must be running for the delayed jobs.

### FE-28: SMS count on Outreach Activities
- **Endpoint:** `GET /outreach/activities` (`OutreachDashboardController@index` → `metrics()`)
- **Change:** add `'smsCount' => (clone $query)->whereIn('channel', ['sms', 'sms draft'])->count()`.
- **Also fix:** the `status=sent` filter uses `where('delivery_status', 'sent')`. Treat "sent" as `delivery_status = 'sent' OR (delivery_status IS NULL AND sent_at IS NOT NULL)`, which matches how items are displayed.

### FE-05: Workspace setup (part of account work)
- **Exists:** `POST /auth/register` creates the user and an organisation (`organization_name`). `GET/POST /organizations`.
- **Missing:** organisation profile fields and an update endpoint; a countries list.
- **Change:**
  1. Migration on `organizations`: `country` (char 2), `team_size` (string 16), `purpose` (string 64), `user_type` (string 32), `onboarding_completed_at` (timestamp), all nullable.
  2. `PATCH /organizations/current` → `OrganizationController@update` (owner/admin only). Validate `team_size in:solo,2-10,11-50,51-200,201-500,500+`.
  3. `GET /countries` (public): serve from a static config file (ISO-3166 list with dial codes). There's no need for a table.
  4. Return `onboarding_completed` in `GET /auth/me` so the frontend knows whether to send the user to `/complete-onboarding`.

### FE-08: Profile, team and organisation settings
- **Exists:** `GET /auth/me` (user plus organisations and roles), `GET /organizations`, `organization_users.role` (`owner|admin|member`), `GET /crm/assignees` (lists org users), and the `X-Organization-Id` resolver middleware (`app/Http/Middleware/ResolveOrganization.php`).
- **Missing:** profile update, avatar, member list and management, invitations (FE-06), and change password (FE-03).
- **Change:**

  | Need | Route | Notes |
  |---|---|---|
  | Edit profile | `PATCH /auth/me` | `name`, `avatar`. Migration: `users.avatar_path` (nullable). Store files on the `public` or `s3` disk (`AWS_*` vars already exist in `config/services.php`) |
  | Members list | `GET /organizations/current/members` | from `organization_users` joined to `users` |
  | Change role | `PATCH /organizations/current/members/{userId}` | owner/admin only; at least one owner must remain |
  | Remove member | `DELETE /organizations/current/members/{userId}` | revoke that user's Sanctum tokens for the org |
  | Invite | see FE-06 | |
  | Authorisation | a Policy or Gate for `manage-organization` | roles `owner`/`admin` |

---

# PART 4: ❌ Missing (new backend features)

### FE-01, FE-02: Forgot password and reset password  ⟵ **P0**
**What exists:**
- `password_reset_tokens` table (Laravel default migration `0001_01_01_000000_create_users_table.php`)
- Laravel's built-in Password Broker (`Illuminate\Support\Facades\Password`)
- `users` table with `password` and `remember_token`

**What's missing:** routes, a controller, an email that links to the Sales Engine frontend, and a working mail sender. `MAIL_MAILER` defaults to **`log`**, so emails are written to the log file, not sent.

**Configuration needed:**
1. **Routes** (`routes/api.php`, inside `Route::prefix('auth')`, public, throttled):
   ```php
   Route::post('/forgot-password', [PasswordResetController::class, 'sendLink'])->middleware('throttle:5,1');
   Route::get('/reset-password/{token}', [PasswordResetController::class, 'validateToken']);
   Route::post('/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:10,1');
   ```
2. **Controller** `app/Http/Controllers/Api/V1/Auth/PasswordResetController.php`:
   - `sendLink`: validate `email`; `Password::sendResetLink(['email' => ...])`; always return 200 with a neutral message.
   - `validateToken`: look up the user by `email`, then `Password::tokenExists($user, $token)` → 200 `{ valid: true }` or 422.
   - `reset`: validate `token, email, password (confirmed, Password::defaults())`; `Password::reset(...)`; on success hash and save the new password, **delete all Sanctum tokens** (`$user->tokens()->delete()`), fire the `PasswordReset` event, and return `{ redirect_path: "/login" }`.
3. **Reset link URL:** in `AppServiceProvider::boot()`:
   ```php
   ResetPassword::createUrlUsing(fn ($user, string $token) =>
       config('app.frontend_url')."/reset-password/{$token}?email=".urlencode($user->email));
   ```
   Add `'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000')` to `config/app.php`. That key doesn't exist yet.
4. **Mail transport** (choose one):
   - SendGrid SMTP (the API key is already used for outreach): `MAIL_MAILER=smtp`, `MAIL_HOST=smtp.sendgrid.net`, `MAIL_PORT=587`, `MAIL_USERNAME=apikey`, `MAIL_PASSWORD=${SENDGRID_API_KEY}`, `MAIL_ENCRYPTION=tls`
   - or Resend or Postmark (their keys are already declared in `config/services.php`)
   - plus `MAIL_FROM_ADDRESS` (for example `no-reply@<your-domain>`) and `MAIL_FROM_NAME="Sales Engine"`
5. **Optional:** a branded notification (`php artisan make:notification ResetPasswordNotification`) and `User::sendPasswordResetNotification()` override.
6. **Tests:** feature tests for link request, invalid token, expired token, successful reset, and token revocation.

### FE-03: Change password (logged in)
- **Route:** `PUT /auth/password` inside the `auth:sanctum` group.
- **Controller:** validate `current_password` (`current_password:sanctum` rule) and `password` (confirmed). Update the password and optionally revoke other tokens (`$user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete()`).
- No migration needed.

### FE-04: Email verification (OTP)
- **Exists:** the `users.email_verified_at` column. Register currently does **not** send any verification.
- **Needed (only if verification is required):**
  1. Migration `email_verification_codes`: `id`, `user_id` FK, `code_hash`, `expires_at`, `attempts` (tinyint), `consumed_at`, timestamps.
  2. In `AuthController@register` (or `AuthService`), generate a 6-digit code, store its hash, and email it (needs the mail transport from FE-01).
  3. Routes: `POST /auth/verify-email` (`email`, `code`; max 5 attempts; sets `email_verified_at`) and `POST /auth/resend-otp` (throttle `3,10`).
  4. Return `email_verified` in `/auth/login` and `/auth/me` responses, and optionally add the `verified` middleware to sensitive routes.

### FE-06: Team invitations
- **Exists:** `organization_users` with roles.
- **Needed:**
  1. Migration `organization_invitations`: `id`, `organization_id` FK, `email`, `role` (`admin|member`), `token_hash` (unique), `invited_by_user_id` FK, `expires_at`, `accepted_at`, `revoked_at`, timestamps; index `(organization_id, email)`.
  2. Model `OrganizationInvitation`; `InvitationService` (create, send, accept).
  3. Routes:
     - authenticated, owner/admin: `POST /organizations/current/invitations`, `GET /organizations/current/invitations`, `DELETE /organizations/current/invitations/{id}`, `POST /organizations/current/invitations/{id}/resend`
     - public: `POST /invitations/preview` (`token` → org name, email, role) and `POST /invitations/accept` (`token`, `name`, `password` → creates or links the user, attaches them to the org, returns the same session payload as `/auth/login`)
  4. Invitation email with a link to `{FRONTEND_URL}/onboarding/internal?token=...` (mail transport from FE-01).
  5. Remove the `/avatars` dependency: either drop avatar picking from the frontend form or serve a static avatar list.

### FE-07: Agent login
- **There's no agent concept in this backend.** Roles are `owner|admin|member`, and no agent-only routes exist.
- **Recommendation:** remove the frontend page. If a field-agent product is planned, it needs a separate design (role `agent`, scoped permissions, `POST /auth/login` returning a role-specific redirect). That's out of scope here.

### FE-10: Voice calls
- **Nothing exists** (no telephony provider, no call table).
- **Needed:**
  1. Choose a provider: **Infobip Voice** (the account is already used for SMS), Twilio or Africa's Talking.
  2. Migration `call_logs`: `id`, `organization_id`, `lead_id` (nullable), `user_id`, `direction` (`inbound|outbound`), `from_number`, `to_number`, `status`, `duration_seconds`, `recording_url` (nullable), `provider_call_id` (unique), `started_at`, `ended_at`, timestamps.
  3. A webhook route (public, signature-verified): `POST /webhooks/{provider}/voice`.
  4. Optional click-to-call: `POST /calls` (`lead_id`, `to_number`).
  5. Fill the `voice-calls` metric in `OutreachDashboardController@dashboard` from `call_logs` (incoming vs. outgoing counts and percentages).
  6. Environment variables, for example `INFOBIP_VOICE_NUMBER` or `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_NUMBER`.
- **Short-term:** hide the card on the frontend.

### FE-11: Inbound email (replies), for "Received" and the lead Emails tab
- **Exists:** outbound sending through SendGrid, delivery webhooks (`POST /webhooks/sendgrid` → `SendGridWebhookController`, events stored in `outreach_webhook_events`), and `outreach_inboxes` (confirmed sender inboxes).
- **Needed:**
  1. **SendGrid Inbound Parse:** add an MX record for a reply subdomain (e.g. `reply.<domain>` → `mx.sendgrid.net`) and set the Parse webhook URL to `https://<api-host>/api/v1/webhooks/sendgrid/inbound`.
  2. Make replies traceable: set `Reply-To: r+<activity_id>.<hmac>@reply.<domain>` when sending (in `SendGridOutreachTransport` / `OutboundIdentity`), so each reply maps back to an outreach activity and lead.
  3. Migration `inbound_emails`: `id`, `organization_id`, `outreach_activity_id` (nullable), `lead_id` (nullable), `from_email`, `to_email`, `subject`, `body_text`, `body_html`, `received_at`, `raw_headers` (json), timestamps.
  4. Controller `SendGridInboundController@handle`: verify a secret in the URL or basic auth, parse the multipart payload, match it to an activity, store it, and update the activity with `meta.replied_at`.
  5. API changes: `GET /crm/leads/{id}/emails` merges inbound items (`direction: "inbound"`), and the `/outreach/dashboard` email metric reports `secondaryLabel: "Received"` with the inbound count.
  6. Environment variables: `SENDGRID_INBOUND_DOMAIN`, `SENDGRID_INBOUND_SECRET`.
  7. **Alternative:** a Gmail/Microsoft 365 mailbox sync (OAuth). This is much bigger, and frontend remnants for it exist only in unreachable code.

### FE-17: Chat message feedback
- **Needed:**
  1. Migration on `chat_messages`: `feedback_rating` (string 8, nullable: `up|down`), `feedback_comment` (text, nullable), `feedback_at` (timestamp). Use a separate `chat_message_feedback` table instead if several users can rate the same message.
  2. Route `POST /chat/messages/{id}/feedback` → `ChatController@feedback`. Check the message belongs to a session in the current org.
  3. Include `feedback_rating` in the message payload from `GET /chat/sessions/{id}/messages`.

### FE-19: WhatsApp sending
- **Exists:** WhatsApp **drafting** (`channel: "whatsapp"` accepted by `/outreach/draft` and `/regenerate`). `sendActivity` validation is `channel in:email,sms`, so **WhatsApp sending is rejected**. There's no WhatsApp transport.
- **Needed:**
  1. Provider: **Infobip WhatsApp** (same account as SMS; needs an approved WhatsApp Business sender and message templates for first contact) or the Meta WhatsApp Cloud API.
  2. `app/Services/Outreach/Transport/InfobipWhatsAppTransport.php` (implementing `OutreachTransport`), `SendOutreachWhatsAppJob`, and an `OutreachWhatsAppSendService` modelled on `OutreachSmsSendService`.
  3. Allow `channel: whatsapp` in `OutreachController@sendActivity` (requires `to_phone`).
  4. A delivery and inbound webhook: `POST /webhooks/infobip/whatsapp`.
  5. A quota mode `whatsapp` in `OutreachQuotaService`, plus suppression handling.
  6. Environment variables: `INFOBIP_WHATSAPP_SENDER`, `INFOBIP_WHATSAPP_WEBHOOK_TOKEN`, and template IDs.
  7. Note: WhatsApp only allows free-form messages within 24 hours of the contact messaging you. Cold outreach needs **pre-approved templates**, which affects how drafts are generated.

### FE-29: Reject or discard pending leads
Built together with FE-16 (see Part 3): `POST /leads/{id}/feedback` and `POST /leads/feedback`, the `SAVE_REJECTED` status, and the change to `NativeCrmController@pending`.

### FE-30: Lead location and map
- **Exists:** `ResolveLeadLocationJob` writes a text `meta.location` and `meta.location_status` (`resolved|outside_territory|unknown`). **No coordinates are stored.** `NativeCrmService::serialize()` returns `location` but no `latitude`/`longitude`/`linked_to_map`.
- **Needed:**
  1. Geocoding provider: Google Geocoding API, Mapbox Geocoding (`mapbox-gl` is already a frontend dependency) or OpenStreetMap Nominatim (free, rate-limited).
  2. Migration: `latitude` (decimal 10,7) and `longitude` (decimal 10,7) on `leads` (or on `crm_entries` if CRM edits should override), plus `geocoded_at`.
  3. Extend `ResolveLeadLocationJob` (or add `GeocodeLeadJob`) to geocode `meta.location` and save the coordinates. Also dispatch it from `NativeCrmController@store` / `update` when `location` changes.
  4. `NativeCrmService::serialize()`: add `latitude`, `longitude`, `map_url` and `linked_to_map` (true when coordinates exist).
  5. Environment variable, for example `GOOGLE_GEOCODING_API_KEY` or `MAPBOX_ACCESS_TOKEN`. The frontend also needs a public map token if it renders a live map.

### FE-31: Lead avatar or logo (optional)
- Add a `logo_url` column to `companies` (or `leads.meta.logo_url`), filled during enrichment (for example from the company website's favicon, or a logo API such as Clearbit's replacement), and return it from `serialize()`.

---

# PART 5: Reference

## 5.1 Full backend route inventory vs. frontend usage

Base path: `/api/v1`. Unless noted, routes use the `auth:sanctum` + `org.resolve` middleware (Bearer token plus `X-Organization-Id`).

| Method | Path | Controller@method | Used by the live frontend? |
|---|---|---|---|
| GET | `/health` | HealthController | No (monitoring) |
| POST | `/webhooks/sendgrid` (public) | SendGridWebhookController@handle | n/a (provider) |
| POST | `/webhooks/infobip/sms` (public) | InfobipSmsWebhookController@handle | n/a (provider) |
| POST | `/auth/register` (public) | AuthController@register | ✅ Register |
| POST | `/auth/login` (public) | AuthController@login | ✅ Login |
| POST | `/auth/factory23/exchange` · `/provision` · `/login-link` (public) | AuthController | No |
| POST | `/auth/logout` | AuthController@logout | ✅ Navbar |
| GET | `/auth/me` | AuthController@me | ✅ AuthInitializer |
| GET/POST | `/organizations` | OrganizationController | No (FE-08) |
| GET | `/organizations/current` | OrganizationController@current | No (FE-08) |
| GET | `/signal-types` | SignalTypeController@index | ✅ Social Listening |
| GET | `/geo/places` | GeoController@places | ✅ ICP Builder |
| POST | `/icp-profiles/suggest-search-brief` | IcpProfileController | ✅ ICP Builder |
| GET | `/icp-profiles/active` · `/icp-profiles/{id}` | IcpProfileController | No |
| GET/POST | `/icp-profiles` | IcpProfileController | ✅ |
| PATCH/DELETE | `/icp-profiles/{id}` | IcpProfileController | ✅ |
| POST | `/icp-profiles/{id}/activate` · `/duplicate` | IcpProfileController | ✅ |
| POST | `/chat/sessions` | ChatController@storeSession | ✅ |
| GET | `/chat/sessions/current` | ChatController@currentSession | ✅ |
| GET/DELETE/POST | `/chat/sessions/{id}/messages` | ChatController | ✅ |
| POST | `/discovery/runs` | DiscoveryController@store | No |
| GET | `/discovery/runs/{id}` | DiscoveryController@show | ✅ |
| POST | `/discovery/runs/{id}/cancel` | DiscoveryController@cancel | ✅ |
| GET | `/companies` · `/companies/{id}` · `/leads` | CompanyController | No |
| POST | `/leads/{id}/sync-to-crm` · `/leads/sync-to-crm` | LeadSyncController | No (legacy) |
| GET | `/metrics` | MetricsController@index | ✅ Smart Leads (⚠️ FE-13, FE-14) |
| GET | `/dashboard` | MetricsController@index | No (duplicate) |
| GET | `/outreach/recent` | OutreachController@recent | ✅ |
| POST | `/outreach/draft` | OutreachController@draft | No |
| GET/DELETE | `/outreach/activities/{id}` | OutreachController | ✅ |
| POST | `/outreach/activities/{id}/regenerate` · `/send` | OutreachController | ✅ (email only; SMS ready, FE-18) |
| GET/PUT | `/outreach/sender-settings` | OutreachSenderController | ✅ |
| GET/POST/DELETE | `/outreach/domain` | OutreachDomainController | ✅ |
| POST | `/outreach/domain/verify` · `/integrity-recheck` | OutreachDomainController | ✅ |
| GET/POST | `/outreach/inboxes` | OutreachInboxController | ✅ |
| POST | `/outreach/inboxes/{id}/confirm` · `/resend` · `/default` | OutreachInboxController | ✅ |
| DELETE | `/outreach/inboxes/{id}` | OutreachInboxController | ✅ |
| GET/POST | `/outreach/setup-request` | OutreachSetupRequestController | ✅ |
| GET | `/social-listening/signals` · `/signals/{id}` | SocialListeningController | ✅ (⚠️ FE-22, FE-23) |
| GET | `/social-listening/metrics` | SocialListeningController@metrics | ✅ (⚠️ FE-21) |
| GET/PUT | `/social-listening/settings` | SocialListeningController | ✅ |
| POST | `/social-listening/runs` · `/runs/bootstrap` | SocialListeningController | ✅ |
| GET | `/social-listening/runs/{id}` | SocialListeningController@showRun | ✅ |
| POST | `/social-listening/signals/{id}/outreach` · `/reminder` · `/dismiss` | SocialListeningController | ✅ (⚠️ FE-25) |
| POST | `/social-listening/signals/{id}/sync-to-crm` | SocialListeningController@syncToCrm | No (legacy) |
| GET | `/outreach/dashboard` | OutreachDashboardController@dashboard | ✅ (⚠️ FE-09, FE-10, FE-11, FE-12) |
| GET | `/outreach/activities` | OutreachDashboardController@index | ✅ (⚠️ FE-28) |
| GET | `/crm/discovery-pending` | NativeCrmController@pending | ✅ |
| GET/POST | `/crm/pipelines` | NativeCrmController | ✅ |
| PATCH | `/crm/pipelines/{id}` | NativeCrmController@updatePipeline | ✅ |
| POST | `/crm/pipelines/{id}/delete` · `/set-default` | NativeCrmController | ✅ |
| GET | `/crm/preferences` | NativeCrmController@preferences | ✅ |
| PUT | `/crm/preferences/preferred-pipeline` | NativeCrmController@setPreference | ✅ |
| GET/POST | `/crm/labels` | NativeCrmController | ✅ |
| POST | `/crm/labels/reorder` · `/labels/{id}/delete` | NativeCrmController | ✅ |
| PATCH | `/crm/labels/{id}` | NativeCrmController@updateLabel | ✅ |
| GET | `/crm/assignees` | NativeCrmController@assignees | ✅ |
| GET/POST | `/crm/leads` | NativeCrmController | ✅ |
| GET | `/crm/leads/pipeline` · `/analytics` · `/agent-uploads-overview` | NativeCrmController | ✅ |
| POST | `/crm/leads/from-discovery` · `/from-social-signal` | NativeCrmController | ✅ |
| POST | `/crm/leads/import/preview` · `/import` | NativeCrmController | ✅ |
| GET | `/crm/leads/export` | NativeCrmController@export | ✅ |
| GET/POST | `/crm/leads/{id}/emails` | NativeCrmEmailController | ✅ (outbound only; FE-11) |
| GET | `/crm/leads/{id}` | NativeCrmController@show | ✅ (⚠️ FE-30) |
| PATCH | `/crm/leads/{id}/native` | NativeCrmController@update | ✅ |
| DELETE | `/crm/leads/{id}` | NativeCrmController@destroy | ✅ |
| POST | `/crm/leads/{id}/notes` · `/activities` | NativeCrmController | ✅ |
| GET | `/crm/pipeline` | CrmController@pipeline | No (legacy) |
| PATCH | `/crm/leads/{id}` | CrmController@updateLead | No (legacy) |
| GET | `/integrations/factory23/status` | IntegrationController | No |
| POST | `/integrations/factory23/ensure` · `/crm-sync` | IntegrationController | No |

## 5.2 New routes proposed in this document

| Method | Path | For | Auth |
|---|---|---|---|
| POST | `/auth/forgot-password` | FE-01 | public, throttled |
| GET | `/auth/reset-password/{token}` | FE-02 | public |
| POST | `/auth/reset-password` | FE-02 | public, throttled |
| PUT | `/auth/password` | FE-03 | sanctum |
| POST | `/auth/verify-email` · `/auth/resend-otp` | FE-04 | public, throttled |
| PATCH | `/auth/me` | FE-08 | sanctum |
| GET | `/countries` | FE-05 | public |
| PATCH | `/organizations/current` | FE-05 | sanctum + org (owner/admin) |
| GET/PATCH/DELETE | `/organizations/current/members[/{userId}]` | FE-08 | sanctum + org (owner/admin for writes) |
| GET/POST/DELETE | `/organizations/current/invitations[/{id}]` (+ `/resend`) | FE-06 | sanctum + org (owner/admin) |
| POST | `/invitations/preview` · `/invitations/accept` | FE-06 | public |
| GET | `/metrics/trend` | FE-13 | sanctum + org |
| GET | `/usage` | FE-15 | sanctum + org |
| POST | `/leads/{id}/feedback` · `/leads/feedback` | FE-16, FE-29 | sanctum + org |
| POST | `/chat/messages/{id}/feedback` | FE-17 | sanctum + org |
| GET | `/icp-profiles/options` | FE-20 | sanctum + org |
| GET | `/social-listening/filters` | FE-22, FE-23 | sanctum + org |
| GET/PATCH/DELETE | `/reminders[/{id}]` | FE-25 | sanctum + org |
| POST | `/webhooks/sendgrid/inbound` | FE-11 | public (secret) |
| POST | `/webhooks/infobip/whatsapp` | FE-19 | public (token) |
| POST | `/webhooks/{provider}/voice`, `/calls` | FE-10 | public / sanctum |

## 5.3 Database changes proposed

| Migration | For |
|---|---|
| `add_user_id_to_outreach_activities` | FE-12 |
| `add_rejection_fields_to_leads` (`rejected_at`, `rejection_reason`; new `save_status` value `rejected`) | FE-16, FE-29 |
| `add_profile_fields_to_organizations` (`country`, `team_size`, `purpose`, `user_type`, `onboarding_completed_at`, optional limits) | FE-05, FE-15 |
| `add_avatar_path_to_users` | FE-08 |
| `create_email_verification_codes_table` | FE-04 |
| `create_organization_invitations_table` | FE-06 |
| `add_feedback_to_chat_messages` | FE-17 |
| `add_cancelled_at_to_signal_reminders` | FE-25 |
| `create_inbound_emails_table` | FE-11 |
| `create_call_logs_table` | FE-10 |
| `add_coordinates_to_leads` (`latitude`, `longitude`, `geocoded_at`) | FE-30 |
| optional: `add_source_key_to_social_signals` | FE-22 |
| optional: `add_logo_url_to_companies` | FE-31 |

## 5.4 Environment and configuration checklist

**Already used by existing features. Confirm they're set in each environment:**

| Variable(s) | Needed for |
|---|---|
| `GLM_API_KEY` (+ `GLM_*_MODEL`) | All AI: chat, research, scoring, outreach drafts |
| `SERPER_API_KEY` | Web search for lead discovery and social listening (LinkedIn/X/Reddit/Meta search) |
| `APOLLO_API_KEY`, `HUNTER_API_KEY`, `BYTEMINE_API_KEY`, `CLEANLIST_API_KEY` | Contact enrichment |
| `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET` | Meta page monitoring |
| `YOUTUBE_API_KEY`, `X_BEARER_TOKEN`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Native social sources |
| `SENDGRID_API_KEY`, `SENDGRID_PLATFORM_FROM_EMAIL`, `SENDGRID_WEBHOOK_PUBLIC_KEY` / `SENDGRID_WEBHOOK_SECRET`, `SENDGRID_UNSUBSCRIBE_GROUP_ID` | Email outreach, domain auth, delivery events, reminder emails |
| `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_SMS_FROM`, `INFOBIP_SMS_WEBHOOK_TOKEN` | SMS outreach (FE-18) |
| `QUEUE_CONNECTION` (default `database`) + a running `php artisan queue:work` | Discovery, enrichment, social runs, sends, reminders |
| `FACTORY23_API_URL`, `FACTORY23_JWT_SECRET`, `FACTORY23_API_TOKEN`, `FACTORY23_INTERNAL_TOKEN` | Only for the legacy Factory23 bridge. Not needed by native login |

**New, introduced by this document:**

| Variable(s) | Needed for |
|---|---|
| `FRONTEND_URL` (+ `config/app.php` → `frontend_url`) | Links in reset, verification and invitation emails (FE-01, FE-04, FE-06) |
| `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | Account emails. **Currently `MAIL_MAILER` defaults to `log`, so nothing is actually sent** |
| `FILESYSTEM_DISK` / `AWS_*` | Avatar uploads (FE-08) |
| `SENDGRID_INBOUND_DOMAIN`, `SENDGRID_INBOUND_SECRET` | Inbound replies (FE-11) |
| `INFOBIP_WHATSAPP_SENDER`, `INFOBIP_WHATSAPP_WEBHOOK_TOKEN` | WhatsApp sending (FE-19) |
| `GOOGLE_GEOCODING_API_KEY` or `MAPBOX_ACCESS_TOKEN` | Lead coordinates and map (FE-30) |
| Voice provider keys (e.g. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`) | Voice calls (FE-10) |

**Frontend environment (for completeness):**

| Variable | Note |
|---|---|
| `NEXT_PUBLIC_SALES_ENGINE_API_URL` | Points to this backend. Required |
| `NEXT_PUBLIC_API_BASE_URL` | Factory23 server. Only needed by the legacy pages in FE-01 to FE-07. Can be removed once those are moved to this backend or deleted |

## 5.5 Notes for the backend team

- **Dashboard performance:** `OutreachDashboardController@dashboard` loads every lead, company and outreach activity for the org with no pagination, and runs a `CrmActivity` count query **per company** inside a `map()` (an N+1 query pattern). This will slow down as data grows. Consider paginating `businesses` and `outreach`, and computing `followUpsCompleted` with one grouped query, the way `individualFollowUps` already does.
- **Legacy routes:** `CrmController` (`/crm/pipeline`, `PATCH /crm/leads/{id}`), `LeadSyncController` and `SocialListeningController@syncToCrm` duplicate the native CRM endpoints. Removing them avoids confusion. Note that `PATCH /crm/leads/{id}` (legacy) and `PATCH /crm/leads/{id}/native` sit side by side.
- **Social signals pagination:** `indexSignals` caps `per_page` at 50, and the frontend fetches *all* pages to paginate on the client. That's fine at the current scale, but consider server-side pagination once orgs have hundreds of signals.
