<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachInbox;
use App\Models\User;
use InvalidArgumentException;

class OutreachIdentityResolver
{
    public function __construct(private readonly OutreachInboxService $inboxes) {}

    /**
     * Resolve From/Reply-To for customer outreach. Always uses a confirmed inbox
     * on an integrity-passing organization domain. Never falls back to platform
     * or send-through-mailbox for bulk outreach.
     */
    public function resolve(Organization $organization, User $user, ?int $inboxId = null): OutboundIdentity
    {
        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! app(DomainIntegrityService::class)->allowsOrganizationSending($domainAuth)) {
            throw new InvalidArgumentException(
                'Authenticate your organization domain and pass the integrity checklist before sending outreach.'
            );
        }

        $inbox = $this->inboxes->resolveForSend($organization, $inboxId);

        $identity = OutreachIdentity::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();

        // Persist preferred default inbox for this user when they pick one.
        if ($inboxId && $identity) {
            $identity->update([
                'sender_mode' => 'organization',
                'reply_to_email' => $inbox->email,
            ]);
        } elseif (! $identity) {
            OutreachIdentity::query()->create([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'sender_mode' => 'organization',
                'reply_to_email' => $inbox->email,
            ]);
        }

        return new OutboundIdentity(
            fromEmail: $inbox->email,
            fromName: $inbox->display_name ?: $user->name,
            replyTo: $inbox->email,
            senderType: 'organization',
            mailboxId: null,
            inboxId: $inbox->id,
        );
    }

    public function setupStatus(Organization $organization): array
    {
        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        $confirmedCount = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->where('status', 'confirmed')
            ->count();

        $canSend = app(DomainIntegrityService::class)->allowsOrganizationSending($domainAuth)
            && $confirmedCount > 0;

        return [
            'can_send' => $canSend,
            'domain_connected' => (bool) $domainAuth,
            'domain_verified' => (bool) $domainAuth?->isVerified(),
            'integrity_status' => $domainAuth?->integrity_status,
            'confirmed_inbox_count' => $confirmedCount,
            'blocking_reasons' => $this->blockingReasons($domainAuth, $confirmedCount),
        ];
    }

    /**
     * @return list<string>
     */
    private function blockingReasons(?OutreachDomainAuthentication $domainAuth, int $confirmedCount): array
    {
        $reasons = [];

        if (! $domainAuth) {
            $reasons[] = 'Connect your organization domain.';
        } elseif (! $domainAuth->isVerified()) {
            $reasons[] = 'Verify your domain DNS records with SendGrid.';
        } elseif (! in_array($domainAuth->integrity_status, ['pass', 'warn'], true)) {
            $reasons[] = 'Fix domain integrity checks (DMARC, MX, business domain).';
        }

        if ($confirmedCount < 1) {
            $reasons[] = 'Confirm at least one inbox on your domain.';
        }

        return $reasons;
    }
}
