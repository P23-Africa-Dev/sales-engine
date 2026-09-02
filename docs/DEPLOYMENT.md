# Sales Engine API — Production Deployment

## Target

| Item          | Value                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| Public API    | `https://api.salesengine.thefactory23.com`                                   |
| Health        | `https://api.salesengine.thefactory23.com/api/v1/health`                     |
| GitHub repo   | `P23-Africa-Dev/sales-engine`                                                |
| Cluster       | DigitalOcean DOKS `8236d5b0-a49e-4ed8-9310-b432b7e3e2d2` (same as Factory23) |
| Namespace     | `sales-engine`                                                               |
| Image         | `registry.digitalocean.com/con-reg/sales-engine-api`                         |
| LB IP (DNS A) | `157.245.28.86`                                                              |

Factory23 stays in namespace `factory23` on host `api.thefactory23.com`. This app does **not** share that namespace.

## How deploy works

On every push to `main` (or manual **Actions → Deploy to Production → Run workflow**):

1. **Test** — Composer install, migrate against ephemeral MySQL, syntax check
2. **Build** — Docker image → DigitalOcean Container Registry
3. **Deploy** — `kubectl` apply ConfigMap/Redis/Ingress/Certificate, migrate Job, rolling backend, in-cluster health smoke

Workflow file: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

## Prerequisites (one-time — you must do these)

### 1. GitHub Actions secret

In **GitHub → `P23-Africa-Dev/sales-engine` → Settings → Secrets and variables → Actions**:

| Secret            | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| `DO_ACCESS_TOKEN` | Same DigitalOcean personal access token used by Factory23 deploy |

Optional: `COMPOSER_GITHUB_TOKEN` if anonymous Composer hits rate limits (defaults to `GITHUB_TOKEN`).

### 2. Managed MySQL database

On the **same** DigitalOcean Managed MySQL used by Factory23 (or another DO MySQL reachable from DOKS):

1. Create database: `sales_engine`
2. Create user: `sales_engine_user` with a strong password
3. Grant that user full access to `sales_engine`
4. Ensure trusted sources include the DOKS cluster / VPC (same as Factory23)

Non-secret host/user/db name are in [`k8s/configmap.yaml`](../k8s/configmap.yaml). Update `DB_HOST` / `DB_USERNAME` there if yours differ.

### 3. DNS / Cloudflare

- A record: `api.salesengine.thefactory23.com` → `157.245.28.86` (already verified)
- For **first** Let's Encrypt issuance, prefer **DNS only (grey cloud)**. After cert is Ready, you may orange-cloud with SSL mode **Full (strict)**.
- If Certificate stays Pending: temporarily grey-cloud, delete the Certificate/Order, re-apply or re-run deploy.

### 4. Cluster Secret (`sales-engine-secret`)

Deploy will **fail** until this secret exists. Never commit real secrets.

```bash
# Locally (with doctl + kubectl pointed at the DOKS cluster)
cd sales-engine-backend

# Generate APP_KEY
php artisan key:generate --show

cp k8s/secret.example.yaml k8s/secret.yaml
# Edit k8s/secret.yaml:
#   APP_KEY: base64:...
#   DB_PASSWORD: <password for sales_engine_user>

# One-shot helper (namespace + secret + do-registry pull secret):
export DO_ACCESS_TOKEN=dop_v1_...
chmod +x scripts/bootstrap-cluster.sh
./scripts/bootstrap-cluster.sh
```

Or apply manually:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
```

`k8s/secret.yaml` is gitignored.

### 5. Registry pull secret

The deploy workflow creates/refreshes `do-registry` in the namespace automatically using `DO_ACCESS_TOKEN`. No manual step required on later deploys.

## First production cutover checklist

1. [ ] Add `DO_ACCESS_TOKEN` to GitHub repo secrets
2. [ ] Create MySQL `sales_engine` + `sales_engine_user`
3. [ ] Confirm DNS A record → `157.245.28.86`
4. [ ] Apply `namespace` + `sales-engine-secret` (step 4 above)
5. [ ] Push deploy manifests to `main` (or run workflow_dispatch)
6. [ ] Wait for Actions green
7. [ ] `kubectl get certificate -n sales-engine` → Ready=True
8. [ ] `curl https://api.salesengine.thefactory23.com/api/v1/health`
9. [ ] `kubectl get pods -n sales-engine` — `queue-worker` and `scheduler` Running
10. [ ] Add `SENDGRID_API_KEY` to `sales-engine-secret` for email outreach send
11. [ ] Confirm Factory23 `https://api.thefactory23.com` still healthy

## Useful kubectl commands

```bash
doctl kubernetes cluster kubeconfig save 8236d5b0-a49e-4ed8-9310-b432b7e3e2d2

kubectl get pods,svc,ingress,certificate -n sales-engine
kubectl logs -n sales-engine deploy/backend -c nginx --tail=100
kubectl logs -n sales-engine deploy/backend -c php-fpm --tail=100
kubectl describe certificate api-salesengine-thefactory23-com-tls -n sales-engine

# Cert stuck — reset after greying Cloudflare
kubectl delete certificate api-salesengine-thefactory23-com-tls -n sales-engine
kubectl apply -f k8s/certificate.yaml -n sales-engine
```

## Manifest map

| File                          | Role                 |
| ----------------------------- | -------------------- |
| `k8s/namespace.yaml`          | Namespace            |
| `k8s/configmap.yaml`          | Non-secret env       |
| `k8s/secret.example.yaml`     | Secret template      |
| `k8s/redis-*.yaml`            | In-cluster Redis     |
| `k8s/nginx-configmap.yaml`    | Nginx + PHP ini      |
| `k8s/backend-deployment.yaml` | PHP-FPM + nginx      |
| `k8s/queue-worker-deployment.yaml` | Redis queue worker (required for async jobs) |
| `k8s/scheduler-deployment.yaml` | Laravel scheduler (daily social listening) |
| `k8s/backend-service.yaml`    | ClusterIP            |
| `k8s/migrate-job.yaml`        | Migrations           |
| `k8s/ingress.yaml`            | Public host          |
| `k8s/certificate.yaml`        | TLS via cert-manager |
| `Dockerfile`                  | Production image     |

## Out of scope (later plans)

- Factory23 frontend deploy (Sales Engine UI lives in Factory23 fullstack)
