<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Integrations\Factory23\CrmSyncService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function __construct(private readonly CrmSyncService $crmSync) {}

    public function factory23Status(): JsonResponse
    {
        return response()->json([
            'data' => $this->crmSync->status(OrgContext::require()),
        ]);
    }

    public function factory23CrmSync(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'run' => ['sometimes', 'boolean'],
        ]);

        $org = OrgContext::require();

        if (array_key_exists('enabled', $data)) {
            $org = $this->crmSync->enableForOrganization($org, (bool) $data['enabled']);
        }

        $syncResult = null;
        if (! empty($data['run'])) {
            $syncResult = $this->crmSync->syncQualified($org);
        }

        return response()->json([
            'data' => [
                'status' => $this->crmSync->status($org),
                'sync' => $syncResult,
            ],
        ]);
    }

    public function ensureFactory23CrmLink(Request $request): JsonResponse
    {
        $data = $request->validate([
            'f23_access_token' => ['required', 'string'],
        ]);

        $org = OrgContext::require();
        $result = $this->crmSync->ensureOrganizationToken($org, $data['f23_access_token']);

        return response()->json(['data' => $result]);
    }
}
