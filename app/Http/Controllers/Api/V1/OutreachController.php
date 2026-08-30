<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CompanyContact;
use App\Models\IcpProfile;
use App\Models\OutreachActivity;
use App\Services\Icp\IcpProfileService;
use App\Services\Outreach\OutreachDraftService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class OutreachController extends Controller
{
    public function __construct(
        private readonly OutreachDraftService $outreach,
        private readonly IcpProfileService $icps,
    ) {}

    public function recent(): JsonResponse
    {
        $items = OutreachActivity::query()
            ->where('organization_id', OrgContext::require()->id)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (OutreachActivity $a) => [
                'id' => $a->id,
                'name' => $a->name,
                'channel' => $a->channel,
                'preview' => $a->preview,
                'accentBg' => $a->accent_bg,
                'accentIcon' => $a->accent_icon,
                'occurred_at' => $a->occurred_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $items]);
    }

    public function draft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:5000'],
            'channel' => ['nullable', 'string', 'in:email,whatsapp'],
            'contact_id' => ['nullable', 'integer'],
            'send' => ['nullable', 'boolean'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Active ICP required.'], 422);
        }

        if (! empty($data['send']) && ($data['channel'] ?? '') === 'whatsapp') {
            $contact = null;
            if (! empty($data['contact_id'])) {
                $contact = CompanyContact::query()->find($data['contact_id']);
            }
            try {
                $this->outreach->assertCanSendWhatsApp($contact);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        // Sending is not implemented in v1 — drafts only.
        if (! empty($data['send'])) {
            return response()->json(['message' => 'Outbound send is not enabled. Drafts only until channel providers are configured.'], 422);
        }

        $prompt = $data['prompt'];
        if (($data['channel'] ?? null) === 'whatsapp' && ! str_contains(mb_strtolower($prompt), 'whatsapp')) {
            $prompt = 'whatsapp: '.$prompt;
        }

        $draft = $this->outreach->draftFromPrompt($org, $icp, $prompt);

        return response()->json(['data' => $draft]);
    }
}
