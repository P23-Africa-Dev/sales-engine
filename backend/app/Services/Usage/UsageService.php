<?php

namespace App\Services\Usage;

use App\Models\ApiUsage;
use App\Models\DiscoveryRun;
use App\Models\Organization;
use App\Models\OutreachActivity;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UsageService
{
    /**
     * @return array<string, mixed>
     */
    public function snapshot(Organization $organization): array
    {
        $start = now()->startOfMonth();
        $end = now()->endOfMonth();

        $searches = DiscoveryRun::query()
            ->where('organization_id', $organization->id)
            ->whereIn('intent', ['generate_leads', 'generate_more_leads'])
            ->where('created_at', '>=', $start)
            ->count();

        $enrichment = (int) ApiUsage::query()
            ->where('organization_id', $organization->id)
            ->where('created_at', '>=', $start)
            ->where(function ($query) {
                $query->where('endpoint', 'like', '%enrich%')
                    ->orWhereIn('provider', ['hunter', 'apollo', 'bytemine', 'cleanlist']);
            })
            ->sum('units');

        $emails = OutreachActivity::query()
            ->where('organization_id', $organization->id)
            ->whereIn('channel', ['email', 'email draft'])
            ->whereNotNull('sent_at')
            ->where('sent_at', '>=', $start)
            ->count();

        return [
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'searches' => [
                'used' => $searches,
                'limit' => $organization->search_limit_monthly ?? (int) config('sales_engine.limits.searches_per_month'),
            ],
            'outreach_emails' => [
                'used' => $emails,
                'limit' => $organization->outreach_email_limit_monthly ?? (int) config('sales_engine.limits.outreach_emails_per_month'),
            ],
            'enrichment_lookups' => [
                'used' => $enrichment,
                'limit' => $organization->enrichment_limit_monthly ?? (int) config('sales_engine.limits.enrichment_lookups_per_month'),
            ],
        ];
    }

    public function assertCanSearch(Organization $organization): void
    {
        $searches = $this->snapshot($organization)['searches'];
        if ($searches['used'] >= $searches['limit']) {
            throw new HttpException(429, 'Monthly search limit reached.');
        }
    }
}
