# Environment setup — Sales Engine API

Step-by-step keys for local and DigitalOcean Kubernetes (`sales-engine` namespace).

---

## 1. Core app (always)

| Variable | Where | Notes |
| -------- | ----- | ----- |
| `APP_KEY` | Secret | `php artisan key:generate --show` |
| `APP_URL` | ConfigMap | `https://api.salesengine.thefactory23.com` |
| `DB_*` | ConfigMap + Secret password | Managed MySQL DB `sales_engine` |
| `REDIS_*` | ConfigMap | In-cluster `redis-service` |

---

## 2. GLM (chat / extract / score / outreach)

1. Create a Zhipu / BigModel account: https://open.bigmodel.cn
2. Create an API key.
3. Set:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `GLM_API_KEY` | — | Required for LLM features |
| `GLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | |
| `GLM_CHAT_MODEL` | `glm-4-flash` | Chat narration |
| `GLM_EXTRACT_MODEL` | `glm-4-flash` | Snippet → company JSON |
| `GLM_SCORE_MODEL` | `glm-4-air` | ICP fit scores |
| `GLM_OUTREACH_MODEL` | `glm-4-flash` | Drafts |

Without `GLM_API_KEY`, discovery still works with heuristic extract/score; freeform chat is limited.

---

## 3. Serper (web discovery)

1. Sign up: https://serper.dev
2. Copy API key.
3. Set `SERPER_API_KEY` (optional `SERPER_BASE_URL=https://google.serper.dev`).

Primary live discovery source for v1.

---

## 4. Registries (optional)

### Mono (Nigeria CAC)

1. Mono dashboard → get secret key.
2. `MONO_SECRET_KEY`, optional `MONO_BASE_URL=https://api.withmono.com`.

### Fylings (multi-country registry)

1. Obtain API key from Fylings.
2. `FYLINGS_API_KEY`, optional `FYLINGS_BASE_URL`.

If missing, adapters stay disabled; product still runs on Serper + GLM.

---

## 5. Continue with Factory23 (shared secret)

Generate a long random secret (e.g. `openssl rand -hex 32`).

| App | Variable |
| --- | -------- |
| Sales Engine | `FACTORY23_JWT_SECRET` |
| Factory23 | `SALES_ENGINE_JWT_SECRET` (or `FACTORY23_JWT_SECRET`) |

Also on SE:

| Variable | Purpose |
| -------- | ------- |
| `FACTORY23_API_URL` | Base for CRM push / docs (`https://api.thefactory23.com`) |
| `FACTORY23_API_TOKEN` | Sanctum/token for optional CRM push |
| `FACTORY23_CRM_SYNC_ENABLED` | `true`/`false` global gate |

On Factory23:

| Variable | Purpose |
| -------- | ------- |
| `SALES_ENGINE_API_URL` | Default `https://api.salesengine.thefactory23.com` |

Assertion issuer: `POST /api/v1/admin/sales-engine/assertion` (management auth).

---

## 6. Stub providers (optional — disabled until keyed)

| Variable | Adapter |
| -------- | ------- |
| `APOLLO_API_KEY` | Apollo |
| `HUNTER_API_KEY` | Hunter |
| `YOUTUBE_API_KEY` | YouTube |
| `X_BEARER_TOKEN` | X |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | Reddit |
| `META_ACCESS_TOKEN` / `META_APP_ID` / `META_APP_SECRET` | Meta Pages |

Stubs implement the interface but return empty hits until full integration.

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
- stub keys as needed

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
