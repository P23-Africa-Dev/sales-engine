<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachSetupRequest;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSetupRequestController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
            'domain' => ['nullable', 'string', 'max:255'],
        ]);

        $org = OrgContext::require();
        $user = $request->user();

        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $org->id)
            ->first();

        $open = OutreachSetupRequest::query()
            ->where('organization_id', $org->id)
            ->where('status', 'open')
            ->first();

        if ($open) {
            $open->update([
                'note' => $data['note'] ?? $open->note,
                'domain' => $data['domain'] ?? $domainAuth?->domain ?? $open->domain,
                'failing_checks' => $domainAuth?->integrity_checks,
                'user_id' => $user?->id ?? $open->user_id,
            ]);

            return response()->json([
                'data' => $this->format($open->refresh()),
                'message' => 'Your support request is already open. We updated the details.',
            ]);
        }

        $row = OutreachSetupRequest::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user?->id,
            'domain' => $data['domain'] ?? $domainAuth?->domain,
            'note' => $data['note'] ?? null,
            'status' => 'open',
            'failing_checks' => $domainAuth?->integrity_checks,
        ]);

        return response()->json([
            'data' => $this->format($row),
            'message' => 'Sales Engine support has your setup request.',
        ], 201);
    }

    public function show(): JsonResponse
    {
        $org = OrgContext::require();
        $row = OutreachSetupRequest::query()
            ->where('organization_id', $org->id)
            ->whereIn('status', ['open', 'in_progress'])
            ->orderByDesc('id')
            ->first();

        return response()->json(['data' => $row ? $this->format($row) : null]);
    }

    private function format(OutreachSetupRequest $row): array
    {
        return [
            'id' => $row->id,
            'domain' => $row->domain,
            'note' => $row->note,
            'status' => $row->status,
            'failing_checks' => $row->failing_checks ?? [],
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
