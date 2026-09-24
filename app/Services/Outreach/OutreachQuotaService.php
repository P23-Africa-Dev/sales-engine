<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachSendQuota;
use InvalidArgumentException;

class OutreachQuotaService
{
    public function assertCanSend(Organization $organization, string $senderType): void
    {
        $limit = $this->dailyLimit($organization, $senderType);
        $used = $this->usedToday($organization, $senderType);

        if ($used >= $limit) {
            throw new InvalidArgumentException(
                "Daily outreach send limit reached ({$used}/{$limit}). Try again tomorrow."
            );
        }
    }

    public function recordSend(Organization $organization, string $senderType): void
    {
        $date = now()->toDateString();

        $quota = OutreachSendQuota::query()
            ->where('organization_id', $organization->id)
            ->where('sender_type', $senderType)
            ->whereDate('quota_date', $date)
            ->first();

        if (! $quota) {
            try {
                $quota = OutreachSendQuota::query()->create([
                    'organization_id' => $organization->id,
                    'sender_type' => $senderType,
                    'quota_date' => $date,
                    'sent_count' => 0,
                ]);
            } catch (\Throwable) {
                $quota = OutreachSendQuota::query()
                    ->where('organization_id', $organization->id)
                    ->where('sender_type', $senderType)
                    ->whereDate('quota_date', $date)
                    ->firstOrFail();
            }
        }

        $quota->increment('sent_count');
    }

    public function usedToday(Organization $organization, string $senderType): int
    {
        return (int) OutreachSendQuota::query()
            ->where('organization_id', $organization->id)
            ->where('sender_type', $senderType)
            ->whereDate('quota_date', now()->toDateString())
            ->value('sent_count');
    }

    public function dailyLimit(Organization $organization, string $senderType): int
    {
        // Customer outreach is always organization-domain SendGrid.
        return $this->organizationLimit($organization);
    }

    public function snapshot(Organization $organization, string $senderType): array
    {
        $limit = $this->dailyLimit($organization, $senderType);
        $used = $this->usedToday($organization, $senderType);

        return [
            'sender_type' => $senderType,
            'used' => $used,
            'limit' => $limit,
            'remaining' => max(0, $limit - $used),
        ];
    }

    private function organizationLimit(Organization $organization): int
    {
        $start = (int) config('outreach.quota.organization_warmup_start', 50);
        $ceiling = (int) config('outreach.quota.organization_daily_ceiling', 500);

        $domain = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $domain || ! $domain->warmup_started_at) {
            return $start;
        }

        $weeks = (int) $domain->warmup_started_at->diffInWeeks(now());
        $limit = $start * (2 ** max(0, $weeks));

        return min($ceiling, max($start, $limit));
    }
}
