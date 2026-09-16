#!/usr/bin/env bash
# Verify Stage 2 / new_plan production DB readiness inside the cluster.
# Usage (with kubeconfig for DOKS):
#   ./scripts/verify-stage2-production.sh
set -euo pipefail

NS="${K8S_NAMESPACE:-sales-engine}"

echo "== Job laravel-migrate =="
kubectl get job laravel-migrate -n "$NS" || true

echo ""
echo "== Schema + signal registry (php-fpm) =="
kubectl exec -n "$NS" deployment/backend -c php-fpm -- php -r '
require "vendor/autoload.php";
$app = require "bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$ok = true;
foreach ([
  "signal_type_definitions",
  "job_posting_watches",
  "enrichment_logs",
  "social_signals",
  "social_listening_settings",
] as $t) {
  $has = Schema::hasTable($t);
  echo $t . "=" . ($has ? "ok" : "MISSING") . PHP_EOL;
  $ok = $ok && $has;
}
if (Schema::hasTable("social_listening_settings")) {
  echo "icp_filter_enabled_column=" . (Schema::hasColumn("social_listening_settings", "icp_filter_enabled") ? "ok" : "MISSING") . PHP_EOL;
}
$count = App\Models\SignalTypeDefinition::query()->whereNull("organization_id")->count();
echo "global_signal_types=" . $count . PHP_EOL;
if ($count < 1) {
  fwrite(STDERR, "Signal type registry is empty — run: php artisan db:seed --class=SignalTypeDefinitionSeeder --force\n");
  exit(1);
}
exit($ok ? 0 : 1);
'

echo ""
echo "== Health =="
curl -sS "https://api.salesengine.thefactory23.com/api/v1/health" || true
echo ""
