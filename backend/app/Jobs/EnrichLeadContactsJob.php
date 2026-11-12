<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\Log;

/**
 * Finds emails/phones for already-persisted leads (website crawl, Serper,
 * Places, pattern inference, then paid providers when configured), writes
 * them into Lead.meta and refreshes the chat message's leads payload.
 */
class EnrichLeadContactsJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 240;

    public int $tries = 1;

    /**
     * @param  list<int>  $leadIds
     */
    public function __construct(
        public int $organizationId,
        public array $leadIds,
        public ?int $chatMessageId = null,
    ) {
        $this->leadIds = array_values(array_unique(array_map('intval', $leadIds)));
        $this->onQueue((string) config('services.contact_finder.queue', 'enrichment'));
    }

    public function handle(): void
    {
        $organization = Organization::query()->find($this->organizationId);
        if (! $organization || $this->leadIds === []) {
            return;
        }

        $leads = Lead::query()
            ->with('company')
            ->where('organization_id', $organization->id)
            ->whereIn('id', $this->leadIds)
            ->get();

        $batchSize = max(1, (int) config('services.contact_finder.batch_size', 4));
        $startedAt = microtime(true);
        // Leave room for the slowest batch so the worker never kills the job mid-write.
        $stopAfterSeconds = max(30, $this->timeout - 75);
        $updatedPayloads = [];
        $handedOff = [];

        foreach ($leads->chunk($batchSize) as $batch) {
            if (microtime(true) - $startedAt > $stopAfterSeconds) {
                $handedOff = array_merge($handedOff, $batch->pluck('id')->all());

                continue;
            }

            $results = $this->enrichBatch($organization->id, $batch->pluck('id')->all());

            foreach ($batch as $lead) {
                $contacts = $results[$lead->id] ?? null;
                // A failed lookup still finishes: "searching" must never be left behind.
                $updatedPayloads[$lead->id] = $this->writeLeadMeta($lead, is_array($contacts) ? $contacts : []);
            }

            if ($this->chatMessageId !== null) {
                // Cards fill in batch by batch instead of all at the end.
                $this->updateChatMessage($organization->id, $updatedPayloads);
            }
        }

        if ($handedOff !== []) {
            self::dispatch($this->organizationId, $handedOff, $this->chatMessageId);
        }
    }

    /**
     * The worker gave up (timeout, crash): settle every lead still marked "searching" so the
     * UI stops polling and shows "not published" instead of "Looking up…" forever.
     */
    public function failed(?\Throwable $exception): void
    {
        Log::warning('Contact enrichment job failed', ['lead_ids' => $this->leadIds, 'error' => $exception?->getMessage()]);

        $updates = [];
        Lead::query()
            ->where('organization_id', $this->organizationId)
            ->whereIn('id', $this->leadIds)
            ->get()
            ->each(function (Lead $lead) use (&$updates): void {
                $meta = is_array($lead->meta) ? $lead->meta : [];
                if (($meta['contact_status'] ?? null) !== 'searching') {
                    return;
                }
                $found = filled($meta['email'] ?? null) || filled($meta['phone'] ?? null);
                $meta['contact_status'] = $found ? 'found' : 'not_found';
                $lead->update(['meta' => $meta]);
                $updates[$lead->id] = ['contact_status' => $meta['contact_status']];
            });

        if ($this->chatMessageId !== null && $updates !== []) {
            $this->updateChatMessage($this->organizationId, $updates);
        }
    }

    /**
     * Runs the waterfall for one lead. Static so it can execute inside a
     * concurrency worker process with only scalars captured.
     *
     * @return array<string, mixed>|null
     */
    public static function enrichLead(int $organizationId, int $leadId): ?array
    {
        $organization = Organization::query()->find($organizationId);
        $lead = Lead::query()->with('company')->where('organization_id', $organizationId)->find($leadId);
        if (! $organization || ! $lead) {
            return null;
        }

        $meta = is_array($lead->meta) ? $lead->meta : [];
        $isIndividual = $lead->leadType() === 'individual';
        $company = trim((string) ($meta['company'] ?? ''));
        if ($company === '' && ! $isIndividual) {
            $company = trim((string) $lead->name);
        }
        $personName = $isIndividual
            ? trim((string) $lead->name)
            : trim((string) ($meta['contact_person'] ?? ''));

        $website = trim((string) ($meta['website'] ?? ''));
        if ($website === '' && $lead->company !== null) {
            $website = trim((string) ($lead->company->website ?? ''));
        }

        // Company leads: find the decision maker here (moved out of the search so results show
        // sooner), then look up that person's contacts below.
        $decisionMaker = [];
        if (! $isIndividual && $personName === '' && $company !== '' && $lead->icp_profile_id) {
            $icp = IcpProfile::query()->where('organization_id', $organizationId)->find($lead->icp_profile_id);
            if ($icp) {
                $profiles = app(LeadProfileEnrichmentService::class);
                $profiles->setDeferContactWaterfall(true);
                $found = $profiles->enrichCompanyDecisionMaker($organization, $icp, $company, IcpBrief::fromIcpProfile($icp), array_filter([
                    'company' => $company,
                    'location' => $meta['location'] ?? null,
                    'title' => $meta['title'] ?? null,
                ]));
                $personName = trim((string) ($found['contact_person'] ?? ''));
                $decisionMaker = array_filter([
                    'contact_person' => $personName,
                    'title' => trim((string) ($found['title'] ?? '')),
                    'linkedin_url' => trim((string) ($found['linkedin_url'] ?? '')),
                ]);
            }
        }

        $contacts = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $organization,
            $personName,
            array_filter([
                'email' => $meta['email'] ?? null,
                'phone' => $meta['phone'] ?? null,
                'company' => $company !== '' ? $company : null,
                'website' => $website !== '' ? $website : null,
                'linkedin_url' => $meta['linkedin_url'] ?? null,
                'profile_urls' => is_array($meta['profile_urls'] ?? null) ? $meta['profile_urls'] : null,
                'location' => $meta['location'] ?? null,
            ], fn ($value) => $value !== null && $value !== '' && $value !== []),
            [],
            $lead->id,
        );

        return $decisionMaker === [] ? $contacts : $contacts + ['decision_maker' => $decisionMaker];
    }

    /**
     * @param  list<int>  $leadIds
     * @return array<int, array<string, mixed>|null>
     */
    private function enrichBatch(int $organizationId, array $leadIds): array
    {
        $tasks = [];
        foreach ($leadIds as $leadId) {
            $tasks[$leadId] = static fn () => self::enrichLead($organizationId, $leadId);
        }

        $driver = (string) config('services.contact_finder.concurrency_driver', 'process');
        if ($driver !== 'sync' && count($tasks) > 1) {
            try {
                return Concurrency::driver($driver)->run($tasks);
            } catch (\Throwable $e) {
                Log::warning('Contact enrichment concurrency failed; running sequentially', [
                    'driver' => $driver,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $results = [];
        foreach ($tasks as $leadId => $task) {
            try {
                $results[$leadId] = $task();
            } catch (\Throwable $e) {
                Log::warning('Contact enrichment failed for lead', ['lead_id' => $leadId, 'error' => $e->getMessage()]);
                $results[$leadId] = null;
            }
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $contacts
     * @return array<string, mixed> Fields to merge into the chat payload entry.
     */
    private function writeLeadMeta(Lead $lead, array $contacts): array
    {
        $lead->refresh();
        $meta = is_array($lead->meta) ? $lead->meta : [];

        // The search stage may have attached an email/phone before any checks ran (a foreign
        // head-office number, another company's mailbox). The checker saw it as a seed; if it
        // did not keep it, it does not belong on this lead.
        if ($contacts !== []) {
            foreach (['email', 'phone'] as $key) {
                $existing = trim((string) ($meta[$key] ?? ''));
                $checked = trim((string) ($contacts[$key] ?? ''));
                if ($existing !== '' && $checked === '') {
                    unset($meta[$key]);
                    if (isset($meta['contact_sources'][$key])) {
                        unset($meta['contact_sources'][$key]);
                    }
                } elseif ($checked !== '') {
                    $meta[$key] = $checked;
                }
            }
        }

        foreach (is_array($contacts['decision_maker'] ?? null) ? $contacts['decision_maker'] : [] as $key => $value) {
            if (trim((string) $value) !== '' && trim((string) ($meta[$key] ?? '')) === '') {
                $meta[$key] = (string) $value;
            }
        }

        foreach (['linkedin_url', 'title', 'company_email', 'company_phone', 'address'] as $key) {
            $value = trim((string) ($contacts[$key] ?? ''));
            if ($value !== '' && trim((string) ($meta[$key] ?? '')) === '') {
                $meta[$key] = $value;
            }
        }

        if (trim((string) ($meta['website'] ?? '')) === '' && filled($contacts['domain'] ?? null)) {
            $meta['website'] = 'https://'.$contacts['domain'];
        }

        $found = trim((string) ($meta['email'] ?? '')) !== '' || trim((string) ($meta['phone'] ?? '')) !== '';
        $meta['contact_sources'] = array_merge(
            is_array($meta['contact_sources'] ?? null) ? $meta['contact_sources'] : [],
            is_array($contacts['contact_sources'] ?? null) ? $contacts['contact_sources'] : [],
        );
        $meta['contact_status'] = $found ? 'found' : 'not_found';
        $meta['contact_ready'] = $found || (bool) ($meta['contact_ready'] ?? false);
        if (filled($contacts['tier'] ?? null)) {
            $meta['contact_enrichment_tier'] = $contacts['tier'];
            $meta['contact_enrichment_provider'] = $contacts['provider'] ?? null;
        }
        $meta['contact_enriched_at'] = now()->toIso8601String();

        $lead->update(['meta' => $meta]);

        return array_filter([
            'email' => $meta['email'] ?? null,
            'phone' => $meta['phone'] ?? null,
            'contact_person' => $meta['contact_person'] ?? null,
            'title' => $meta['title'] ?? null,
            'website' => $meta['website'] ?? null,
            'linkedin_url' => $meta['linkedin_url'] ?? null,
            'company_email' => $meta['company_email'] ?? null,
            'company_phone' => $meta['company_phone'] ?? null,
            'contact_sources' => $meta['contact_sources'],
            'contact_status' => $meta['contact_status'],
            'contact_ready' => $meta['contact_ready'],
            'contact_enrichment_tier' => $meta['contact_enrichment_tier'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');
    }

    /**
     * @param  array<int, array<string, mixed>>  $updates
     */
    private function updateChatMessage(int $organizationId, array $updates): void
    {
        $message = ChatMessage::query()
            ->whereKey($this->chatMessageId)
            ->whereHas('session', fn ($query) => $query->where('organization_id', $organizationId))
            ->first();

        if (! $message || ! is_array($message->leads)) {
            return;
        }

        $leads = $message->leads;
        foreach ($leads as $index => $payload) {
            $leadId = is_array($payload) ? (int) ($payload['id'] ?? 0) : 0;
            if ($leadId !== 0 && isset($updates[$leadId])) {
                $leads[$index] = array_merge($payload, $updates[$leadId]);
            }
        }

        $message->update(['leads' => $leads]);
    }
}
