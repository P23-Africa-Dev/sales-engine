<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachIdentity;
use App\Models\SocialListeningSetting;
use App\Services\Icp\IcpProfileService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachSenderController extends Controller
{
    public function __construct(private readonly IcpProfileService $icps) {}

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

        $icp = $this->icps->active($org);
        $settings = $icp
            ? SocialListeningSetting::query()
                ->where('organization_id', $org->id)
                ->where('icp_profile_id', $icp->id)
                ->first()
            : null;

        return response()->json([
            'data' => [
                'sender_mode' => $identity?->sender_mode ?? $settings?->sender_mode ?? 'platform',
                'reply_to_email' => $identity?->reply_to_email ?? $user->email,
                'org_verified_from_email' => $settings?->org_verified_from_email,
                'org_verified_domain' => $settings?->org_verified_domain,
                'verification_status' => $settings?->verification_status ?? 'pending',
                'platform_from_email' => config('services.sendgrid.platform_from_email'),
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
            'sender_mode' => ['required', 'string', 'in:platform,organization'],
            'reply_to_email' => ['nullable', 'email'],
            'org_verified_from_email' => ['nullable', 'email'],
            'org_verified_domain' => ['nullable', 'string', 'max:255'],
            'verification_status' => ['nullable', 'string', 'in:pending,verified,failed'],
        ]);

        OutreachIdentity::query()->updateOrCreate(
            ['organization_id' => $org->id, 'user_id' => $user->id],
            [
                'sender_mode' => $data['sender_mode'],
                'reply_to_email' => $data['reply_to_email'] ?? $user->email,
            ]
        );

        $icp = $this->icps->active($org);
        if ($icp) {
            SocialListeningSetting::query()->updateOrCreate(
                ['organization_id' => $org->id, 'icp_profile_id' => $icp->id],
                array_filter([
                    'sender_mode' => $data['sender_mode'],
                    'org_verified_from_email' => $data['org_verified_from_email'] ?? null,
                    'org_verified_domain' => $data['org_verified_domain'] ?? null,
                    'verification_status' => $data['verification_status'] ?? null,
                ], fn ($v) => $v !== null)
            );
        }

        return $this->show($request);
    }
}
