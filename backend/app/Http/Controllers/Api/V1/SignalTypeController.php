<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SignalTypeDefinitionResource;
use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\SignalDetection\SignalTypeRegistry;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SignalTypeController extends Controller
{
    public function __construct(
        private readonly SignalTypeRegistry $registry = new SignalTypeRegistry,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'icpProfileId' => ['nullable', 'integer'],
        ]);

        $org = OrgContext::require();
        $packs = [SignalTypeDefinition::PACK_DEFAULT];

        if (! empty($data['icpProfileId'])) {
            $icp = IcpProfile::query()
                ->where('organization_id', $org->id)
                ->where('id', $data['icpProfileId'])
                ->firstOrFail();
            $packs = IcpBrief::fromIcpProfile($icp)->resolvedSignalTypePacks();
        }

        $types = $packs === []
            ? collect()
            : $this->registry->activeForPacks($org->id, $packs);

        return response()->json([
            'data' => SignalTypeDefinitionResource::collection($types->values()),
        ]);
    }
}
