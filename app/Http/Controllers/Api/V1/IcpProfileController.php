<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\IcpProfileResource;
use App\Models\IcpProfile;
use App\Services\Icp\IcpProfileService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IcpProfileController extends Controller
{
    public function __construct(private readonly IcpProfileService $icps) {}

    public function index(): JsonResponse
    {
        $profiles = $this->icps->list(OrgContext::require());

        return response()->json([
            'data' => IcpProfileResource::collection($profiles),
        ]);
    }

    public function active(): JsonResponse
    {
        $profile = $this->icps->active(OrgContext::require());

        return response()->json([
            'data' => $profile ? new IcpProfileResource($profile) : null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'config' => ['nullable', 'array'],
            'config.profileName' => ['nullable', 'string', 'max:255'],
            'config.description' => ['nullable', 'string', 'max:2000'],
            'config.industries' => ['nullable', 'array'],
            'config.industries.*' => ['string', 'max:255'],
            'config.companySizes' => ['nullable', 'array'],
            'config.companySizes.*' => ['string', 'max:64'],
            'config.revenueRanges' => ['nullable', 'array'],
            'config.revenueRanges.*' => ['string', 'max:64'],
            'config.territories' => ['nullable', 'array'],
            'config.territories.*' => ['string', 'max:255'],
            'config.decisionMakers' => ['nullable', 'array'],
            'config.decisionMakers.*' => ['string', 'max:255'],
            'config.minMatchScore' => ['nullable', 'integer', 'min:0', 'max:100'],
            'config.autoSyncCrm' => ['nullable', 'boolean'],
            'config.enrichContactDetails' => ['nullable', 'boolean'],
            'config.customPrompt' => ['nullable', 'string', 'max:5000'],
            'config.signalTypePacks' => ['nullable', 'array'],
            'config.signalTypePacks.*' => ['string', 'max:64'],
        ]);

        $profile = $this->icps->create(OrgContext::require(), $data);

        return response()->json([
            'data' => new IcpProfileResource($profile),
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $profile = $this->findOwned($id);

        return response()->json([
            'data' => new IcpProfileResource($profile),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = $this->findOwned($id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'config' => ['sometimes', 'array'],
            'config.profileName' => ['nullable', 'string', 'max:255'],
            'config.description' => ['nullable', 'string', 'max:2000'],
            'config.industries' => ['nullable', 'array'],
            'config.industries.*' => ['string', 'max:255'],
            'config.companySizes' => ['nullable', 'array'],
            'config.companySizes.*' => ['string', 'max:64'],
            'config.revenueRanges' => ['nullable', 'array'],
            'config.revenueRanges.*' => ['string', 'max:64'],
            'config.territories' => ['nullable', 'array'],
            'config.territories.*' => ['string', 'max:255'],
            'config.decisionMakers' => ['nullable', 'array'],
            'config.decisionMakers.*' => ['string', 'max:255'],
            'config.minMatchScore' => ['nullable', 'integer', 'min:0', 'max:100'],
            'config.autoSyncCrm' => ['nullable', 'boolean'],
            'config.enrichContactDetails' => ['nullable', 'boolean'],
            'config.customPrompt' => ['nullable', 'string', 'max:5000'],
            'config.signalTypePacks' => ['nullable', 'array'],
            'config.signalTypePacks.*' => ['string', 'max:64'],
        ]);

        $profile = $this->icps->update($profile, $data);

        return response()->json([
            'data' => new IcpProfileResource($profile),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $profile = $this->findOwned($id);
        $this->icps->delete($profile);

        return response()->json(['message' => 'ICP profile deleted.']);
    }

    public function activate(int $id): JsonResponse
    {
        $profile = $this->findOwned($id);
        $profile = $this->icps->activate($profile);

        return response()->json([
            'data' => new IcpProfileResource($profile),
        ]);
    }

    public function duplicate(int $id): JsonResponse
    {
        $profile = $this->findOwned($id);
        $copy = $this->icps->duplicate($profile);

        return response()->json([
            'data' => new IcpProfileResource($copy),
        ], 201);
    }

    private function findOwned(int $id): IcpProfile
    {
        $org = OrgContext::require();

        return IcpProfile::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();
    }
}
