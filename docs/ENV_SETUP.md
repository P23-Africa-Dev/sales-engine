# Environment setup — Sales Engine API

Step-by-step keys for local and DigitalOcean Kubernetes (`sales-engine` namespace).

---

## 1. Core app (always)

| Variable  | Where                       | Notes                                      |
| --------- | --------------------------- | ------------------------------------------ |
| `APP_KEY` | Secret                      | `php artisan key:generate --show`          |
| `APP_URL` | ConfigMap                   | `https://api.salesengine.thefactory23.com` |
| `DB_*`    | ConfigMap + Secret password | Managed MySQL DB `sales_engine`            |
| `REDIS_*` | ConfigMap                   | In-cluster `redis-service`                 |

---

## 2. GLM (chat / extract / score / outreach)

1. Create a Z.AI international account: https://z.ai
2. Create an API key (the China `open.bigmodel.cn` key will not work on this endpoint).
3. Set:

| Variable             | Default                        | Purpose                   |
| -------------------- | ------------------------------ | ------------------------- |
| `GLM_API_KEY`        | —                              | Required for LLM features |
| `GLM_BASE_URL`       | `https://api.z.ai/api/paas/v4` | International endpoint    |
| `GLM_CHAT_MODEL`     | `glm-5.2`                      | Free chat                 |
| `GLM_RESEARCH_MODEL` | `glm-5.2`                      | Quick research brief      |
| `GLM_EXTRACT_MODEL`  | `glm-5`                        | Lead generation extract   |
| `GLM_SCORE_MODEL`    | `glm-5.1`                      | Lead fit scores           |
| `GLM_OUTREACH_MODEL` | `glm-5.2`                      | Outreach drafts           |

Without `GLM_API_KEY`, discovery still works with heuristic extract/score; freeform chat is limited.

---

## 3. Serper (web discovery)

1. Sign up: https://serper.dev
2. Copy API key.
3. Set `SERPER_API_KEY` (optional `SERPER_BASE_URL=https://google.serper.dev`).
4. Set `SERPER_MAX_RESULTS=20` (ConfigMap default). Free Serper accounts may reject `num≥20` on complex queries — the adapter retries with `num≤10` automatically.

Primary live discovery source for v1.

---

## 4. Registries + freemium company discovery

### Mono (Nigeria CAC)

1. Mono dashboard → get secret key.
2. `MONO_SECRET_KEY`, optional `MONO_BASE_URL=https://api.withmono.com`.

### Fylings (multi-country registry)

1. Obtain API key from Fylings (free plan: 100 requests/month): https://www.fylings.com/api
2. `FYLINGS_API_KEY`, optional `FYLINGS_BASE_URL`.

Orchestrator calls Fylings **once per collectHits** (primary query only), not once per Serper fan-out variation, to protect monthly quota.

### Hunter Discover (free company search)

1. Sign up: https://hunter.io — copy API key from Account → API.
2. Set `HUNTER_API_KEY`.
3. Discovery uses **Discover only** (`POST /v2/discover`) — does **not** burn Domain Search / Email Finder credits.
4. Apollo remains enrichment-only for freemium (organization search not wired for discovery).

If Mono/Fylings/Hunter keys are missing, adapters stay disabled; product still runs on Serper + GLM.

---

## 5. Continue with Factory23 (shared secret)

Generate a long random secret (e.g. `openssl rand -hex 32`).

| App          | Variable                                              |
| ------------ | ----------------------------------------------------- |
| Sales Engine | `FACTORY23_JWT_SECRET`                                |
| Factory23    | `SALES_ENGINE_JWT_SECRET` (or `FACTORY23_JWT_SECRET`) |

Also on SE:

| Variable                     | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `FACTORY23_API_URL`          | Base for CRM push / docs (`https://api.thefactory23.com`) |
| `FACTORY23_API_TOKEN`        | Sanctum/token for optional CRM push                       |
| `FACTORY23_CRM_SYNC_ENABLED` | `true`/`false` global gate                                |

On Factory23:

| Variable                  | Purpose                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `SALES_ENGINE_API_URL`    | Default `https://api.salesengine.thefactory23.com` (in `factory23-config` ConfigMap) |
| `SALES_ENGINE_JWT_SECRET` | **Required in `factory23-secret`** — same value as SE `FACTORY23_JWT_SECRET`         |

Assertion endpoints:

- Management: `POST /api/v1/admin/sales-engine/assertion`
- Agents: `POST /api/v1/agent/sales-engine/assertion`

After updating `factory23-secret`:

```bash
kubectl apply -f k8s/secret.yaml -n factory23
kubectl rollout restart deployment/backend deployment/queue-worker deployment/scheduler -n factory23
```

Frontend guide: `factory23 fullstack/docs/SALES_ENGINE_FRONTEND.md`.

## 6. Contact enrichment (tiered) + stub providers

Contact enrichment runs as a cost waterfall during lead profile enrichment:

1. **Tier 1 (free)** — Serper snippets + GLM extract email/phone when present in public text (no extra keys).
2. **Tier 2 (free/low-cost)** — Bytemine, then Cleanlist, when Tier 1 is incomplete.
3. **Tier 3 (paid fallback)** — Apollo, then Hunter, only for remaining gaps.

