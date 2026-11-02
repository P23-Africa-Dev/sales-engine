# Sales Engine Admin — Deploy & Seed Notes

## Components

| Piece         | Path                           | Default local                              |
| ------------- | ------------------------------ | ------------------------------------------ |
| Laravel API   | `sales-engine-backend/backend` | `http://127.0.0.1:8001` (`/api/v1`)        |
| Admin Next.js | `sales-engine-backend/admin`   | `http://127.0.0.1:3001`                    |
| Client app    | separate                       | unchanged; still uses org-scoped `/api/v1` |

Admin routes live under `/api/v1/admin/*` with Sanctum PATs on `platform_admins` (not `users`).

## Backend

1. Migrate:

```bash
cd sales-engine-backend/backend
php artisan migrate
```

2. Seed the first platform admin (env or flags):

```bash
# .env
PLATFORM_ADMIN_NAME="Platform Admin"
PLATFORM_ADMIN_EMAIL=admin@example.com
PLATFORM_ADMIN_PASSWORD="choose-a-strong-password"

php artisan admin:create-platform-admin
# or:
php artisan admin:create-platform-admin --name="Ops Admin" --email=ops@example.com --password='...'
```

3. Confirm login:

```bash
curl -X POST "$API/api/v1/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}'
```

Rate limits: admin login `throttle:10,1`; bulk admin mutations are throttled (prepare-outreach, signal review, CRM archive/restore/export, social runs).

## Admin frontend

1. Env:

```bash
# sales-engine-backend/admin/.env.local
NEXT_PUBLIC_SALES_ENGINE_API_URL=https://your-api.example.com/api/v1
```

2. Install & run:

```bash
cd sales-engine-backend/admin
npm install
npm run build
# or local: npm run dev -- -p 3001
```

3. Host the Next app behind HTTPS. Store the Sanctum bearer token in `localStorage` key `se_admin_token` (same pattern as the client app).

## Operational checklist

- [ ] Run migrations including admin indexes / `platform_admins` / `admin_audit_events`
- [ ] Create at least one active platform admin per environment
- [ ] Point `NEXT_PUBLIC_SALES_ENGINE_API_URL` at the correct API base (include `/api/v1`)
- [ ] Queue workers running for social listening runs (`RunSocialListeningJob`)
- [ ] Mail/invitation configured so Account Management org create can email owners
- [ ] Confirm client `User` tokens receive `403` on `/api/v1/admin/*`
- [ ] No demo fixture banners in production UI

## Production Docker push (GitHub Actions)

Deploy workflow: `.github/workflows/deploy-sales-engine-api.yml`  
Image: `registry.digitalocean.com/factory-reg/sales-engine-api`  
Secret: `DO_ACCESS_TOKEN` (must be a PAT for the **P23 Africa** team that owns `factory-reg`)

If build succeeds but push fails with:

```text
403 Forbidden … /v2/registry/auth … "You are not allowed to perform this operation"
```

check the DigitalOcean team status first (not the Dockerfile):

```bash
doctl auth switch --context factory-new   # or your P23 Africa context
doctl account get
```

A `Status: locked` with a payment / improper-use message means **registry pull/push is blocked until the team is unlocked**. Fix:

1. Sign in as `toukafernande2020@gmail.com` (P23 Africa) → Billing → settle any unpaid invoice
2. If still locked, open a DigitalOcean support ticket asking to unlock the team
3. Confirm `doctl account get` shows `active`, then re-run the deploy workflow

Do not rotate `DO_ACCESS_TOKEN` hoping to fix a locked-team 403 — a valid token on a locked team still cannot push.

## Out of scope (v1)

- Admin impersonation into the client app
- Admin outbound message composer
- Duplicate CRM merge
- Full Settings product page (stub only)
