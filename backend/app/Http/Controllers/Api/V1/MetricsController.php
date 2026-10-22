<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CrmEntry;
use App\Models\Lead;
use App\Models\OutreachActivity;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MetricsController extends Controller
{
    public function index(): JsonResponse
    {
        $orgId = OrgContext::require()->id;
        $thisWeek = [now()->subWeek(), now()];
        $lastWeek = [now()->subWeeks(2), now()->subWeek()];

        $discovered = Lead::query()->where('organization_id', $orgId)->where('save_status', Lead::SAVE_SAVED)->count();
        $pending = Lead::query()->where('organization_id', $orgId)->where('save_status', Lead::SAVE_DRAFT)->count();
        $inCrm = Lead::query()->where('organization_id', $orgId)
            ->where(fn ($query) => $query->whereNotNull('synced_to_f23_at')->orWhereHas('crmEntry'))
            ->count();

        return response()->json([
            'data' => [
                'leads_discovered' => $discovered,
                'leads_discovered_change_percent' => $this->percent(
                    $this->countLeads($orgId, Lead::SAVE_SAVED, $thisWeek),
                    $this->countLeads($orgId, Lead::SAVE_SAVED, $lastWeek),
                ),
                'leads_pending_review' => $pending,
                'leads_pending_review_change_percent' => $this->percent(
                    $this->countLeads($orgId, Lead::SAVE_DRAFT, $thisWeek),
                    $this->countLeads($orgId, Lead::SAVE_DRAFT, $lastWeek),
                ),
                'leads_in_crm' => $inCrm,
                'leads_in_crm_change_percent' => $this->percent(
                    CrmEntry::query()->where('organization_id', $orgId)->whereBetween('created_at', $thisWeek)->count(),
                    CrmEntry::query()->where('organization_id', $orgId)->whereBetween('created_at', $lastWeek)->count(),
                ),
                'companies_cached' => Company::query()->where('organization_id', $orgId)->count(),
                'qualified_leads' => Lead::query()->where('organization_id', $orgId)->where('stage', 'qualified')->count(),
                'outreach_drafts' => OutreachActivity::query()->where('organization_id', $orgId)->count(),
                'pipeline' => collect(Lead::STAGES)->mapWithKeys(
                    fn (string $stage) => [
                        $stage => Lead::query()->where('organization_id', $orgId)->where('stage', $stage)->count(),
                    ]
                ),
            ],
        ]);
    }

    public function trend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'metric' => ['nullable', 'in:leads_discovered,leads_in_crm,outreach_sent'],
            'range' => ['nullable', 'in:7d,30d'],
        ]);

        $orgId = OrgContext::require()->id;
        $days = ($data['range'] ?? '7d') === '30d' ? 30 : 7;
        $metric = $data['metric'] ?? 'leads_discovered';
        $points = [];
        $highlight = null;
        $highlightValue = -1;

        for ($offset = $days - 1; $offset >= 0; $offset--) {
            $day = now()->startOfDay()->subDays($offset);
            $value = $this->countOnDay($orgId, $metric, $day);
            $points[] = [
                'date' => $day->toDateString(),
                'day' => $day->format('D'),
                'value' => $value,
            ];
            if ($value > $highlightValue) {
                $highlightValue = $value;
                $highlight = $day->toDateString();
            }
        }

        $current = array_sum(array_column($points, 'value'));
        $previous = 0;
        for ($offset = ($days * 2) - 1; $offset >= $days; $offset--) {
            $previous += $this->countOnDay($orgId, $metric, now()->startOfDay()->subDays($offset));
        }
        $change = $this->percent($current, $previous);

        return response()->json([
            'data' => [
                'points' => $points,
                'change_percent' => $change,
                'direction' => $change > 0 ? 'up' : ($change < 0 ? 'down' : 'flat'),
                'highlight_date' => $highlight,
            ],
        ]);
    }

    /**
     * @param  array{0: Carbon, 1: Carbon}  $window
     */
    private function countLeads(int $orgId, string $status, array $window): int
    {
        return Lead::query()
            ->where('organization_id', $orgId)
            ->where('save_status', $status)
            ->whereBetween('created_at', $window)
            ->count();
    }

    private function countOnDay(int $orgId, string $metric, Carbon $day): int
    {
        $start = $day->copy()->startOfDay();
        $end = $day->copy()->endOfDay();

        return match ($metric) {
            'leads_in_crm' => CrmEntry::query()->where('organization_id', $orgId)->whereBetween('created_at', [$start, $end])->count(),
            'outreach_sent' => OutreachActivity::query()->where('organization_id', $orgId)->whereBetween('sent_at', [$start, $end])->count(),
            default => Lead::query()->where('organization_id', $orgId)->where('save_status', '!=', Lead::SAVE_REJECTED)->whereBetween('created_at', [$start, $end])->count(),
        };
    }

    private function percent(int $current, int $previous): int
    {
        if ($previous === 0) {
            return $current > 0 ? 100 : 0;
        }

        return (int) round((($current - $previous) / $previous) * 100);
    }
}
