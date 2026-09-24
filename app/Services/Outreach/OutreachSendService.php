<?php

namespace App\Services\Outreach;

use App\Jobs\SendOutreachEmailJob;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\User;
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
        ?int $inboxId = null,
    ): array {
        $toEmail = trim($toEmail);
        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $this->assertNotSuppressed($organization, $toEmail);

        $identity = $this->identityResolver->resolve($organization, $user, $inboxId);
        $this->assertSenderAllowed($organization, $identity);
        $this->quota->assertCanSend($organization, 'organization');

        if ($activity) {
            $activity->update([
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
                'sender_type' => 'organization',
                'delivery_status' => 'queued',
                'meta' => array_merge($activity->meta ?? [], [
                    'queued' => true,
                    'inbox_id' => $identity->inboxId,
                    'from_email' => $identity->fromEmail,
                ]),
            ]);
        }

        SendOutreachEmailJob::dispatch(
            organizationId: $organization->id,
            userId: $user->id,
            toEmail: $toEmail,
            subject: $subject,
            body: $body,
            activityId: $activity?->id,
            inboxId: $identity->inboxId,
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
        ?int $inboxId = null,
    ): array {
        $toEmail = trim($toEmail);
        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $this->assertNotSuppressed($organization, $toEmail);

        // Prefer inbox stored on the activity when the job retries.
        if ($inboxId === null && $activity) {
            $inboxId = isset($activity->meta['inbox_id']) ? (int) $activity->meta['inbox_id'] : null;
        }

        $identity = $this->identityResolver->resolve($organization, $user, $inboxId);
        $this->assertSenderAllowed($organization, $identity);
        $this->quota->assertCanSend($organization, 'organization');

        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            throw new RuntimeException('SENDGRID_API_KEY is not configured.');
        }

        $customArgs = array_filter([
            'organization_id' => (string) $organization->id,
            'activity_id' => $activity?->id ? (string) $activity->id : null,
            'sender_type' => 'organization',
            'inbox_id' => $identity->inboxId ? (string) $identity->inboxId : null,
        ], fn ($v) => $v !== null);

        try {
            $result = $this->sendGrid->send($identity, $toEmail, $subject, $body, $customArgs);
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

        $this->quota->recordSend($organization, 'organization');

        if ($activity) {
            $activity->update([
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
                'sent_at' => now(),
                'sendgrid_message_id' => $result['message_id'] ?? null,
                'sender_type' => 'organization',
                'delivery_status' => 'sent',
                'bounce_reason' => null,
                'meta' => array_merge($activity->meta ?? [], [
                    'sent' => true,
                    'inbox_id' => $identity->inboxId,
                    'from_email' => $identity->fromEmail,
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
        if ($identity->senderType !== 'organization' || ! $identity->inboxId) {
            throw new InvalidArgumentException(
                'Confirm an organization inbox and pass domain integrity before sending outreach.'
            );
        }

        $domain = \App\Models\OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $this->integrity->allowsOrganizationSending($domain)) {
            throw new InvalidArgumentException(
                'Organization domain does not meet integrity requirements. Fix the checklist in email settings.'
            );
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
