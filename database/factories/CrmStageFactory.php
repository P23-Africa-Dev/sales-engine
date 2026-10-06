<?php

namespace Database\Factories;

use App\Models\CrmStage;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<CrmStage>
 */
class CrmStageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::query()->create(['name' => fake()->company(), 'slug' => (string) Str::uuid()])->id, 'name' => 'New Lead', 'slug' => 'new', 'color' => '#2563EB', 'sort_order' => 0, 'is_default' => true,
        ];
    }
}
