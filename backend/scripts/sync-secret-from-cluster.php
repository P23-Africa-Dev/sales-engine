<?php

declare(strict_types=1);

$path = __DIR__ . '/../k8s/secret.yaml';
$yaml = file_get_contents($path);
if ($yaml === false) {
    fwrite(STDERR, "missing secret.yaml\n");
    exit(1);
}

$app = getenv('APP_KEY') ?: '';
$db = getenv('DB_PASSWORD') ?: '';
if ($app === '' || $db === '') {
    fwrite(STDERR, "empty APP_KEY or DB_PASSWORD from cluster\n");
    exit(1);
}

$esc = static fn(string $s): string => str_replace(['\\', '"'], ['\\\\', '\\"'], $s);

$yaml = preg_replace('/APP_KEY:\s*"[^"]*"/', 'APP_KEY: "' . $esc($app) . '"', $yaml, 1, $c1);
$yaml = preg_replace('/DB_PASSWORD:\s*"[^"]*"/', 'DB_PASSWORD: "' . $esc($db) . '"', $yaml, 1, $c2);
if ($c1 !== 1 || $c2 !== 1) {
    fwrite(STDERR, "failed to replace fields (app={$c1} db={$c2})\n");
    exit(1);
}

$yaml = preg_replace(
    '/# From local \.env[\s\S]*?before re-applying[^\n]*\n/',
    "# Synced from live cluster sales-engine-secret\n",
    $yaml,
    1
);
$yaml = preg_replace(
    '/# DigitalOcean Managed MySQL password for sales_engine_user\n\s*# Paste the real password[^\n]*\n\s*# [^\n]*\n/',
    "# Synced from live cluster (sales_engine_user)\n",
    $yaml,
    1
);

file_put_contents($path, $yaml);
echo 'Synced APP_KEY (len=' . strlen($app) . ') and DB_PASSWORD (len=' . strlen($db) . ") into k8s/secret.yaml\n";
