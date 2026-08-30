# Sales Engine API

Independent Laravel backend for **P23 Africa Sales Engine**.

This repository is **separate from Factory23**. Both the future standalone Sales Engine frontend and the Sales Engine UI embedded inside Factory23 will call **this** API and share this database. Factory23 keeps its own backend/database; connection is via future auth linking and optional CRM sync — not a shared app DB.

## Stack

- PHP 8.3+ / Laravel 13
- Laravel Sanctum (API tokens)
- MySQL
- Redis client prepared (Predis) for future queues

## Local setup

```bash
# From this directory
cp .env.example .env
php artisan key:generate

# Create MySQL database `sales_engine` in XAMPP (or your MySQL), then:
php artisan migrate

# Run API on port 8001 (avoids clash with Factory23 on 8000)
php artisan serve --port=8001
```

Health check:

```bash
curl http://127.0.0.1:8001/api/v1/health
```

Expected:

```json
{"status":"ok","service":"sales-engine"}
```

## Documentation

| File | Purpose |
|------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product/architecture decisions |
| [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) | Living API contract for frontend wiring (fill as endpoints are built) |

## Current status

**Installation & scaffold only.** Domain service folders exist as stubs. Product APIs (ICP, discovery, scoring, outreach, CRM sync) are **not** implemented yet — that is the next backend plan.

## Relation to Factory23

```
Standalone SE UI (later) ──┐
                           ├──► sales-engine-backend (this repo) ──► SE MySQL
Factory23 SE page (later) ─┘         ╎
                                     ╎ future auth + optional CRM sync
                                     ▼
                              Factory23 backend
```
