<?php

namespace App\Http\Resources;

use App\Models\SocialSignal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One sales-ready record from the product overview: company, signal, territory, ICP status,
 * contact and contact status, with the source link and date that prove the signal.
 *
 * @mixin SocialSignal
 */
class OpportunityResource extends JsonResource
{
    public const CONTACT_SEARCHING = 'searching';

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $meta = is_array($this->meta) ? $this->meta : [];
        $contact = is_array($meta['contact'] ?? null) ? $meta['contact'] : [];
        $profile = is_array($meta['firmographics'] ?? null) ? $meta['firmographics'] : [];

        return [
            'id' => $this->id,
            'company' => $this->company_name,
            'signal' => $this->intent_label,
            'signalTypeKey' => $this->signal_type_key,
            'detail' => $this->summary,
            'territory' => $this->territory ?: $this->location_text,
            'signalDate' => $this->posted_at?->toDateString(),
            'sourceUrl' => $this->post_url,
            'source' => $this->source_label,
            'icpStatus' => $meta['icp_status'] ?? null,
            'icpChecks' => $meta['icp_dimensions'] ?? [],
            'companyProfile' => [
                'industry' => $profile['industry'] ?? $this->industry,
                'size' => $profile['employee_range'] ?? null,
                'headquarters' => $profile['headquarters'] ?? null,
                'website' => $profile['website'] ?? null,
                'linkedinUrl' => $profile['linkedin_url'] ?? null,
            ],
            'contact' => [
                'name' => $contact['name'] ?? null,
                'role' => $contact['role'] ?? null,
                'email' => $contact['email'] ?? null,
                'emailStatus' => $contact['email_status'] ?? null,
                'phone' => $contact['phone'] ?? null,
                'linkedinUrl' => $contact['linkedin_url'] ?? null,
            ],
            'contactStatus' => self::contactStatus($this->resource),
            'status' => $this->status,
            'savedAsLead' => $this->lead_id !== null,
        ];
    }

    /**
     * enriched | company_only | no_contact_found, or searching while the lookup hasn't finished.
     */
    public static function contactStatus(SocialSignal $signal): string
    {
        $meta = is_array($signal->meta) ? $signal->meta : [];

        return (string) ($meta['contact_status'] ?? self::CONTACT_SEARCHING);
    }
}
