# Sales Engine — Factory23 frontend integration guide

For developers wiring the **Sales Engine page inside Factory23** (`/sales-engine`) to the **Sales Engine API** (`api.salesengine.thefactory23.com`).

**API contract (all endpoints):** [`sales-engine-backend/docs/FRONTEND_INTEGRATION.md`](../../sales-engine-backend/docs/FRONTEND_INTEGRATION.md)

---

## Critical rule: two APIs, two tokens

| API          | Base URL                                                                               | Token                                 |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------- |
| Factory23    | `NEXT_PUBLIC_API_BASE_URL` → `https://api.thefactory23.com/api/v1`                     | F23 Sanctum token (login)             |
| Sales Engine | `NEXT_PUBLIC_SALES_ENGINE_API_URL` → `https://api.salesengine.thefactory23.com/api/v1` | **SE Sanctum token** (after exchange) |

**Do not** send the Factory23 `Bearer 539|…` token to Sales Engine. That token only exists in the Factory23 database. Sales Engine will always return **401** for it on protected routes like `/icp-profiles`.

Factory23 calls (CRM, map, agents, notifications) → F23 token.  
Sales Engine calls (ICP, discovery, chat, metrics) → **SE token**.

---

## Auth flow: Continue with Factory23

Run this **once per session** (or when SE token is missing / expired) before any Sales Engine API call.

### Step 1 — Get assertion from Factory23

**Management users** (owner / admin / supervisor):

```http
POST https://api.thefactory23.com/api/v1/admin/sales-engine/assertion
Authorization: Bearer {FACTORY23_TOKEN}
Content-Type: application/json

{ "company_id": 12 }
```

**Agent users:**

```http
POST https://api.thefactory23.com/api/v1/agent/sales-engine/assertion
Authorization: Bearer {FACTORY23_TOKEN}
Content-Type: application/json

{ "company_id": 12 }
```

`company_id` is optional if the user has a single active company context; pass the same `company_id` you use for other F23 API calls when the user can switch companies.

**200 response (F23 envelope):**

```json
{
  "success": true,
  "message": "Sales Engine assertion issued.",
  "data": {
    "assertion": "<JWT>",
    "expires_in": 60,
    "exchange_url": "https://api.salesengine.thefactory23.com/api/v1/auth/factory23/exchange"
  },
  "errors": null
}
```

**503** → `SALES_ENGINE_JWT_SECRET` is not set on Factory23 backend (ops must fix).  
**401** → invalid or expired F23 token.

### Step 2 — Exchange assertion on Sales Engine

```http
POST https://api.salesengine.thefactory23.com/api/v1/auth/factory23/exchange
Content-Type: application/json
Accept: application/json

{ "assertion": "<JWT from step 1>" }
```

**200 response:**

```json
{
  "token": "1|…",
  "token_type": "Bearer",
  "user": { … },
  "organization": { "id": 1, "name": "…", … }
}
```

Store separately from the F23 token:

- `sales_engine_token` → `token`
- `sales_engine_org_id` → `organization.id`

A small helper already exists at `lib/sales-engine/session.ts` (`SALES_ENGINE_TOKEN_KEY`, `SALES_ENGINE_ORG_ID_KEY`).

**API client:** `lib/api/sales-engine.ts` implements `ensureSalesEngineSession()`, `seRequest` (via internal helpers), and ICP CRUD (`fetchIcpProfiles`, `createIcpProfile`, etc.). Wire Sales Engine UI components to these functions — do not call SE URLs with `apiRequest()` from `lib/api/onboarding.ts`.

### Step 3 — Call Sales Engine with SE token

Example — create ICP profile:

```http
POST https://api.salesengine.thefactory23.com/api/v1/icp-profiles
Authorization: Bearer {SALES_ENGINE_TOKEN}
Accept: application/json
Content-Type: application/json
X-Organization-Id: {sales_engine_org_id}

{
  "name": "Tier-1 FMCG Distributors",
  "description": "…",
  "config": {
    "profileName": "Tier-1 FMCG Distributors",
    "industries": ["FMCG & Retail"],
    "companySizes": ["51-200"],
    "revenueRanges": ["$1M - $10M"],
    "territories": ["Lagos, NG"],
    "decisionMakers": ["Head of Sales"],
    "minMatchScore": 75,
    "autoSyncCrm": true,
    "enrichContactDetails": true,
    "customPrompt": ""
  }
}
```

List profiles:

```http
GET https://api.salesengine.thefactory23.com/api/v1/icp-profiles
Authorization: Bearer {SALES_ENGINE_TOKEN}
X-Organization-Id: {sales_engine_org_id}
```

---

## Environment variables (Next.js)

Add to `.env.local` (see `.env.local.example`):

```env
# Factory23 API (existing)
NEXT_PUBLIC_API_BASE_URL=https://api.thefactory23.com/api/v1

# Sales Engine API — separate host, separate auth
NEXT_PUBLIC_SALES_ENGINE_API_URL=https://api.salesengine.thefactory23.com/api/v1
```

Local Sales Engine (if running `php artisan serve --port=8001`):

```env
NEXT_PUBLIC_SALES_ENGINE_API_URL=http://127.0.0.1:8001/api/v1
```

---

## Recommended client pattern

Use `lib/api/sales-engine.ts`:

1. Before ICP / discovery calls: `await ensureSalesEngineSession()` (assertion on F23 → exchange on SE).
2. ICP: `refreshSalesEngineProfiles()`, `createIcpProfile()`, etc. — these use `NEXT_PUBLIC_SALES_ENGINE_API_URL` + SE token + `X-Organization-Id`.
3. **Never** pass F23 token to Sales Engine URLs.
4. On SE **401**: `refreshSalesEngineProfiles()` already clears session and re-exchanges; follow the same pattern for new endpoints.
5. Assertion TTL is **60 seconds** — exchange immediately after receiving the JWT.

---

## Troubleshooting

| Symptom                                    | Cause                                           | Fix                                                                                        |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **401** on `/icp-profiles` with F23 token  | Wrong token on wrong API                        | Use SE token from exchange                                                                 |
| **503** on `/admin/sales-engine/assertion` | `SALES_ENGINE_JWT_SECRET` missing on F23        | Ops: set secret, restart backend                                                           |
| **401** on `/auth/factory23/exchange`      | JWT secret mismatch or expired assertion        | Re-issue assertion; verify F23 + SE secrets match                                          |
| **403** on assertion                       | User not management (use `/agent/…` for agents) | Pick correct assertion path                                                                |
| CORS errors from `localhost:3000`          | SE CORS not allowing origin                     | SE `CORS_ALLOWED_ORIGINS` includes `http://localhost:3000` (already set in prod configmap) |

---

## Ops checklist (production)

Before frontend integration works end-to-end:

1. **Factory23** `factory23-secret`: `SALES_ENGINE_JWT_SECRET` = same value as Sales Engine `FACTORY23_JWT_SECRET`.
2. **Factory23** `factory23-config`: `SALES_ENGINE_API_URL=https://api.salesengine.thefactory23.com`.
3. Apply secrets + rollout restart F23 backend after secret change.
4. Verify assertion:

```bash
curl -s -X POST "https://api.thefactory23.com/api/v1/admin/sales-engine/assertion" \
  -H "Authorization: Bearer {F23_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"company_id":12}'
```

---

## Changelog

| Date       | Notes                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 2026-08-31 | Initial guide: dual-token auth, assertion paths (admin + agent), ICP example, 401 troubleshooting |
