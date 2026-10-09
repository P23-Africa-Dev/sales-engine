<?php

namespace App\Http\Resources;

use App\Models\Lead;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Lead */
class LeadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $meta = is_array($this->meta) ? $this->meta : [];
        $profileUrls = is_array($meta['profile_urls'] ?? null)
            ? array_values(array_filter($meta['profile_urls'], fn ($u) => is_string($u) && trim($u) !== ''))
            : [];
        $email = trim((string) ($meta['email'] ?? ''));
        $phone = trim((string) ($meta['phone'] ?? ''));
        $linkedinUrl = trim((string) ($meta['linkedin_url'] ?? ($profileUrls[0] ?? '')));
        $title = trim((string) ($meta['title'] ?? ''));
        $company = trim((string) ($meta['company'] ?? ''));
        $entityType = $this->resource->leadType() === 'individual' ? 'person' : 'company';
        $contactPerson = trim((string) ($meta['contact_person'] ?? ''));
        $contactReady = array_key_exists('contact_ready', $meta)
            ? (bool) $meta['contact_ready']
            : ($email !== '' || $phone !== '' || $linkedinUrl !== '' || $profileUrls !== [] || ($title !== '' && $company !== ''));
        // Tri-state (not_attempted|found|not_found) — additive alongside contact_ready,
        // which stays for backward compatibility. Null (not a 4th state) on leads
        // created before this field existed — never guessed for those.
        $contactStatus = in_array($meta['contact_status'] ?? null, ['not_attempted', 'found', 'not_found'], true)
            ? $meta['contact_status']
            : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'source' => $this->source,
            'score' => $this->score !== null ? (int) round((float) $this->score) : null,
            'summary' => $this->summary,
            'stage' => $this->stage,
            'company_id' => $this->company_id,
            'icp_profile_id' => $this->icp_profile_id,
            'entity_type' => $entityType,
            'lead_type' => $this->resource->leadType(),
            'title' => $title !== '' ? $title : null,
            'company' => $company !== '' ? $company : null,
            'contact_person' => $contactPerson !== '' ? $contactPerson : null,
            'location' => isset($meta['location']) ? (string) $meta['location'] : null,
            'website' => isset($meta['website']) ? (string) $meta['website'] : null,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
            'linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null,
            'profile_urls' => $profileUrls,
            'source_url' => isset($meta['source_url']) && trim((string) $meta['source_url']) !== ''
                ? trim((string) $meta['source_url'])
                : null,
            'contact_ready' => $contactReady,
            'contact_status' => $contactStatus,
            'contact_enrichment_tier' => isset($meta['contact_enrichment_tier']) && trim((string) $meta['contact_enrichment_tier']) !== ''
                ? trim((string) $meta['contact_enrichment_tier'])
                : null,
            'contact_enrichment_provider' => isset($meta['contact_enrichment_provider']) && trim((string) $meta['contact_enrichment_provider']) !== ''
                ? trim((string) $meta['contact_enrichment_provider'])
                : null,
            'icp_relevance_reason' => isset($meta['icp_relevance_reason']) && trim((string) $meta['icp_relevance_reason']) !== ''
                ? trim((string) $meta['icp_relevance_reason'])
                : null,
            'save_status' => $this->save_status,
            'native_crm_saved' => $this->relationLoaded('crmEntry') ? $this->crmEntry !== null : $this->crmEntry()->exists(),
            'native_crm_lead_id' => $meta['native_crm_lead_id'] ?? null,
            'crm_synced' => filled($this->synced_to_f23_at),
            'crm_duplicate' => filled($this->crm_duplicate_of),
            'crm_duplicate_reason' => $this->crm_duplicate_reason,
            'crm_fields_updated' => $this->crm_fields_updated ?? [],
            'f23_lead_id' => $this->f23_lead_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
