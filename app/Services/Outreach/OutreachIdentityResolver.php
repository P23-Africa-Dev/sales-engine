<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachMailbox;
use App\Models\User;

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

        if ($senderMode === 'connected_mailbox') {
            $mailbox = OutreachMailbox::query()
                ->where('organization_id', $organization->id)
                ->where('user_id', $user->id)
                ->where('status', 'connected')
                ->orderByDesc('id')
                ->first();

            if ($mailbox) {
                return new OutboundIdentity(
                    fromEmail: $mailbox->email,
                    fromName: $user->name,
                    replyTo: $mailbox->email,
                    senderType: 'connected_mailbox',
                    mailboxId: $mailbox->id,
                );
            }
        }

        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if ($senderMode === 'organization' && $domainAuth?->isVerified() && $domainAuth->passesIntegrity()) {
            return new OutboundIdentity(
                fromEmail: $domainAuth->from_email,
                fromName: $user->name,
                replyTo: $replyTo,
                senderType: 'organization',
            );
        }

        // Org mode chosen but integrity failed / unverified: fall back to platform.
        if ($senderMode === 'organization' && $domainAuth?->isVerified() && $domainAuth->integrity_status === null) {
            // Lazy evaluate once so first send after verify still works if checklist not yet stored.
            $integrity = app(DomainIntegrityService::class);
            $domainAuth = $integrity->evaluateAndPersist($domainAuth);
            if ($domainAuth->passesIntegrity()) {
                return new OutboundIdentity(
                    fromEmail: $domainAuth->from_email,
                    fromName: $user->name,
                    replyTo: $replyTo,
                    senderType: 'organization',
                );
            }
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
