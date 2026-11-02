<?php

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use App\Models\PlatformAdmin;
use Illuminate\Database\Eloquent\Model;

class AdminAuditLogger
{
    /**
     * @param  array<string, mixed>|null  $meta
     */
    public function log(
        PlatformAdmin $admin,
        string $action,
        ?string $reason = null,
        ?int $organizationId = null,
        ?Model $subject = null,
        ?array $meta = null,
    ): AdminAuditEvent {
        return AdminAuditEvent::query()->create([
            'platform_admin_id' => $admin->id,
            'organization_id' => $organizationId,
            'action' => $action,
            'reason' => $reason,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'meta' => $meta,
        ]);
    }
}
