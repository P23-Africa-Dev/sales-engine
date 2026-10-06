<?php

namespace Database\Factories;

use App\Models\CrmEntry;
use App\Models\CrmNote;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<CrmNote>
 */
class CrmNoteFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::query()->create(['name' => fake()->company(), 'slug' => (string) Str::uuid()])->id, 'lead_id' => fn (array $attributes) => CrmEntry::factory()->create(['organization_id' => $attributes['organization_id']])->lead_id, 'note' => fake()->sentence(),
        ];
    }
}
