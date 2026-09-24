<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachInbox;
use App\Models\OutreachSetupRequest;
use App\Services\Outreach\DomainIntegrityService;
use App\Services\Outreach\OutreachIdentityResolver;
use App\Services\Outreach\OutreachQuotaService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSenderController extends Controller
{
    public function __construct(
        private readonly DomainIntegrityService $integrity,
        private readonly OutreachQuotaService $quota,
        private readonly OutreachIdentityResolver $identityResolver,
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

        $defaultInbox = OutreachInbox::query()
            ->where('organization_id', $org->id)
            ->where('status', 'confirmed')
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();

        $setup = $this->identityResolver->setupStatus($org);
        $openSupport = OutreachSetupRequest::query()
            ->where('organization_id', $org->id)
            ->whereIn('status', ['open', 'in_progress'])
            ->orderByDesc('id')
            ->first();

        return response()->json([
            'data' => [
                // Legacy field kept for older clients; customer send is always organization when ready.
                'sender_mode' => 'organization',
                'reply_to_email' => $defaultInbox?->email ?? $identity?->reply_to_email ?? $user->email,
                'org_verified_from_email' => $defaultInbox?->email ?? $domainAuth?->from_email,
                'org_verified_domain' => $domainAuth?->domain,
                'verification_status' => $domainAuth?->verification_status ?? 'pending',
                'org_connection_status' => $this->orgConnectionStatus($domainAuth),
                'integrity_status' => $domainAuth?->integrity_status,
                'integrity_checks' => $domainAuth?->integrity_checks ?? [],
                'integrity_checked_at' => $domainAuth?->integrity_checked_at?->toIso8601String(),
                'platform_from_email' => null,
                'connected_mailbox' => null,
                'default_inbox' => $defaultInbox ? [
                    'id' => $defaultInbox->id,
                    'email' => $defaultInbox->email,
                    'display_name' => $defaultInbox->display_name,
                    'status' => $defaultInbox->status,
                    'is_default' => (bool) $defaultInbox->is_default,
                ] : null,
                'setup' => $setup,
                'support_request' => $openSupport ? [
                    'id' => $openSupport->id,
                    'status' => $openSupport->status,
                    'domain' => $openSupport->domain,
                    'created_at' => $openSupport->created_at?->toIso8601String(),
                ] : null,
                'quota' => $this->quota->snapshot($org, 'organization'),
            ],
        ]);
    }

    /**
     * Customers no longer choose platform/mailbox modes. Optional default inbox only.
     */
    public function update(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $data = $request->validate([
            'default_inbox_id' => ['nullable', 'integer'],
            'reply_to_email' => ['nullable', 'email'],
        ]);

        if (! empty($data['default_inbox_id'])) {
            $inbox = OutreachInbox::query()
                ->where('organization_id', $org->id)
                ->where('status', 'confirmed')
                ->find($data['default_inbox_id']);

            if (! $inbox) {
                return response()->json(['message' => 'Confirmed inbox not found.'], 422);
            }

            OutreachInbox::query()
                ->where('organization_id', $org->id)
                ->update(['is_default' => false]);
            $inbox->update(['is_default' => true]);

            OutreachIdentity::query()->updateOrCreate(
                ['organization_id' => $org->id, 'user_id' => $user->id],
                [
                    'sender_mode' => 'organization',
                    'reply_to_email' => $inbox->email,
                ]
            );
        } elseif (array_key_exists('reply_to_email', $data)) {
            OutreachIdentity::query()->updateOrCreate(
                ['organization_id' => $org->id, 'user_id' => $user->id],
                [
                    'sender_mode' => 'organization',
                    'reply_to_email' => $data['reply_to_email'] ?? $user->email,
                ]
            );
        }

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
