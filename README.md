# Sales Engine API

Independent Laravel backend for **P23 Africa Sales Engine**.

This repository is **separate from Factory23**. Both the future standalone Sales Engine frontend and the Sales Engine UI embedded inside Factory23 will call **this** API and share this database. Factory23 keeps its own backend/database; connection is via future auth linking and optional CRM sync — not a shared app DB.

## Stack

- PHP 8.3+ / Laravel 13
- Laravel Sanctum (API tokens)
- MySQL
- Redis (Predis) for cache/queue/session in production

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
{ "status": "ok", "service": "sales-engine" }
```

## Production

| Item       | Value                                                           |
| ---------- | --------------------------------------------------------------- |
| Public API | https://api.salesengine.thefactory23.com                        |
| Health     | https://api.salesengine.thefactory23.com/api/v1/health          |
| Deploy     | Push to `main` → GitHub Actions → DOKS namespace `sales-engine` |

Full runbook (DNS, MySQL, secrets, Cloudflare, first cutover): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

## Documentation

| File                                                         | Purpose                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Product/architecture decisions          |
| [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) | Living API contract for frontend wiring |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                     | Production deploy + CI prerequisites    |

## Current status

Scaffold + **production deploy/CI** ready. Domain service folders exist as stubs. Product APIs (ICP, discovery, scoring, outreach, CRM sync) are **not** implemented yet — that is the next backend plan.

## Relation to Factory23

```
Standalone SE UI (later) ──┐
                           ├──► sales-engine-backend (this repo) ──► SE MySQL
Factory23 SE page (later) ─┘         ╎
                                     ╎ future auth + optional CRM sync
                                     ▼
                              Factory23 backend
```
