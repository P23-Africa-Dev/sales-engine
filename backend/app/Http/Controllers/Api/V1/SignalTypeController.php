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
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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

    /**
     * Every type the organisation can edit, built-in and custom, including switched-off ones.
     */
    public function manage(): JsonResponse
    {
        $org = OrgContext::require();

        return response()->json([
            'data' => SignalTypeDefinitionResource::collection($this->registry->allForOrganization($org->id)),
        ]);
    }

    /**
     * A custom signal type of the organisation's own.
     */
    public function store(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $data = $request->validate($this->rules(creating: true));

        $base = mb_substr('custom_'.Str::slug($data['label'], '_'), 0, 56);
        $key = $base;
        for ($n = 2; $this->keyTaken($key, $org->id); $n++) {
            $key = $base.'_'.$n;
        }

        $definition = SignalTypeDefinition::query()->create(array_merge($this->attributes($data), [
            'organization_id' => $org->id,
            'key' => $key,
            'pack' => $data['pack'] ?? SignalTypeDefinition::PACK_DEFAULT,
            'feeds_enrichment' => false,
            'active' => $data['active'] ?? true,
        ]));

        return response()->json(['data' => new SignalTypeDefinitionResource($definition)], 201);
    }

    /**
     * Edit a type. Editing a built-in type saves an organisation copy; the built-in row is
     * never changed, so other organisations are unaffected.
     */
    public function update(Request $request, string $key): JsonResponse
    {
        $org = OrgContext::require();
        $data = $request->validate($this->rules(creating: false));

        $own = SignalTypeDefinition::query()->where('organization_id', $org->id)->where('key', $key)->first();
        if ($own === null) {
            $builtIn = SignalTypeDefinition::query()->whereNull('organization_id')->where('key', $key)->firstOrFail();
            $own = $builtIn->replicate();
            $own->organization_id = $org->id;
        }

        $own->fill($this->attributes($data));
        if (array_key_exists('active', $data)) {
            $own->active = (bool) $data['active'];
        }
        $own->save();

        return response()->json(['data' => new SignalTypeDefinitionResource($own)]);
    }

    /**
     * Remove the organisation's own row: a custom type is deleted, an edited built-in type goes
     * back to the built-in version.
     */
    public function destroy(string $key): JsonResponse
    {
        $org = OrgContext::require();
        SignalTypeDefinition::query()->where('organization_id', $org->id)->where('key', $key)->firstOrFail()->delete();

        return response()->json(['data' => ['key' => $key, 'builtIn' => $this->registry->isBuiltIn($key)]]);
    }

    private function keyTaken(string $key, int $organizationId): bool
    {
        return SignalTypeDefinition::query()
            ->where('key', $key)
            ->where(fn ($query) => $query->whereNull('organization_id')->orWhere('organization_id', $organizationId))
            ->exists();
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'label' => [$required, 'string', 'max:128'],
            'triggerDescription' => [$required, 'string', 'max:2000'],
            'exampleValid' => ['nullable', 'string', 'max:1000'],
            'exampleInvalid' => ['nullable', 'string', 'max:1000'],
            'recencyWindowDays' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'active' => ['sometimes', 'boolean'],
            'pack' => ['sometimes', 'string', Rule::in(array_column(config('icp_options.signal_type_packs', []), 'value'))],
            'targetRoles' => ['nullable', 'array', 'max:8'],
            'targetRoles.*' => ['nullable', 'string', 'max:80'],
            // News phrasings; {industry}, {territory} and {role} are filled from the ICP.
            'searchPhrases' => ['nullable', 'array', 'max:4'],
            'searchPhrases.*' => ['nullable', 'string', 'max:160'],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        $map = [
            'label' => 'label',
            'triggerDescription' => 'trigger_description',
            'exampleValid' => 'example_valid',
            'exampleInvalid' => 'example_invalid',
            'recencyWindowDays' => 'default_recency_window_days',
            'targetRoles' => 'target_roles',
            'searchPhrases' => 'search_phrases',
        ];
        $attributes = [];
        foreach ($map as $input => $column) {
            if (! array_key_exists($input, $data)) {
                continue;
            }
            $value = $data[$input];
            $attributes[$column] = is_array($value)
                // Blank rows from the form are dropped (they arrive as null).
                ? array_values(array_filter(array_map(static fn ($v): string => trim((string) $v), $value), static fn (string $v): bool => $v !== ''))
                : $value;
        }

        return $attributes;
    }
}
