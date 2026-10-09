<?php

namespace Database\Factories;

use App\Models\CrmPipeline;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<CrmPipeline>
 */
class CrmPipelineFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::query()->create(['name' => fake()->company(), 'slug' => (string) Str::uuid()])->id, 'name' => fake()->unique()->company(), 'currency_code' => 'USD', 'sort_order' => 0, 'is_default' => false,
        ];
    }
}
