<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessSignalReminderJob;
use App\Models\SignalReminder;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReminderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'in:upcoming,done'],
        ]);

        $query = SignalReminder::query()
            ->with('signal')
            ->where('organization_id', OrgContext::require()->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('cancelled_at');

        if (($data['status'] ?? 'upcoming') === 'done') {
            $query->whereNotNull('completed_at');
        } else {
            $query->whereNull('completed_at');
        }

        $rows = $query->orderBy('remind_at')->get()->map(fn (SignalReminder $reminder) => $this->payload($reminder));

        return response()->json(['data' => $rows]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'remind_at' => ['sometimes', 'date'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $reminder = $this->owned($request, $id);
        $reminder->fill($data);
        $reminder->save();

        if (isset($data['remind_at'])) {
            ProcessSignalReminderJob::dispatch($reminder->id)->delay($reminder->remind_at);
        }

        return response()->json(['data' => $this->payload($reminder->fresh('signal'))]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $reminder = $this->owned($request, $id);
        $reminder->update(['cancelled_at' => now()]);

        return response()->json(['message' => 'Reminder cancelled.']);
    }

    private function owned(Request $request, int $id): SignalReminder
    {
        return SignalReminder::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('user_id', $request->user()->id)
            ->findOrFail($id);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(SignalReminder $reminder): array
    {
        return [
            'id' => $reminder->id,
            'remind_at' => $reminder->remind_at?->toIso8601String(),
            'note' => $reminder->note,
            'completed_at' => $reminder->completed_at?->toIso8601String(),
            'signal' => [
                'id' => $reminder->signal?->id,
                'company' => $reminder->signal?->company_name,
                'profile' => $reminder->signal?->profile_name,
            ],
        ];
    }
}
