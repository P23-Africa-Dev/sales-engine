# Frontend Integration Contract

> **Living document.** Fill endpoint rows as the Sales Engine backend implementation plan ships them.  
> Both the standalone Sales Engine frontend and the Factory23 embedded Sales Engine UI should use this file as the source of truth for API wiring.

---

## 1. Environments

| Environment | Base URL                | Notes                           |
| ----------- | ----------------------- | ------------------------------- |
| Local       | `http://127.0.0.1:8001` | `php artisan serve --port=8001` |
| Staging     | _TBD_                   |                                 |
| Production  | _TBD_                   |                                 |

API prefix for all JSON routes: **`/api/v1`**

Example health check:

```http
GET /api/v1/health
```

```json
{ "status": "ok", "service": "sales-engine" }
```

Laravel also exposes `GET /up` as framework health (not product-specific).

---

## 2. Auth model (planned — not implemented yet)

### 2.1 Native Sales Engine signup / login

- Email + password against this API
- Response issues a **Sanctum personal access token**
- Frontend sends: `Authorization: Bearer {token}`

### 2.2 Continue with Factory23

- Used when opening SE inside Factory23 (first visit) or from standalone “Continue with Factory23”
- Factory23 issues a short-lived assertion → this API verifies → creates/links SE user + org → returns **SE** Sanctum token
- After linking, both UIs use the **SE token** for Sales Engine APIs

### 2.3 Headers (planned)

| Header                       | Required                   | Description                                                |
| ---------------------------- | -------------------------- | ---------------------------------------------------------- |
| `Authorization`              | Yes (except health/public) | `Bearer {sanctum_token}`                                   |
| `Accept`                     | Yes                        | `application/json`                                         |
| `Content-Type`               | On writes                  | `application/json`                                         |
| Organization / tenant header | TBD                        | May be path/query `organization_id` — decide in logic plan |

---

## 3. Clients that will call this API

| Client                                 | How it authenticates                    |
| -------------------------------------- | --------------------------------------- |
| Standalone SE Next.js app              | Native login or Continue with Factory23 |
| Factory23 Next.js `/sales-engine` page | Continue with Factory23 (preferred)     |

Neither client should call Factory23 CRM APIs for Sales Engine discovery data. Discovery lives here.

---

## 4. Error format (Laravel JSON convention)

Typical validation error:

```json
{
    "message": "The given data was invalid.",
    "errors": {
        "email": ["The email field is required."]
    }
}
```

Unauthenticated: HTTP `401`. Forbidden: HTTP `403`. Not found: HTTP `404`.

Exact envelope may be normalized in the logic plan — update this section when finalized.

---

## 5. Endpoint inventory

Fill as features are implemented. Leave blank until ready.

### 5.1 System

| Method | Path             | Auth | Status   | Description    |
| ------ | ---------------- | ---- | -------- | -------------- |
| GET    | `/api/v1/health` | No   | **Live** | Service health |

### 5.2 Auth

| Method | Path | Auth | Status  | Description                        |
| ------ | ---- | ---- | ------- | ---------------------------------- |
|        |      |      | Planned | Register                           |
|        |      |      | Planned | Login                              |
|        |      |      | Planned | Logout / revoke token              |
|        |      |      | Planned | Continue with Factory23 (exchange) |
|        |      |      | Planned | Me / current user                  |

### 5.3 Organizations

| Method | Path | Auth | Status  | Description                |
| ------ | ---- | ---- | ------- | -------------------------- |
|        |      |      | Planned | List / create / switch org |

### 5.4 ICP

| Method | Path | Auth | Status  | Description                    |
| ------ | ---- | ---- | ------- | ------------------------------ |
|        |      |      | Planned | List ICP profiles              |
|        |      |      | Planned | Create / update / activate ICP |

### 5.5 Discovery / Research

| Method | Path | Auth | Status  | Description                   |
| ------ | ---- | ---- | ------- | ----------------------------- |
|        |      |      | Planned | Run discovery / chat research |
|        |      |      | Planned | Job status / results          |

### 5.6 Companies / Leads (SE CRM)

| Method | Path | Auth | Status  | Description                  |
| ------ | ---- | ---- | ------- | ---------------------------- |
|        |      |      | Planned | List / get companies & leads |
|        |      |      | Planned | Pipeline stage updates       |

### 5.7 Outreach

| Method | Path | Auth | Status  | Description                 |
| ------ | ---- | ---- | ------- | --------------------------- |
|        |      |      | Planned | Sequences / send / activity |

### 5.8 Factory23 CRM Sync

| Method | Path | Auth | Status  | Description             |
| ------ | ---- | ---- | ------- | ----------------------- |
|        |      |      | Planned | Enable / disable sync   |
|        |      |      | Planned | Sync status / conflicts |

---

## 6. CORS (planned)

Local origins expected later:

- `http://localhost:3000`
- `http://127.0.0.1:3000`

Configure via `CORS_ALLOWED_ORIGINS` in `.env` when middleware is wired.

---

## 7. Changelog

| Date       | Change                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-08-30 | Scaffold created. Health endpoint only. Auth and product APIs not implemented. |
