<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSenderController extends Controller
{
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

        return response()->json([
            'data' => [
                'sender_mode' => $identity?->sender_mode ?? 'platform',
                'reply_to_email' => $identity?->reply_to_email ?? $user->email,
                'org_verified_from_email' => $domainAuth?->from_email,
                'org_verified_domain' => $domainAuth?->domain,
                'verification_status' => $domainAuth?->verification_status ?? 'pending',
                'platform_from_email' => config('services.sendgrid.platform_from_email'),
            ],
        ]);
    }

    /**
     * Only `sender_mode` and `reply_to_email` are client-settable. Domain
     * verification fields are derived exclusively from `OutreachDomainAuthentication`,
     * which is only ever written by SendGridDomainAuthService after a real
     * SendGrid API check — never trusted from client input here.
     */
    public function update(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $data = $request->validate([
            'sender_mode' => ['required', 'string', 'in:platform,organization'],
            'reply_to_email' => ['nullable', 'email'],
        ]);

        if ($data['sender_mode'] === 'organization') {
            $domainAuth = OutreachDomainAuthentication::query()
                ->where('organization_id', $org->id)
                ->first();

            if (! $domainAuth || ! $domainAuth->isVerified()) {
                return response()->json([
                    'message' => 'Verify your organization domain before switching to organization sending.',
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
}
