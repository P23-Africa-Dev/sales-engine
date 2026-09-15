<?php

namespace App\Jobs;

use App\Models\SocialSignal;
use App\Services\Enrichment\EnrichmentUsageTracker;
use App\Services\Intent\SignalToLeadService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class EnrichSocialSignalJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 120;

    public function __construct(public int $signalId) {}

    public function handle(SignalToLeadService $signalToLead): void
    {
        $signal = SocialSignal::query()->with(['organization', 'icpProfile'])->find($this->signalId);
        if (! $signal || ! $signal->organization) {
            return;
        }

        try {
            $signalToLead->enrichSignalOnly($signal, $signal->organization);
        } catch (\Throwable $e) {
            Log::warning('Signal enrichment job failed', [
                'signal_id' => $this->signalId,
                'error' => $e->getMessage(),
            ]);
            $signal->update([
                'enrichment_status' => SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND,
                'enrichment_attempted_at' => now(),
            ]);
            $this->logFailedNamedPeople($signal, $e->getMessage());
        }
    }

    private function logFailedNamedPeople(SocialSignal $signal, string $error): void
    {
        $named = is_array($signal->named_people) ? $signal->named_people : [];
        $named = array_values(array_filter(array_map(
            static fn ($name) => trim((string) $name),
            $named,
        ), static fn ($name) => $name !== ''));

        if ($named === []) {
            $fallback = trim((string) ($signal->profile_name ?? ''));
            if ($fallback !== '' && ! in_array(mb_strtolower($fallback), ['unknown', 'social prospect'], true)) {
                $named = [$fallback];
            }
        }

        $tracker = app(EnrichmentUsageTracker::class);
        foreach ($named as $index => $personName) {
            $tracker->logEnrichment(
                $signal->organization,
                'error',
                'contact_enrichment',
                false,
                false,
                0,
                $personName,
                $signal->lead_id,
                ['outcome' => 'not_found', 'error' => $error],
                $signal->id,
                $index,
            );
        }
    }
}
