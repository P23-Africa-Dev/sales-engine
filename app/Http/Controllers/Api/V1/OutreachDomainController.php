<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Outreach\DomainIntegrityService;
use App\Services\Outreach\SendGridDomainAuthService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class OutreachDomainController extends Controller
{
    public function __construct(
        private readonly SendGridDomainAuthService $domainAuth,
        private readonly DomainIntegrityService $integrity,
    ) {}

    public function show(): JsonResponse
    {
        $org = OrgContext::require();
        $record = $this->domainAuth->current($org);

        return response()->json(['data' => $this->format($record)]);
    }

    public function authenticate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'domain' => ['required', 'string', 'max:255'],
            'from_email' => ['required', 'email'],
        ]);

        $org = OrgContext::require();

        try {
            $record = $this->domainAuth->authenticate($org, $data['domain'], $data['from_email']);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json(['data' => $this->format($record)]);
    }

    public function verify(): JsonResponse
    {
        $org = OrgContext::require();

        try {
            $record = $this->domainAuth->verify($org);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        $message = match (true) {
            $record->verification_status === 'verified' && $record->passesIntegrity() =>
                'Domain verified and integrity checks passed. You can send as your organization.',
            $record->verification_status === 'verified' =>
                'Domain verified with SendGrid, but integrity checks need attention before organization sending.',
            default =>
                'DNS records were not detected yet. Propagation can take up to 48 hours. Try again shortly.',
        };

        return response()->json(['data' => $this->format($record), 'message' => $message]);
    }

    public function recheckIntegrity(): JsonResponse
    {
        $org = OrgContext::require();
        $record = $this->domainAuth->current($org);

        if (! $record) {
            return response()->json(['message' => 'No domain connected.'], 422);
        }

        $record = $this->integrity->evaluateAndPersist($record);

        return response()->json(['data' => $this->format($record)]);
    }

    public function destroy(): JsonResponse
    {
        $org = OrgContext::require();
        $this->domainAuth->reset($org);

        return response()->json(['data' => null]);
    }

    private function format(?\App\Models\OutreachDomainAuthentication $record): ?array
    {
        if (! $record) {
            return null;
        }

        return [
            'domain' => $record->domain,
            'from_email' => $record->from_email,
            'dns_records' => $record->dns_records ?? [],
            'verification_status' => $record->verification_status,
            'valid' => $record->valid,
            'verified_at' => $record->verified_at?->toIso8601String(),
            'last_checked_at' => $record->last_checked_at?->toIso8601String(),
            'integrity_status' => $record->integrity_status,
            'integrity_checks' => $record->integrity_checks ?? [],
            'integrity_checked_at' => $record->integrity_checked_at?->toIso8601String(),
        ];
    }
}
