# Frontend Integration Contract

Source of truth for wiring the standalone Sales Engine UI and the Factory23 embedded `/sales-engine` page.

**Base URL (production):** `https://api.salesengine.thefactory23.com`  
**API prefix:** `/api/v1`  
**Auth:** Sanctum Bearer token (except health + register/login/exchange)

---

## 1. Environments

| Environment | Base URL                                   | Notes                           |
| ----------- | ------------------------------------------ | ------------------------------- |
| Local       | `http://127.0.0.1:8001`                    | `php artisan serve --port=8001` |
| Production  | `https://api.salesengine.thefactory23.com` | DOKS `sales-engine`             |

Health:

```http
GET /api/v1/health
```

```json
{ "status": "ok", "service": "sales-engine" }
```

---

## 2. Auth

### Headers (authenticated routes)

| Header              | Required    | Description                                                                      |
| ------------------- | ----------- | -------------------------------------------------------------------------------- |
| `Authorization`     | Yes         | `Bearer {sanctum_token}`                                                         |
| `Accept`            | Yes         | `application/json`                                                               |
| `Content-Type`      | On writes   | `application/json`                                                               |
| `X-Organization-Id` | Recommended | Org id when user belongs to multiple orgs. If omitted, first membership is used. |

### 2.1 Native register

```http
POST /api/v1/auth/register
```

```json
{
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "password": "Password1!",
    "password_confirmation": "Password1!",
    "organization_name": "Analytical Engines"
}
```

**201** → `{ token, token_type, user, organization }`

### 2.2 Native login

```http
POST /api/v1/auth/login
```

```json
{ "email": "ada@example.com", "password": "Password1!" }
```

**200** → `{ token, token_type, user, organization }`  
**401** → invalid credentials

### 2.3 Me / logout

```http
GET /api/v1/auth/me
POST /api/v1/auth/logout
```

### 2.4 Continue with Factory23

**Important:** Factory23 Sanctum tokens are **not** accepted on Sales Engine protected routes. You must exchange for an **SE** token first. See **§2.5** if you see **401** on `/icp-profiles`.

**Sequence**

1. User is logged into Factory23 (F23 token in memory / `localStorage`).
2. F23 issues a short-lived JWT assertion:

**Management** (owner / admin / supervisor):

```http
POST /api/v1/admin/sales-engine/assertion
Authorization: Bearer {f23_token}
```

**Agents:**

```http
POST /api/v1/agent/sales-engine/assertion
Authorization: Bearer {f23_token}
```

Optional body: `{ "company_id": 123 }`

**200** (F23 envelope) → `data.assertion`, `data.expires_in` (60), `data.exchange_url`

**503** → F23 `SALES_ENGINE_JWT_SECRET` not configured.

3. Exchange on Sales Engine (no F23 token on this call):

```http
POST /api/v1/auth/factory23/exchange
```

```json
{ "assertion": "<jwt>" }
```

**200** → SE `{ token, token_type, user, organization }`

4. All subsequent SE calls use the **SE** Bearer token + optional `X-Organization-Id` (from `organization.id`).

Shared secret: F23 `SALES_ENGINE_JWT_SECRET` ≡ SE `FACTORY23_JWT_SECRET` (HS256, ~60s TTL).

**Factory23 embedded UI:** see [`factory23 fullstack/docs/SALES_ENGINE_FRONTEND.md`](../../factory23 fullstack/docs/SALES_ENGINE_FRONTEND.md).

### 2.5 Troubleshooting 401 (wrong token)

| You called                                          | With token                               | Result             |
| --------------------------------------------------- | ---------------------------------------- | ------------------ |
| `api.salesengine.thefactory23.com/.../icp-profiles` | F23 `539\|…`                             | **401** — expected |
| Same                                                | SE token from `/auth/factory23/exchange` | **200/201**        |

Fix: implement assertion → exchange; store SE token separately (e.g. `sales_engine_token`). Never reuse `apiRequest()` from Factory23 for Sales Engine URLs.

---

## 3. Organizations

