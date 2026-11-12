<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OpportunityResource;
use App\Models\SocialSignal;
use App\Services\IcpFiltering\IcpQualifier;
use App\Support\OrgContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The product overview's deliverable: verified company events whose company fits the ICP
 * (qualified or partly verified), each with its contact and contact status.
 */
class OpportunityController extends Controller
{
    /**
     * Columns of the CSV, as the overview's output table plus the evidence behind each row.
     */
    private const EXPORT_COLUMNS = [
        'Company' => 'company',
        'Signal' => 'signal',
        'Detail' => 'detail',
        'Territory' => 'territory',
        'Signal date' => 'signalDate',
        'Source URL' => 'sourceUrl',
        'ICP status' => 'icpStatus',
        'Industry' => 'companyProfile.industry',
        'Company size' => 'companyProfile.size',
        'Headquarters' => 'companyProfile.headquarters',
        'Contact' => 'contact.name',
        'Role' => 'contact.role',
        'Email' => 'contact.email',
        'Email status' => 'contact.emailStatus',
        'Phone' => 'contact.phone',
        'LinkedIn' => 'contact.linkedinUrl',
        'Contact status' => 'contactStatus',
    ];

    public function index(Request $request): JsonResponse
    {
        $page = $this->query($request)->paginate(min(100, max(1, (int) $request->query('per_page', 25))));

        return response()->json([
            'data' => OpportunityResource::collection($page->getCollection())->resolve($request),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $query = $this->query($request);

        return response()->streamDownload(function () use ($query, $request) {
            $stream = fopen('php://output', 'w');
            fputcsv($stream, array_keys(self::EXPORT_COLUMNS), ',', '"', '');
            foreach ($query->lazy(200) as $signal) {
                $record = (new OpportunityResource($signal))->resolve($request);
                $row = array_map(function (string $path) use ($record): string {
                    $value = (string) (data_get($record, $path) ?? '');

                    // Spreadsheet formula injection guard, as in the CRM export.
                    return preg_match('/^[=+@\-\t\r]/', $value) ? "'".$value : $value;
                }, array_values(self::EXPORT_COLUMNS));
                fputcsv($stream, $row, ',', '"', '');
            }
            fclose($stream);
        }, 'opportunities.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * @return Builder<SocialSignal>
     */
    private function query(Request $request): Builder
    {
        $data = $request->validate([
            'icp_status' => ['sometimes', 'in:qualified,partial'],
            'contact_status' => ['sometimes', 'in:enriched,company_only,no_contact_found,searching'],
            'signal_type' => ['sometimes', 'string', 'max:64'],
            'icp_profile_id' => ['sometimes', 'integer'],
            'since' => ['sometimes', 'date'],
        ]);
        $org = OrgContext::require();

        return SocialSignal::query()
            ->where('organization_id', $org->id)
            ->whereNotNull('signal_type_key')
            ->whereNotIn('status', SocialSignal::HIDDEN_STATUSES)
            ->whereIn('meta->icp_status', isset($data['icp_status']) ? [$data['icp_status']] : [IcpQualifier::QUALIFIED, IcpQualifier::PARTIAL])
            ->where('meta->opportunity', true)
            ->when(isset($data['signal_type']), fn (Builder $q) => $q->where('signal_type_key', $data['signal_type']))
            ->when(isset($data['icp_profile_id']), fn (Builder $q) => $q->where('icp_profile_id', $data['icp_profile_id']))
            ->when(isset($data['since']), fn (Builder $q) => $q->where('posted_at', '>=', $data['since']))
            ->when(isset($data['contact_status']), function (Builder $q) use ($data): void {
                $data['contact_status'] === OpportunityResource::CONTACT_SEARCHING
                    ? $q->whereNull('meta->contact_status')
                    : $q->where('meta->contact_status', $data['contact_status']);
            })
            ->orderByDesc('posted_at')
            ->orderByDesc('id');
    }
}