| Variable                                                          | Adapter / role                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `BYTEMINE_API_KEY` / `BYTEMINE_BASE_URL`                          | Tier 2 contact enricher (recommended)                                                 |
| `CLEANLIST_API_KEY` / `CLEANLIST_BASE_URL`                        | Tier 2 fallback enricher                                                              |
| `APOLLO_API_KEY`                                                  | Tier 3 Apollo person enricher (not used for freemium discovery)                       |
| `HUNTER_API_KEY`                                                  | Discovery: Hunter Discover (free). Enrichment: Domain Search / Email Finder (credits) |
| `YOUTUBE_API_KEY`                                                 | YouTube discovery (stub until keyed)                                                  |
| `X_BEARER_TOKEN`                                                  | X discovery (stub until keyed)                                                        |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | Reddit discovery (stub until keyed)                                                   |
| `META_ACCESS_TOKEN` / `META_APP_ID` / `META_APP_SECRET`           | Meta Pages social listening                                                           |

### Tier 2 signup tips

- **Bytemine**: https://www.bytemine.ai/ — free monthly credits on starter plans; set `BYTEMINE_API_KEY`.
- **Cleanlist**: https://www.cleanlist.ai/ — free monthly credits; set `CLEANLIST_API_KEY`.

Usage per attempt is written to `enrichment_logs` (tier, provider, found email/phone, credits).

Discovery stubs implement the interface but return empty hits until full integration.

---

## 7. Kubernetes mapping

**ConfigMap** `sales-engine-config` (`k8s/configmap.yaml`): non-secret URLs, DB host, model names, feature flags.

**Secret** `sales-engine-secret` (`k8s/secret.example.yaml` → apply as `secret.yaml`, never commit):

- `APP_KEY`
- `DB_PASSWORD`
- `REDIS_PASSWORD` (often `""`)
- `GLM_API_KEY`
- `SERPER_API_KEY`
- `MONO_SECRET_KEY` (optional)
- `FYLINGS_API_KEY` (optional)
- `FACTORY23_JWT_SECRET`
- `FACTORY23_API_TOKEN` (optional)
- `BYTEMINE_API_KEY` / `CLEANLIST_API_KEY` (optional Tier 2 enrichment)
- stub keys as needed (`APOLLO_API_KEY`, `HUNTER_API_KEY`, Meta, etc.)

After updating secrets:

```bash
kubectl apply -f k8s/secret.yaml -n sales-engine
kubectl rollout restart deployment/sales-engine-api -n sales-engine
```

---

## 8. Local `.env` checklist

Copy `.env.example` → `.env`, then set at minimum:

```env
APP_KEY=base64:...
DB_DATABASE=sales_engine
GLM_API_KEY=...
SERPER_API_KEY=...
FACTORY23_JWT_SECRET=...
FACTORY23_API_URL=http://127.0.0.1:8000
```

```bash
php artisan migrate
php artisan serve --port=8001
curl http://127.0.0.1:8001/api/v1/health
```

---

## 9. Production smoke (after secrets)

```bash
curl -s https://api.salesengine.thefactory23.com/api/v1/health
# Register or login, then:
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  https://api.salesengine.thefactory23.com/api/v1/icp-profiles
```

---

## 10. SendGrid outreach (webhook + domain authentication)

`SENDGRID_API_KEY` and `SENDGRID_PLATFORM_FROM_EMAIL` must already be set (Secret + ConfigMap respectively) before this step.

1. Run the one-time setup command against the environment whose API key is configured (it hits SendGrid's API, not the local DB):

    ```bash
    php artisan outreach:setup-sendgrid https://api.salesengine.thefactory23.com/api/v1/webhooks/sendgrid
    ```

2. It prints `SENDGRID_WEBHOOK_PUBLIC_KEY` and `SENDGRID_UNSUBSCRIBE_GROUP_ID`. Put the public key in `k8s/secret.yaml` and the group id in `k8s/configmap.yaml`, then:

    ```bash
    kubectl apply -f k8s/configmap.yaml -n sales-engine
    kubectl apply -f k8s/secret.yaml -n sales-engine
    kubectl rollout restart deployment/sales-engine-api -n sales-engine
    ```

3. **Organization ("send as my own domain") sending** requires no extra env vars — an org authenticates their own domain from the Sales Engine UI (Outreach settings → Email sender → Connect your domain). That flow calls SendGrid's Domain Authentication API directly per-organization; there is nothing to configure here beyond the API key already set above.

    After SendGrid DNS validates, Sales Engine also runs a **domain integrity checklist** (business domain, DMARC, MX). Organization sending is blocked until integrity is `pass` or `warn` **and** at least one inbox on that domain is confirmed via email code. Leave the customer’s MX and provider SPF/DKIM unchanged. Daily recheck: `php artisan outreach:recheck-domain-integrity` (scheduled at 04:00).

4. **Send quotas** (optional env overrides in `config/outreach.php` / `k8s/configmap.yaml`):
    - `OUTREACH_PLATFORM_DAILY_CAP` (default 30) — shared platform From fallback
    - `OUTREACH_ORG_WARMUP_START` (default 50)
    - `OUTREACH_ORG_DAILY_CEILING` (default 500)
    - `OUTREACH_SMS_DAILY_CAP` (default 20) — Infobip SMS, separate from email

    SMS uses one shared Infobip account. Secret: `INFOBIP_API_KEY` (Developer tools → API keys, SMS scope) and `INFOBIP_SMS_WEBHOOK_TOKEN` (a random string we generate). ConfigMap: `INFOBIP_BASE_URL` (portal base URL) and `INFOBIP_SMS_FROM` (Channels → SMS → Senders, after approval).

    Organization domain sending is recommended. Platform From remains available (Reply-To = user email) until an org finishes domain + inbox setup. Org caps are per organization domain, not per inbox.

5. Prospect outreach is **queued** (`SendOutreachEmailJob`). Ensure a queue worker is running (`php artisan queue:work`).

6. Re-running `outreach:setup-sendgrid` is safe — it reuses the existing ASM group and re-points the Event Webhook URL if it changed.