| Method | Path                     | Notes                                       |
| ------ | ------------------------ | ------------------------------------------- |
| GET    | `/organizations`         | Memberships for current user                |
| POST   | `/organizations`         | `{ name }` — caller becomes owner           |
| GET    | `/organizations/current` | Resolved via `X-Organization-Id` or default |

---

## 4. ICP profiles

Shapes match UI `IcpProfile` / `IcpConfig` (camelCase in `config`).

**Config fields:** `profileName`, `description`, `industries[]`, `companySizes[]`, `revenueRanges[]`, `territories[]`, `decisionMakers[]`, `minMatchScore`, `autoSyncCrm`, `enrichContactDetails`, `customPrompt`

| Method | Path                           | Behavior                                  |
| ------ | ------------------------------ | ----------------------------------------- |
| GET    | `/icp-profiles`                | List for current org                      |
| GET    | `/icp-profiles/active`         | Single active or `data: null`             |
| POST   | `/icp-profiles`                | First profile auto-activates              |
| GET    | `/icp-profiles/{id}`           |                                           |
| PATCH  | `/icp-profiles/{id}`           | Partial name/description/config merge     |
| DELETE | `/icp-profiles/{id}`           | If active deleted, next profile activated |
| POST   | `/icp-profiles/{id}/activate`  | Exactly one active per org                |
| POST   | `/icp-profiles/{id}/duplicate` | Inactive copy named `{name} (Copy)`       |

**Resource example**

```json
{
    "id": "1",
    "name": "Tier-1 FMCG",
    "description": "...",
    "isActive": true,
    "leadCount": 12,
    "lastUpdated": "2026-08-30T12:00:00+00:00",
    "config": {
        "industries": ["FMCG & Retail"],
        "minMatchScore": 75,
        "autoSyncCrm": true
    }
}
```

---

## 5. Chat

Intents: `freeform` | `quick_research` | `generate_leads` | `create_outreach`

| Intent            | Behavior                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| `freeform`        | GLM chat with session history (synchronous)                                          |
| `quick_research`  | Multi-query research synthesis; **async** — poll discovery run, then reload messages |
| `generate_leads`  | Lead discovery (limit 12); **async** — poll discovery run, then reload messages      |
| `create_outreach` | Outreach draft; synchronous; `meta.outreach`                                         |

Chat sessions are scoped per **ICP profile** (`icp_profile_id` on `chat_sessions`). Use `icp_profile_id` when resolving the current session so each ICP build keeps its own transcript.

```http
POST /api/v1/chat/sessions
{ "title": "optional", "icp_profile_id": 1 }
```

```http
GET /api/v1/chat/sessions/current?icp_profile_id=1
GET /api/v1/chat/sessions/{id}/messages
DELETE /api/v1/chat/sessions/{id}/messages
POST /api/v1/chat/sessions/{id}/messages
{ "body": "Find distributors in Lagos", "intent": "generate_leads", "timezone": "Africa/Lagos" }
```

**Async intents** (`quick_research`, `generate_leads`):

- Initial response: **202** with `{ user_message, discovery_run_id, status: "processing" }` (no assistant yet)
- Poll `GET /api/v1/discovery/runs/{discovery_run_id}` until `status` is `completed` or `failed`
- Then `GET /api/v1/chat/sessions/{id}/messages` for the assistant reply
- With `QUEUE_CONNECTION=sync` (local/tests), the assistant may be included immediately with **200**

**Assistant message** may include:

```json
{
    "role": "assistant",
    "body": "...",
    "intent": "generate_leads",
    "leads": [
        {
            "id": 1,
            "name": "...",
            "source": "serper",
            "score": 82,
            "summary": "...",
            "crm_synced": false,
            "f23_lead_id": null
        }
    ],
    "meta": {
        "research": { "sub_queries": [], "sources": [] },
        "outreach": {
            "channel": "email",
            "subject": "...",
            "body": "...",
            "sent": false
        }
    }
}
```

`quick_research`, `generate_leads`, and `create_outreach` require an active ICP.

