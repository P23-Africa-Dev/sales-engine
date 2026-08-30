# Sales Engine Architecture

## Purpose

Sales Engine is an independent B2B lead discovery + qualification + compliant outreach product (P23 Africa). It has its **own** Laravel API and MySQL database.

## Clients (future)

| Client                             | Repo                          | Talks to                           |
| ---------------------------------- | ----------------------------- | ---------------------------------- |
| Standalone Sales Engine UI         | Separate frontend (TBD)       | This API                           |
| Factory23 embedded `/sales-engine` | `factory23 fullstack`         | This API                           |
| Factory23 core CRM / agents        | `factory23 fullstack` backend | Own F23 API; optional sync with SE |

Both Sales Engine UIs share **this** backend and database so data is not lost when switching surfaces.

## Dual-plane discovery (design)

```text
ICP Brief
   │
   ├─ Plane A: Account discovery
   │    Structured DBs → Registries (Africa) → Web extract
   │
   └─ Plane B: Intent / signals
        Search / News / YouTube / X / Reddit / LinkedIn index
   │
   ▼
Company Cache → Enrichment waterfall → Score → Outreach → SE CRM
   │
   └─ optional sync → Factory23 CRM
```

Social platforms are **intent / enrichment**, not the foundation of the product. Do not build the core as LinkedIn/Instagram scrapers.

## Auth (planned)

1. **Native** — SE email/password → Sanctum token
2. **Continue with Factory23** — short-lived F23 assertion → link/create SE user → SE Sanctum token

Factory23 Sanctum tokens are **not** reused as long-lived SE sessions.

## CRM sync (planned, optional)

Off by default. Event-driven sync with stable IDs on both sides — not a shared database merge.

## What this repo is now

Installation + folder scaffold only. See `app/Services/*/README.md` for domain ownership. Product logic lands in the next implementation plan.

## Frontend contract

See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) — living document for API base URL, auth headers, and endpoint inventory as features ship.
