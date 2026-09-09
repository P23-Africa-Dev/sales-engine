<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\User;

readonly class OutboundIdentity
{
    public function __construct(
        public string $fromEmail,
        public string $fromName,
        public string $replyTo,
        public string $senderType,
    ) {}
}

class OutreachIdentityResolver
{
    public function resolve(Organization $organization, User $user): OutboundIdentity
    {
        $identity = OutreachIdentity::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();

        $senderMode = $identity?->sender_mode ?? 'platform';
        $replyTo = $identity?->reply_to_email ?? $user->email;

        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if ($senderMode === 'organization' && $domainAuth?->isVerified()) {
            return new OutboundIdentity(
                fromEmail: $domainAuth->from_email,
                fromName: $user->name,
                replyTo: $replyTo,
                senderType: 'organization',
            );
        }

        $platformFrom = (string) config('services.sendgrid.platform_from_email', 'outreach@thefactory23.com');

        return new OutboundIdentity(
            fromEmail: $platformFrom,
            fromName: $user->name,
            replyTo: $replyTo,
            senderType: 'platform',
        );
    }
}