**CRM push (per lead):**

```http
POST /api/v1/leads/{id}/sync-to-crm
POST /api/v1/leads/sync-to-crm
{ "lead_ids": [1, 2, 3] }
```

---

## 6. Discovery

```http
POST /api/v1/discovery/runs
{ "query": "FMCG distributors Lagos", "intent": "generate_leads", "limit": 8 }
```

```http
GET /api/v1/discovery/runs/{id}
```

Stages example: `analyzing_brief` → `searching_sources` → `extracting` → `compiling_results`

Enabled live sources (when keyed): Serper, Mono, Fylings. Stubs (no-op until keyed/implemented): Apollo, Hunter, YouTube, X, Reddit, Meta.

---

## 7. Companies & leads

```http
GET /api/v1/companies
GET /api/v1/companies/{id}
GET /api/v1/leads?stage=new&limit=50
```

---

## 8. Metrics & outreach

```http
GET /api/v1/metrics
GET /api/v1/dashboard
```

```json
{
    "data": {
        "leads_discovered": 0,
        "companies_cached": 0,
        "qualified_leads": 0,
        "outreach_drafts": 0,
        "pipeline": {
            "new": 0,
            "contacted": 0,
            "engaged": 0,
            "qualified": 0,
            "won": 0,
            "lost": 0
        }
    }
}
```

```http
GET /api/v1/outreach/recent
POST /api/v1/outreach/draft
{ "prompt": "...", "channel": "email" }
```

WhatsApp: drafts only. `send: true` is rejected unless contact has `whatsapp_opt_in` + `whatsapp_opt_in_at`, and outbound send is not enabled in v1.

Email send (SendGrid): pass `send: true` and `to_email` on `POST /outreach/draft` when `SENDGRID_API_KEY` is configured. Replies route to the rep via `Reply-To`.

```http
GET /api/v1/outreach/sender-settings
PUT /api/v1/outreach/sender-settings
```

```json
{
    "sender_mode": "platform",
    "reply_to_email": "rep@company.com"
}
```

---

## 8. Social Listening

Requires an **active ICP** (422 otherwise).

```http
GET /api/v1/social-listening/signals?page=1&per_page=20&search=&source=&signal_type=&buying_stage=&max_age_days=
GET /api/v1/social-listening/signals/{id}
GET /api/v1/social-listening/metrics
GET /api/v1/social-listening/settings
PUT /api/v1/social-listening/settings
POST /api/v1/social-listening/runs
GET /api/v1/social-listening/runs/{id}
POST /api/v1/social-listening/signals/{id}/outreach
POST /api/v1/social-listening/signals/{id}/reminder
POST /api/v1/social-listening/signals/{id}/sync-to-crm
POST /api/v1/social-listening/signals/{id}/dismiss
```

Signals are a **personal opportunity assistant** for the viewing user, not only an SDR buying-intent feed. `signalType` extends the original sales set (`recommendation`, `switching`, `pricing`, `hiring_expansion`) with opportunity types (`investment_opportunity`, `market_signal`, `partnership_opportunity`, `competitive_move`, `funding_event`, `regulatory_change`, `other`). Enrichment is always personalized against the active ICP's `config.customPrompt` + `description` — every signal carries both the original sales fields (`suggestedMessage`, `recommendedAction`) and user-centric fields (`whyThisMattersToYou`, `benefits`, `personalRecommendedAction`).

**Freshness (always-on):** Serper searches use a time bias (`tbs`, e.g. past week/month) derived from `freshness_window_days` (settings default `14`; allowed `7|14|30`). Known post dates older than the window are discarded at ingest. Scores blend ICP relevance with a freshness factor. List sort is `score` DESC, then `posted_at` DESC (nulls last). Optional list filter: `max_age_days`. `posted_at` is the parsed post time when available (never a fake timestamp).

Signals list response:

