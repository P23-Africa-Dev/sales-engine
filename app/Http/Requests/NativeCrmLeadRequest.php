<?php

namespace App\Http\Requests;

use App\Support\OrgContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class NativeCrmLeadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $org = OrgContext::require()->id;

        return [
            'name' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:255'],
            'pipeline_id' => ['sometimes', 'integer', Rule::exists('crm_pipelines', 'id')->where('organization_id', $org)],
            'status' => ['sometimes', 'string', Rule::exists('crm_stages', 'slug')->where('organization_id', $org)],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('organization_users', 'user_id')->where('organization_id', $org)],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'], 'company_email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:64'], 'location' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'company_name' => ['sometimes', 'nullable', 'string', 'max:255'], 'position' => ['sometimes', 'nullable', 'string', 'max:255'],
            'website' => ['sometimes', 'nullable', 'url:http,https', 'max:2048'],
            'profile_urls' => ['sometimes', 'nullable', 'array', 'max:20'], 'profile_urls.*' => ['url:http,https', 'max:2048'],
            'source' => ['sometimes', 'nullable', 'string', 'max:64'], 'summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'priority' => ['sometimes', 'in:low,medium,high,urgent'], 'budget_amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999999999999'],
            'budget_currency' => ['sometimes', 'nullable', 'string', 'size:3'],
            'next_action' => ['sometimes', 'nullable', 'string', 'max:5000'], 'last_interaction' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'last_interaction_at' => ['sometimes', 'nullable', 'date'], 'converted_at' => ['sometimes', 'nullable', 'date'],
            'contacts' => ['sometimes', 'array', 'max:50'], 'contacts.*.name' => ['required', 'string', 'max:255'],
            'contacts.*.email' => ['nullable', 'email', 'max:255'], 'contacts.*.phone' => ['nullable', 'string', 'max:64'],
            'contacts.*.location' => ['nullable', 'string', 'max:1000'], 'contacts.*.sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
