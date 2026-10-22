<?php

namespace App\Services\Outreach;

use App\Models\OutreachActivity;

class InboundReplyAddress
{
    public function configured(): bool
    {
        return $this->domain() !== '' && $this->secret() !== '';
    }

    public function forActivity(?OutreachActivity $activity): ?string
    {
        if (! $activity || ! $this->configured()) {
            return null;
        }

        $hmac = substr(hash_hmac('sha256', (string) $activity->id, $this->secret()), 0, 16);

        return 'r+'.$activity->id.'.'.$hmac.'@'.$this->domain();
    }

    public function activityIdFromRecipient(?string $recipient): ?int
    {
        if (! $this->configured() || $recipient === null) {
            return null;
        }

        if (! preg_match('/r\+(\d+)\.([a-f0-9]{16})@/i', $recipient, $matches)) {
            return null;
        }

        $id = (int) $matches[1];
        $expected = substr(hash_hmac('sha256', (string) $id, $this->secret()), 0, 16);
        if (! hash_equals($expected, strtolower($matches[2]))) {
            return null;
        }

        return $id;
    }

    private function domain(): string
    {
        return trim((string) config('services.sendgrid.inbound_domain'));
    }

    private function secret(): string
    {
        return trim((string) config('services.sendgrid.inbound_secret'));
    }
}