```json
{
    "data": [
        {
            "id": 1,
            "signal": "post text",
            "summary": "Concise neutral summary of the signal.",
            "source": "LinkedIn Post",
            "sourceIcon": "in",
            "entityType": "company",
            "industry": "FMCG & Retail",
            "keyTopics": ["distribution", "logistics"],
            "competitors": ["Vendor X"],
            "followUpStrategy": "Reply within 24h referencing their stated pain point.",
            "score": 73,
            "reasons": ["Matches ICP industry", "Public post shows active need"],
            "suggestedMessage": "...",
            "recommendedAction": { "title": "Reach out soon", "detail": "..." },
            "whyThisMattersToYou": "This matches your interest in high-conviction tech investments outside your home market.",
            "benefits": ["Early access to a funding round", "Direct founder contact"],
            "personalRecommendedAction": { "title": "Review the raise", "detail": "..." }
        }
    ],
    "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1 }
}
```

**Default `intent_filters` is now `[]`** (was the 4 sales types) — an org that never touches Listen Settings gets every opportunity type, gated only by `min_score`; narrowing to a sales-only feed is still available in Listen Settings.

`recommendedAction` and `personalRecommendedAction` are always objects (`{ title, detail }`). Legacy rows created before this change populate them by splitting the old flat `recommended_action` string on an em-dash (or first sentence) — frontends should still tolerate a plain string for defensive compatibility with cached/older responses. New nullable columns (`summary`, `entityType`, `industry`, `keyTopics`, `competitors`, `followUpStrategy`, `whyThisMattersToYou`, `benefits`, `personalRecommendedAction`) may be empty/null on signals created before this change — no backfill is planned for v1.

Metrics:

```json
{
    "data": {
        "signals_detected": 0,
        "high_opportunities": 0,
        "added_to_crm": 0,
        "percent_change": 0
    }
}
```

Manual runs are async (Redis queue). Rate limit: 10 requests/hour per user on `POST /social-listening/runs`.

Social outreach: `POST .../outreach` always creates a draft; include `send: true` + `to_email` only when a recipient is known.

---

## 9. SE CRM

Stages: `new` → `contacted` → `engaged` → `qualified` → `won` | `lost`

```http
GET /api/v1/crm/pipeline
PATCH /api/v1/crm/leads/{id}
{ "stage": "qualified" }
```

---

## 10. Factory23 integration

```http
GET /api/v1/integrations/factory23/status
POST /api/v1/integrations/factory23/crm-sync
{ "enabled": true, "run": true }
```

Optional push of **qualified** SE leads to F23 CRM when `FACTORY23_CRM_SYNC_ENABLED` / org flag + `FACTORY23_API_URL` + `FACTORY23_API_TOKEN` are set.

---

## 11. Errors

Validation:

```json
{
    "message": "The given data was invalid.",
    "errors": { "email": ["The email field is required."] }
}
```

Auth: **401**. Forbidden org: **403**. Missing active ICP for discovery: **422**.

---

## 12. Clients

| Client                    | Auth                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| Standalone SE Next.js     | Native or Continue with F23                                            |
| Factory23 `/sales-engine` | Continue with F23 → SE token (see F23 `docs/SALES_ENGINE_FRONTEND.md`) |

Do not call Factory23 CRM for discovery data — discovery lives on this API.

---

## 13. Changelog

| Date       | Change                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-09-08 | Social Listening freshness: Serper `tbs`, real `posted_at`, `freshness_window_days`, score blend, list sort by score then `posted_at`, optional `max_age_days` |
| 2026-09-08 | Social Listening: personal opportunity assistant framing — expanded `signalType` taxonomy, `recommendedAction`/`personalRecommendedAction` objects, `whyThisMattersToYou`/`benefits`, `summary`/`entityType`/`industry`/`keyTopics`/`competitors`/`followUpStrategy` |
| 2026-09-02 | Chat async discovery (202 + poll), ICP-scoped sessions, clear chat history     |
| 2026-09-02 | Social Listening API, SendGrid outreach sender settings, social signal actions |
| 2026-08-31 | Agent assertion path; 401 troubleshooting; link to F23 frontend guide          |
| 2026-08-30 | Initial API contract                                                           |
