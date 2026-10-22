<?php

namespace App\Services\Voice;

use App\Models\CallLog;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;

class VoiceCallService
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.infobip.api_key')) !== ''
            && trim((string) config('services.infobip.base_url')) !== ''
            && trim((string) config('services.infobip.voice_from')) !== '';
    }

    public function clickToCall(Organization $organization, User $user, string $toNumber, ?int $leadId = null): CallLog
    {
        if (! $this->isConfigured()) {
            throw new VoiceNotConfiguredException('Voice calling is not configured.');
        }

        $from = trim((string) config('services.infobip.voice_from'));
        $baseUrl = rtrim(trim((string) config('services.infobip.base_url')), '/');
        $apiKey = trim((string) config('services.infobip.api_key'));

        $response = Http::timeout(30)
            ->withHeaders(['Authorization' => 'App '.$apiKey])
            ->acceptJson()
            ->post($baseUrl.'/calls/1/calls', [
                'endpoint' => [
                    'type' => 'PHONE',
                    'phoneNumber' => ltrim($toNumber, '+'),
                ],
                'from' => $from,
            ]);

        if (! $response->successful()) {
            throw new InvalidArgumentException('Voice call could not be started.');
        }

        $callId = $response->json('id') ?? $response->json('callId');

        return CallLog::query()->create([
            'organization_id' => $organization->id,
            'lead_id' => $leadId,
            'user_id' => $user->id,
            'direction' => 'outbound',
            'from_number' => $from,
            'to_number' => $toNumber,
            'status' => 'queued',
            'provider_call_id' => is_string($callId) ? $callId : null,
            'started_at' => now(),
        ]);
    }
}
