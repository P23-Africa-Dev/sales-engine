<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachMailbox;
use App\Services\Outreach\DomainIntegrityService;
use App\Services\Outreach\OutreachQuotaService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSenderController extends Controller
{
    public function __construct(
        private readonly DomainIntegrityService $integrity,
        private readonly OutreachQuotaService $quota,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $identity = OutreachIdentity::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->first();

        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $org->id)
            ->first();

        $mailbox = OutreachMailbox::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->where('status', 'connected')
            ->orderByDesc('id')
            ->first();

        $senderMode = $identity?->sender_mode ?? 'platform';

        return response()->json([
            'data' => [
                'sender_mode' => $senderMode,
                'reply_to_email' => $identity?->reply_to_email ?? $user->email,
                'org_verified_from_email' => $domainAuth?->from_email,
                'org_verified_domain' => $domainAuth?->domain,
                'verification_status' => $domainAuth?->verification_status ?? 'pending',
                'org_connection_status' => $this->orgConnectionStatus($domainAuth),
                'integrity_status' => $domainAuth?->integrity_status,
                'integrity_checks' => $domainAuth?->integrity_checks ?? [],
                'integrity_checked_at' => $domainAuth?->integrity_checked_at?->toIso8601String(),
                'platform_from_email' => config('services.sendgrid.platform_from_email'),
                'connected_mailbox' => $mailbox ? [
                    'id' => $mailbox->id,
                    'email' => $mailbox->email,
                    'provider' => $mailbox->provider,
                    'status' => $mailbox->status,
                ] : null,
                'quota' => $this->quota->snapshot($org, $senderMode === 'organization' && ! $this->integrity->allowsOrganizationSending($domainAuth)
                    ? 'platform'
                    : ($senderMode === 'connected_mailbox' && ! $mailbox ? 'platform' : $senderMode)),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $data = $request->validate([
            'sender_mode' => ['required', 'string', 'in:platform,organization,connected_mailbox'],
            'reply_to_email' => ['nullable', 'email'],
        ]);

        if ($data['sender_mode'] === 'organization') {
            $domainAuth = OutreachDomainAuthentication::query()
                ->where('organization_id', $org->id)
                ->first();

            if (! $this->integrity->allowsOrganizationSending($domainAuth)) {
                return response()->json([
                    'message' => 'Verify your organization domain and pass the integrity checklist before switching to organization sending.',
                    'integrity_status' => $domainAuth?->integrity_status,
                    'integrity_checks' => $domainAuth?->integrity_checks ?? [],
                ], 422);
            }
        }

        if ($data['sender_mode'] === 'connected_mailbox') {
            $mailbox = OutreachMailbox::query()
                ->where('organization_id', $org->id)
                ->where('user_id', $user->id)
                ->where('status', 'connected')
                ->exists();

            if (! $mailbox) {
                return response()->json([
                    'message' => 'Connect a mailbox before switching to send-as-yourself.',
                ], 422);
            }
        }

        OutreachIdentity::query()->updateOrCreate(
            ['organization_id' => $org->id, 'user_id' => $user->id],
            [
                'sender_mode' => $data['sender_mode'],
                'reply_to_email' => $data['reply_to_email'] ?? $user->email,
            ]
        );

        return $this->show($request);
    }

    private function orgConnectionStatus(?OutreachDomainAuthentication $domainAuth): string
    {
        if (! $domainAuth) {
            return 'not_connected';
        }

        if ($domainAuth->verification_status === 'verified' && $domainAuth->integrity_status === 'fail') {
            return 'failed';
        }

        return match ($domainAuth->verification_status) {
            'verified' => 'verified',
            'failed' => 'failed',
            default => 'pending',
        };
    }
}
