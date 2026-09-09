<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Outreach\SendGridDomainAuthService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class OutreachDomainController extends Controller
{
    public function __construct(private readonly SendGridDomainAuthService $domainAuth) {}

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

        $message = $record->verification_status === 'verified'
            ? 'Domain verified. You can now send as your organization.'
            : 'DNS records were not detected yet. Propagation can take up to 48 hours — try again shortly.';

        return response()->json(['data' => $this->format($record), 'message' => $message]);
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
        ];
    }
}
