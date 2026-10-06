<?php

namespace Database\Factories;

use App\Models\CrmEntry;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<CrmEntry>
 */
class CrmEntryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::query()->create(['name' => fake()->company(), 'slug' => (string) Str::uuid()])->id, 'lead_id' => fn (array $attributes) => Lead::query()->create(['organization_id' => $attributes['organization_id'], 'name' => fake()->name(), 'stage' => 'new', 'save_status' => 'saved'])->id, 'pipeline_id' => fn (array $attributes) => CrmPipeline::factory()->create(['organization_id' => $attributes['organization_id']])->id, 'stage_id' => fn (array $attributes) => CrmStage::factory()->create(['organization_id' => $attributes['organization_id']])->id, 'priority' => 'medium',
        ];
    }
}
