<?php

namespace Database\Factories;

use App\Models\CrmActivity;
use App\Models\CrmEntry;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<CrmActivity>
 */
class CrmActivityFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::query()->create(['name' => fake()->company(), 'slug' => (string) Str::uuid()])->id, 'lead_id' => fn (array $attributes) => CrmEntry::factory()->create(['organization_id' => $attributes['organization_id']])->lead_id, 'type' => 'call', 'title' => fake()->sentence(), 'happened_at' => now(),
        ];
    }
}
