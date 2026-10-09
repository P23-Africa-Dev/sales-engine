#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time cluster bootstrap for Sales Engine API (namespace + secret).
#
# Prerequisites:
#   - doctl authenticated (DO_ACCESS_TOKEN)
#   - kubectl available
#   - k8s/secret.yaml filled from secret.example.yaml (NOT committed)
#
# Usage:
#   export DOKS_CLUSTER_ID=8236d5b0-a49e-4ed8-9310-b432b7e3e2d2
#   ./scripts/bootstrap-cluster.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLUSTER_ID="${DOKS_CLUSTER_ID:-8236d5b0-a49e-4ed8-9310-b432b7e3e2d2}"
NS="sales-engine"

if [[ ! -f "$ROOT/k8s/secret.yaml" ]]; then
  echo "Missing k8s/secret.yaml"
  echo "  cp k8s/secret.example.yaml k8s/secret.yaml"
  echo "  # Fill APP_KEY and DB_PASSWORD, then re-run."
  exit 1
fi

echo "==> Saving kubeconfig for cluster $CLUSTER_ID"
doctl kubernetes cluster kubeconfig save "$CLUSTER_ID"

echo "==> Applying namespace"
kubectl apply -f "$ROOT/k8s/namespace.yaml"

echo "==> Applying sales-engine-secret"
kubectl apply -f "$ROOT/k8s/secret.yaml"

echo "==> Ensuring do-registry pull secret"
doctl registry login --expiry-seconds 600
EMAIL="$(doctl account get --format Email --no-header)"
# Prefer DO_ACCESS_TOKEN env; fall back to prompting via doctl auth context is not possible for password.
if [[ -z "${DO_ACCESS_TOKEN:-}" ]]; then
  echo "Set DO_ACCESS_TOKEN in the environment to create the registry pull secret."
  echo "Namespace and app secret were applied; create do-registry before first deploy."
  exit 0
fi

kubectl create secret docker-registry do-registry \
  -n "$NS" \
  --docker-server=registry.digitalocean.com \
  --docker-username="$EMAIL" \
  --docker-password="$DO_ACCESS_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Bootstrap complete. Push to main (or run Deploy workflow) to roll out the API."
kubectl get ns "$NS"
kubectl get secret -n "$NS"
