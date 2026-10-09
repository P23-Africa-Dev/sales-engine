<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachInbox;
use App\Services\Outreach\Transport\SendGridOutreachTransport;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use RuntimeException;

class OutreachInboxService
{
    public function __construct(private readonly SendGridOutreachTransport $sendGrid) {}

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, OutreachInbox>
     */
    public function list(Organization $organization)
    {
        return OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('is_default')
            ->orderBy('email')
            ->get();
    }

    public function createAndSendConfirmation(
        Organization $organization,
        string $email,
        ?string $displayName = null,
    ): OutreachInbox {
        $email = mb_strtolower(trim($email));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid inbox email address.');
        }

        $domain = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $domain || ! filled($domain->domain)) {
            throw new InvalidArgumentException('Connect and authenticate your organization domain before adding inboxes.');
        }

        $this->assertEmailMatchesDomain($email, $domain->domain);

        $existing = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->where('email', $email)
            ->first();

        if ($existing?->isConfirmed()) {
            throw new InvalidArgumentException('This inbox is already confirmed.');
        }

        $code = (string) random_int(100000, 999999);
        $inbox = OutreachInbox::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'email' => $email,
            ],
            [
                'display_name' => $displayName ?: $organization->name,
                'status' => 'pending',
                'confirmation_code_hash' => Hash::make($code),
                'confirmation_sent_at' => now(),
                'confirmed_at' => null,
                'is_default' => ! OutreachInbox::query()
                    ->where('organization_id', $organization->id)
                    ->where('status', 'confirmed')
                    ->exists(),
            ]
        );

        $this->sendConfirmationCode($inbox, $code);

        return $inbox->refresh();
    }

    public function confirm(Organization $organization, int $inboxId, string $code): OutreachInbox
    {
        $inbox = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->find($inboxId);

        if (! $inbox) {
            throw new InvalidArgumentException('Inbox not found.');
        }

        if ($inbox->isConfirmed()) {
            return $inbox;
        }

        if (! filled($inbox->confirmation_code_hash) || ! Hash::check(trim($code), $inbox->confirmation_code_hash)) {
            throw new InvalidArgumentException('That confirmation code is incorrect.');
        }

        if ($inbox->confirmation_sent_at && $inbox->confirmation_sent_at->lt(now()->subHours(24))) {
            throw new InvalidArgumentException('That confirmation code has expired. Request a new one.');
        }

        $hasDefault = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->where('status', 'confirmed')
            ->where('is_default', true)
            ->exists();

        $inbox->update([
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'confirmation_code_hash' => null,
            'is_default' => $hasDefault ? $inbox->is_default : true,
        ]);

        return $inbox->refresh();
    }

    public function resendConfirmation(Organization $organization, int $inboxId): OutreachInbox
    {
        $inbox = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->find($inboxId);

        if (! $inbox) {
            throw new InvalidArgumentException('Inbox not found.');
        }

        if ($inbox->isConfirmed()) {
            throw new InvalidArgumentException('This inbox is already confirmed.');
        }

        $code = (string) random_int(100000, 999999);
        $inbox->update([
            'confirmation_code_hash' => Hash::make($code),
            'confirmation_sent_at' => now(),
        ]);

        $this->sendConfirmationCode($inbox->refresh(), $code);

        return $inbox->refresh();
    }

    public function destroy(Organization $organization, int $inboxId): void
    {
        $inbox = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->find($inboxId);

        if (! $inbox) {
            return;
        }

        $wasDefault = $inbox->is_default;
        $inbox->delete();

        if ($wasDefault) {
            $next = OutreachInbox::query()
                ->where('organization_id', $organization->id)
                ->where('status', 'confirmed')
                ->orderBy('id')
                ->first();
            $next?->update(['is_default' => true]);
        }
    }

    public function setDefault(Organization $organization, int $inboxId): OutreachInbox
    {
        $inbox = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->where('status', 'confirmed')
            ->find($inboxId);

        if (! $inbox) {
            throw new InvalidArgumentException('Confirmed inbox not found.');
        }

        OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->update(['is_default' => false]);

        $inbox->update(['is_default' => true]);

        return $inbox->refresh();
    }

    public function resolveForSend(Organization $organization, ?int $inboxId = null): OutreachInbox
    {
        $query = OutreachInbox::query()
            ->where('organization_id', $organization->id)
            ->where('status', 'confirmed');

        if ($inboxId) {
            $inbox = (clone $query)->find($inboxId);
            if (! $inbox) {
                throw new InvalidArgumentException('Select a confirmed inbox before sending.');
            }

            return $inbox;
        }

        $confirmed = $query->orderByDesc('is_default')->orderBy('id')->get();
        if ($confirmed->isEmpty()) {
            throw new InvalidArgumentException(
                'Confirm at least one organization inbox in email settings before sending outreach.'
            );
        }

        if ($confirmed->count() === 1) {
            return $confirmed->first();
        }

        $default = $confirmed->firstWhere('is_default', true);
        if ($default) {
            return $default;
        }

        throw new InvalidArgumentException('Select which inbox to send from.');
    }

    private function sendConfirmationCode(OutreachInbox $inbox, string $code): void
    {
        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            throw new RuntimeException('SENDGRID_API_KEY is not configured.');
        }

        $platformFrom = (string) config('services.sendgrid.platform_from_email', 'outreach@thefactory23.com');
        $identity = new OutboundIdentity(
            fromEmail: $platformFrom,
            fromName: 'Sales Engine',
            replyTo: $platformFrom,
            senderType: 'platform',
        );

        $this->sendGrid->send(
            $identity,
            $inbox->email,
            'Confirm your Sales Engine outreach inbox',
            "Your confirmation code is: {$code}\n\nEnter this code in Sales Engine email settings to confirm {$inbox->email}.\nThis code expires in 24 hours.",
            [
                'organization_id' => (string) $inbox->organization_id,
                'purpose' => 'inbox_confirmation',
            ]
        );
    }

    private function assertEmailMatchesDomain(string $email, string $domain): void
    {
        $domain = mb_strtolower(trim($domain));
        $emailDomain = mb_strtolower(substr($email, strrpos($email, '@') + 1));

        if ($emailDomain !== $domain && ! str_ends_with($emailDomain, '.'.$domain)) {
            throw new InvalidArgumentException("The inbox must be an address on @{$domain}.");
        }
    }
}
