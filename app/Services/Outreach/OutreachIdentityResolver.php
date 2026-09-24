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
     * Resolve From/Reply-To for customer outreach.
     *
     * - organization: confirmed inbox on an integrity-passing domain (recommended)
     * - platform: shared SendGrid From; Reply-To defaults to the user's email
     *
     * If organization mode is selected but not ready (and no inbox was requested),
     * falls back to platform so orgs can keep sending while they finish setup.
     */
    public function resolve(Organization $organization, User $user, ?int $inboxId = null): OutboundIdentity
    {
        $identity = OutreachIdentity::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();

        $senderMode = $identity?->sender_mode ?? 'platform';
        $replyTo = $this->normalizeReplyTo($identity?->reply_to_email, $user->email);

        // Explicit inbox pick means organization send.
        if ($inboxId !== null) {
            $senderMode = 'organization';
        }

        if ($senderMode === 'organization') {
            try {
                return $this->resolveOrganization($organization, $user, $inboxId, $replyTo, $identity);
            } catch (InvalidArgumentException $e) {
                if ($inboxId !== null) {
                    throw $e;
                }
                // Org preferred but not ready yet — use platform so outreach still works.
            }
        }

        return $this->resolvePlatform($user, $replyTo);
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

        $canSendOrganization = app(DomainIntegrityService::class)->allowsOrganizationSending($domainAuth)
            && $confirmedCount > 0;

        return [
            // Platform is always available; org path is recommended when ready.
            'can_send' => true,
            'can_send_platform' => true,
            'can_send_organization' => $canSendOrganization,
            'recommended_mode' => 'organization',
            'domain_connected' => (bool) $domainAuth,
            'domain_verified' => (bool) $domainAuth?->isVerified(),
            'integrity_status' => $domainAuth?->integrity_status,
            'confirmed_inbox_count' => $confirmedCount,
            'blocking_reasons' => $this->blockingReasons($domainAuth, $confirmedCount),
        ];
    }

    private function resolveOrganization(
        Organization $organization,
        User $user,
        ?int $inboxId,
        string $replyTo,
        ?OutreachIdentity $identity,
    ): OutboundIdentity {
        $domainAuth = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! app(DomainIntegrityService::class)->allowsOrganizationSending($domainAuth)) {
            throw new InvalidArgumentException(
                'Authenticate your organization domain and pass the integrity checklist before sending as your organization.'
            );
        }

        $inbox = $this->inboxes->resolveForSend($organization, $inboxId);

        if ($inboxId && $identity) {
            $identity->update([
                'sender_mode' => 'organization',
                'reply_to_email' => $replyTo !== '' ? $replyTo : $inbox->email,
            ]);
        } elseif (! $identity) {
            OutreachIdentity::query()->create([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'sender_mode' => 'organization',
                'reply_to_email' => $replyTo !== '' ? $replyTo : $inbox->email,
            ]);
        }

        $effectiveReplyTo = $replyTo !== '' ? $replyTo : $inbox->email;

        return new OutboundIdentity(
            fromEmail: $inbox->email,
            fromName: $inbox->display_name ?: $user->name,
            replyTo: $effectiveReplyTo,
            senderType: 'organization',
            mailboxId: null,
            inboxId: $inbox->id,
        );
    }

    private function resolvePlatform(User $user, string $replyTo): OutboundIdentity
    {
        $platformFrom = (string) config('services.sendgrid.platform_from_email', 'outreach@thefactory23.com');

        return new OutboundIdentity(
            fromEmail: $platformFrom,
            fromName: $user->name,
            replyTo: $replyTo !== '' ? $replyTo : $user->email,
            senderType: 'platform',
            mailboxId: null,
            inboxId: null,
        );
    }

    private function normalizeReplyTo(?string $replyTo, string $fallback): string
    {
        $replyTo = trim((string) $replyTo);
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            return $replyTo;
        }

        return $fallback;
    }

    /**
     * @return list<string>
     */
    private function blockingReasons(?OutreachDomainAuthentication $domainAuth, int $confirmedCount): array
    {
        $reasons = [];

        if (! $domainAuth) {
            $reasons[] = 'Connect your organization domain (recommended for better deliverability).';
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
