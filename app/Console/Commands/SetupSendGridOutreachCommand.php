<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * One-time (or re-runnable) setup for the SendGrid Event Webhook, signed
 * verification key, unsubscribe (ASM) group, and subscription tracking —
 * all done via the SendGrid API so no manual dashboard clicking is required.
 */
class SetupSendGridOutreachCommand extends Command
{
    protected $signature = 'outreach:setup-sendgrid {webhook-url : Public HTTPS URL that will receive SendGrid Event Webhook POSTs}';

    protected $description = 'Configure the SendGrid Event Webhook (with signing), ASM unsubscribe group, and subscription tracking for outreach';

    private const API_BASE = 'https://api.sendgrid.com/v3';

    public function handle(): int
    {
        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            $this->error('SENDGRID_API_KEY is not configured.');

            return self::FAILURE;
        }

        $webhookUrl = (string) $this->argument('webhook-url');

        try {
            $webhookId = $this->configureEventWebhook($apiKey, $webhookUrl);
            $publicKey = $this->enableSignedWebhook($apiKey, $webhookId);
            $groupId = $this->ensureUnsubscribeGroup($apiKey);
            $this->enableSubscriptionTracking($apiKey);
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('SendGrid outreach setup complete. Store these values as secrets/config:');
        $this->line('  SENDGRID_WEBHOOK_URL='.$webhookUrl);
        $this->line('  SENDGRID_WEBHOOK_PUBLIC_KEY='.$publicKey);
        $this->line('  SENDGRID_UNSUBSCRIBE_GROUP_ID='.$groupId);
        $this->newLine();
        $this->comment('After adding these to the k8s secret/configmap and restarting, outreach delivery/bounce/open tracking and unsubscribe compliance will be fully active.');

        return self::SUCCESS;
    }

    private function client(string $apiKey)
    {
        return Http::timeout(30)->withToken($apiKey)->asJson();
    }

    private function configureEventWebhook(string $apiKey, string $webhookUrl): string
    {
        $response = $this->client($apiKey)->post(self::API_BASE.'/user/webhooks/event/settings', [
            'enabled' => true,
            'url' => $webhookUrl,
            'delivered' => true,
            'open' => true,
            'click' => true,
            'bounce' => true,
            'dropped' => true,
            'deferred' => true,
            'spam_report' => true,
            'unsubscribe' => true,
            'group_unsubscribe' => true,
            'group_resubscribe' => true,
            'processed' => true,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Failed to configure Event Webhook: '.$response->body());
        }

        $this->info('Event Webhook configured with URL: '.$webhookUrl);

        // The settings endpoint doesn't return the webhook id we need for signing;
        // fetch all webhooks and use the oldest one's id (same one we just set).
        $list = $this->client($apiKey)->get(self::API_BASE.'/user/webhooks/event/settings/all');
        if (! $list->successful()) {
            throw new RuntimeException('Failed to list Event Webhooks: '.$list->body());
        }

        $webhooks = $list->json('webhooks') ?? $list->json() ?? [];
        $id = $webhooks[0]['id'] ?? null;

        if (! $id) {
            // Signing endpoints default to the oldest webhook when no id is passed.
            return '';
        }

        return (string) $id;
    }

    private function enableSignedWebhook(string $apiKey, string $webhookId): string
    {
        $path = self::API_BASE.'/user/webhooks/event/settings/signed'.($webhookId !== '' ? "/{$webhookId}" : '');

        $response = $this->client($apiKey)->patch($path, ['enabled' => true]);

        if (! $response->successful()) {
            throw new RuntimeException('Failed to enable signed Event Webhook: '.$response->body());
        }

        $publicKey = (string) ($response->json('public_key') ?? '');
        if ($publicKey === '') {
            throw new RuntimeException('SendGrid did not return a public key for the signed webhook.');
        }

        $this->info('Signed Event Webhook enabled.');

        return $publicKey;
    }

    private function ensureUnsubscribeGroup(string $apiKey): int
    {
        $existing = $this->client($apiKey)->get(self::API_BASE.'/asm/groups');
        if ($existing->successful()) {
            foreach ((array) $existing->json() as $group) {
                if (($group['name'] ?? null) === 'Sales Engine Outreach') {
                    $this->info('Reusing existing ASM unsubscribe group id '.$group['id'].'.');

                    return (int) $group['id'];
                }
            }
        }

        $response = $this->client($apiKey)->post(self::API_BASE.'/asm/groups', [
            'name' => 'Sales Engine Outreach',
            'description' => 'Cold outreach sent via the Sales Engine',
            'is_default' => false,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Failed to create ASM unsubscribe group: '.$response->body());
        }

        $groupId = (int) $response->json('id');
        $this->info('Created ASM unsubscribe group id '.$groupId.'.');

        return $groupId;
    }

    private function enableSubscriptionTracking(string $apiKey): void
    {
        $response = $this->client($apiKey)->patch(self::API_BASE.'/tracking_settings/subscription', [
            'enabled' => true,
        ]);

        if (! $response->successful()) {
            // Non-fatal: SendGrid will still deliver without a custom footer text configured.
            $this->warn('Could not enable subscription tracking automatically: '.$response->body());

            return;
        }

        $this->info('Subscription tracking enabled.');
    }
}
