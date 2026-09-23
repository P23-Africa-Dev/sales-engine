<?php

namespace App\Services\Outreach;

use App\Jobs\SendOutreachEmailJob;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\User;
use App\Services\Outreach\Transport\MailboxOutreachTransport;
use App\Services\Outreach\Transport\SendGridOutreachTransport;
use InvalidArgumentException;
use RuntimeException;

class OutreachSendService
{
    public function __construct(
        private readonly OutreachIdentityResolver $identityResolver,
        private readonly OutreachQuotaService $quota,
        private readonly DomainIntegrityService $integrity,
        private readonly SendGridOutreachTransport $sendGrid,
        private readonly MailboxOutreachTransport $mailbox,
    ) {}

    /**
     * Validate, mark queued, and dispatch async send. Returns immediately.
     *
     * @return array{message_id: ?string, sent: bool, queued: bool, delivery_status: string}
     */
    public function queueEmail(
        Organization $organization,
        User $user,
        string $toEmail,
        string $subject,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toEmail = trim($toEmail);
        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $this->assertNotSuppressed($organization, $toEmail);

        $identity = $this->identityResolver->resolve($organization, $user);
        $this->assertSenderAllowed($organization, $identity);
        $this->quota->assertCanSend($organization, $identity->senderType);

        if ($activity) {
            $activity->update([
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
                'sender_type' => $identity->senderType,
                'delivery_status' => 'queued',
                'meta' => array_merge($activity->meta ?? [], ['queued' => true]),
            ]);
        }

        SendOutreachEmailJob::dispatch(
            organizationId: $organization->id,
            userId: $user->id,
            toEmail: $toEmail,
            subject: $subject,
            body: $body,
            activityId: $activity?->id,
        );

        return [
            'message_id' => null,
            'sent' => false,
            'queued' => true,
            'delivery_status' => 'queued',
        ];
    }

    /**
     * Synchronous send used by the queue worker (and tests that call sendEmail directly).
     *
     * @return array{message_id: ?string, sent: bool, queued?: bool, delivery_status?: string}
     */
    public function sendEmail(
        Organization $organization,
        User $user,
        string $toEmail,
        string $subject,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toEmail = trim($toEmail);
        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $this->assertNotSuppressed($organization, $toEmail);

        $identity = $this->identityResolver->resolve($organization, $user);
        $this->assertSenderAllowed($organization, $identity);
        $this->quota->assertCanSend($organization, $identity->senderType);

        $customArgs = array_filter([
            'organization_id' => (string) $organization->id,
            'activity_id' => $activity?->id ? (string) $activity->id : null,
            'sender_type' => $identity->senderType,
        ], fn ($v) => $v !== null);

        $transport = $identity->senderType === 'connected_mailbox' ? $this->mailbox : $this->sendGrid;

        try {
            $result = $transport->send($identity, $toEmail, $subject, $body, $customArgs);
        } catch (\Throwable $e) {
            if ($activity) {
                $activity->update([
                    'delivery_status' => 'failed',
                    'bounce_reason' => mb_substr($e->getMessage(), 0, 500),
                    'meta' => array_merge($activity->meta ?? [], ['send_error' => $e->getMessage()]),
                ]);
            }
            throw $e;
        }

        $this->quota->recordSend($organization, $identity->senderType);

        if ($activity) {
            $activity->update([
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
                'sent_at' => now(),
                'sendgrid_message_id' => $identity->senderType === 'connected_mailbox'
                    ? ($activity->sendgrid_message_id)
                    : ($result['message_id'] ?? null),
                'sender_type' => $identity->senderType,
                'delivery_status' => 'sent',
                'bounce_reason' => null,
                'meta' => array_merge($activity->meta ?? [], [
                    'sent' => true,
                    'provider_message_id' => $result['message_id'] ?? null,
                ]),
            ]);
        }

        return [
            'message_id' => $result['message_id'] ?? null,
            'sent' => true,
            'queued' => false,
            'delivery_status' => 'sent',
        ];
    }

    private function assertSenderAllowed(Organization $organization, OutboundIdentity $identity): void
    {
        if ($identity->senderType === 'organization') {
            $domain = \App\Models\OutreachDomainAuthentication::query()
                ->where('organization_id', $organization->id)
                ->first();

            if (! $this->integrity->allowsOrganizationSending($domain)) {
                throw new InvalidArgumentException(
                    'Organization domain does not meet integrity requirements. Fix the checklist in email settings or switch to platform sending.'
                );
            }
        }

        if ($identity->senderType === 'connected_mailbox' && ! $identity->mailboxId) {
            throw new InvalidArgumentException('Connect a mailbox before sending as yourself.');
        }

        if ($identity->senderType !== 'connected_mailbox') {
            $apiKey = trim((string) config('services.sendgrid.api_key'));
            if ($apiKey === '') {
                throw new RuntimeException('SENDGRID_API_KEY is not configured.');
            }
        }
    }

    private function assertNotSuppressed(Organization $organization, string $toEmail): void
    {
        $suppressed = OutreachSuppression::query()
            ->where('email', mb_strtolower($toEmail))
            ->where(function ($query) use ($organization) {
                $query->whereNull('organization_id')->orWhere('organization_id', $organization->id);
            })
            ->exists();

        if ($suppressed) {
            throw new InvalidArgumentException(
                'This recipient is suppressed (bounce, spam complaint, or unsubscribe) and cannot be emailed.'
            );
        }
    }
}
