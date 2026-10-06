<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachActivity;
use App\Services\Crm\NativeCrmService;
use App\Services\Outreach\OutreachSendService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NativeCrmEmailController extends Controller
{
    public function __construct(private readonly NativeCrmService $crm, private readonly OutreachSendService $sender) {}

    public function index(int $id): JsonResponse
    {
        $this->crm->entry($id);
        $emails = OutreachActivity::query()->where('organization_id', OrgContext::require()->id)->where('lead_id', $id)->whereIn('channel', ['email', 'email draft'])->latest()->get(['id', 'name', 'subject', 'body', 'to_email', 'delivery_status', 'sent_at', 'created_at', 'bounce_reason']);

        return response()->json(['data' => ['items' => $emails, 'inbound_supported' => false]]);
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $entry = $this->crm->entry($id);
        $data = $request->validate(['to_email' => ['required', 'email'], 'subject' => ['required', 'string', 'max:255'], 'body' => ['required', 'string', 'max:20000'], 'inbox_id' => ['nullable', 'integer'], 'request_id' => ['required', 'uuid']]);
        try {
            $activity = DB::transaction(function () use ($entry, $request, $data) {
                DB::table('organizations')->where('id', $entry->organization_id)->lockForUpdate()->first();
                $existing = OutreachActivity::query()->where('organization_id', $entry->organization_id)->where('meta->crm_request_id', $data['request_id'])->first();
                if ($existing) {
                    return $existing;
                }
                $activity = OutreachActivity::query()->create(['organization_id' => $entry->organization_id, 'lead_id' => $entry->lead_id, 'company_id' => $entry->lead->company_id, 'name' => $entry->lead->name, 'channel' => 'email', 'subject' => $data['subject'], 'body' => $data['body'], 'to_email' => $data['to_email'], 'meta' => ['crm_request_id' => $data['request_id']]]);
                $this->sender->queueEmail(OrgContext::require(), $request->user(), $data['to_email'], $data['subject'], $data['body'], $activity, $data['inbox_id'] ?? null);

                return $activity->fresh();
            });
        } catch (\InvalidArgumentException $error) {
            throw ValidationException::withMessages(['sender' => $error->getMessage()]);
        }

        return response()->json(['data' => ['activity' => $activity]], 201);
    }
}
