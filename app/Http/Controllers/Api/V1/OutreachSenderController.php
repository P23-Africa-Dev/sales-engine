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
use App\Services\Outreach\Transport\InfobipSmsTransport;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSenderController extends Controller
{
    public function __construct(
        private readonly DomainIntegrityService $integrity,
        private readonly OutreachQuotaService $quota,
        private readonly OutreachIdentityResolver $identityResolver,
        private readonly InfobipSmsTransport $sms,
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
        $senderMode = $identity?->sender_mode ?? 'platform';
        if (! in_array($senderMode, ['platform', 'organization'], true)) {
            $senderMode = 'platform';
        }

        $effectiveQuotaMode = $senderMode === 'organization' && ! ($setup['can_send_organization'] ?? false)
            ? 'platform'
            : $senderMode;

        $openSupport = OutreachSetupRequest::query()
            ->where('organization_id', $org->id)
            ->whereIn('status', ['open', 'in_progress'])
            ->orderByDesc('id')
            ->first();

        return response()->json([
            'data' => [
                'sender_mode' => $senderMode,
                'reply_to_email' => $identity?->reply_to_email ?? $user->email,
                'org_verified_from_email' => $defaultInbox?->email ?? $domainAuth?->from_email,
                'org_verified_domain' => $domainAuth?->domain,
                'verification_status' => $domainAuth?->verification_status ?? 'pending',
                'org_connection_status' => $this->orgConnectionStatus($domainAuth),
                'integrity_status' => $domainAuth?->integrity_status,
                'integrity_checks' => $domainAuth?->integrity_checks ?? [],
                'integrity_checked_at' => $domainAuth?->integrity_checked_at?->toIso8601String(),
                'platform_from_email' => config('services.sendgrid.platform_from_email'),
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
                'quota' => $this->quota->snapshot($org, $effectiveQuotaMode),
                'sms' => [
                    'configured' => $this->sms->isConfigured(),
                    'from' => config('services.infobip.sms_from') ?: null,
                    'quota' => $this->quota->snapshot($org, 'sms'),
                ],
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
            'sender_mode' => ['nullable', 'string', 'in:platform,organization'],
            'default_inbox_id' => ['nullable', 'integer'],
            'reply_to_email' => ['nullable', 'email'],
        ]);

        $identity = OutreachIdentity::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->first();

        $senderMode = $data['sender_mode'] ?? $identity?->sender_mode ?? 'platform';
        if (! in_array($senderMode, ['platform', 'organization'], true)) {
            $senderMode = 'platform';
        }

        if ($senderMode === 'organization') {
            $domainAuth = OutreachDomainAuthentication::query()
                ->where('organization_id', $org->id)
                ->first();

            if (! $this->integrity->allowsOrganizationSending($domainAuth)) {
                return response()->json([
                    'message' => 'Verify your organization domain and pass the integrity checklist before switching to organization sending. You can keep using platform sending until then.',
                    'integrity_status' => $domainAuth?->integrity_status,
                    'integrity_checks' => $domainAuth?->integrity_checks ?? [],
                ], 422);
            }

            $confirmedInbox = OutreachInbox::query()
                ->where('organization_id', $org->id)
                ->where('status', 'confirmed')
                ->exists();

            if (! $confirmedInbox) {
                return response()->json([
                    'message' => 'Confirm at least one organization inbox before switching to organization sending.',
                ], 422);
            }
        }

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
        }

        $replyTo = array_key_exists('reply_to_email', $data)
            ? ($data['reply_to_email'] ?? $user->email)
            : ($identity?->reply_to_email ?? $user->email);

        OutreachIdentity::query()->updateOrCreate(
            ['organization_id' => $org->id, 'user_id' => $user->id],
            [
                'sender_mode' => $senderMode,
                'reply_to_email' => $replyTo,
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
