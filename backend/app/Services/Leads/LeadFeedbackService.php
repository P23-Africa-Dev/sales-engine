<?php

namespace App\Services\Leads;

use App\Models\ChatMessage;
use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Support\Collection;

class LeadFeedbackService
{
    /**
     * @param  list<int>  $leadIds
     * @return Collection<int, Lead>
     */
    public function reject(Organization $organization, array $leadIds, ?string $reason = null): Collection
    {
        $leads = Lead::query()
            ->where('organization_id', $organization->id)
            ->whereIn('id', $leadIds)
            ->get();

        foreach ($leads as $lead) {
            $lead->update([
                'save_status' => Lead::SAVE_REJECTED,
                'rejected_at' => now(),
                'rejection_reason' => $reason,
            ]);
            $this->markChatCopies($organization->id, $lead->id);
        }

        return $leads;
    }

    private function markChatCopies(int $organizationId, int $leadId): void
    {
        $messages = ChatMessage::query()
            ->whereHas('session', fn ($query) => $query->where('organization_id', $organizationId))
            ->whereNotNull('leads')
            ->orderByDesc('id')
            ->limit(40)
            ->get();

        foreach ($messages as $message) {
            $leads = is_array($message->leads) ? $message->leads : [];
            $changed = false;
            foreach ($leads as $index => $lead) {
                if (! is_array($lead) || (int) ($lead['id'] ?? 0) !== $leadId) {
                    continue;
                }
                $leads[$index]['save_status'] = Lead::SAVE_REJECTED;
                $leads[$index]['rejected'] = true;
                $changed = true;
            }
            if ($changed) {
                $message->update(['leads' => $leads]);
            }
        }
    }
}
