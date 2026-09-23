<?php

namespace App\Services\Outreach\Transport;

use App\Models\OutreachMailbox;
use App\Services\Outreach\Mailbox\MailboxTokenRefresher;
use App\Services\Outreach\OutboundIdentity;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

class MailboxOutreachTransport implements OutreachTransport
{
    public function __construct(private readonly MailboxTokenRefresher $tokens) {}

    public function send(
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
        array $customArgs = [],
    ): array {
        if (! $identity->mailboxId) {
            throw new RuntimeException('No connected mailbox selected for sending.');
        }

        $mailbox = OutreachMailbox::query()->find($identity->mailboxId);
        if (! $mailbox || ! $mailbox->isConnected()) {
            throw new RuntimeException('Connected mailbox is unavailable. Reconnect it in email settings.');
        }

        return match ($mailbox->provider) {
            'google' => $this->sendGoogle($mailbox, $identity, $toEmail, $subject, $body),
            'microsoft' => $this->sendMicrosoft($mailbox, $identity, $toEmail, $subject, $body),
            'zoho' => $this->sendZoho($mailbox, $identity, $toEmail, $subject, $body),
            'smtp' => $this->sendSmtp($mailbox, $identity, $toEmail, $subject, $body),
            default => throw new RuntimeException('Unsupported mailbox provider: '.$mailbox->provider),
        };
    }

    private function sendGoogle(
        OutreachMailbox $mailbox,
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
    ): array {
        $accessToken = $this->tokens->accessToken($mailbox);
        $raw = $this->buildMime($identity->fromEmail, $identity->fromName, $toEmail, $subject, $body);
        $encoded = rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

        $response = Http::timeout(30)
            ->withToken($accessToken)
            ->post('https://www.googleapis.com/gmail/v1/users/me/messages/send', [
                'raw' => $encoded,
            ]);

        if (! $response->successful()) {
            $this->markError($mailbox, 'Gmail send failed: '.$response->body());
            throw new RuntimeException('Gmail send failed: '.$response->body());
        }

        return [
            'message_id' => $response->json('id'),
            'sent' => true,
        ];
    }

    private function sendMicrosoft(
        OutreachMailbox $mailbox,
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
    ): array {
        $accessToken = $this->tokens->accessToken($mailbox);

        $response = Http::timeout(30)
            ->withToken($accessToken)
            ->post('https://graph.microsoft.com/v1.0/me/sendMail', [
                'message' => [
                    'subject' => $subject,
                    'body' => [
                        'contentType' => 'HTML',
                        'content' => nl2br(e($body), false),
                    ],
                    'toRecipients' => [[
                        'emailAddress' => ['address' => $toEmail],
                    ]],
                    'from' => [
                        'emailAddress' => [
                            'address' => $identity->fromEmail,
                            'name' => $identity->fromName,
                        ],
                    ],
                ],
                'saveToSentItems' => true,
            ]);

        if (! $response->successful() && $response->status() !== 202) {
            $this->markError($mailbox, 'Microsoft send failed: '.$response->body());
            throw new RuntimeException('Microsoft send failed: '.$response->body());
        }

        return [
            'message_id' => $response->header('request-id') ?: null,
            'sent' => true,
        ];
    }

    private function sendZoho(
        OutreachMailbox $mailbox,
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
    ): array {
        $accessToken = $this->tokens->accessToken($mailbox);
        $dc = (string) ($mailbox->provider_metadata['datacenter'] ?? config('outreach.mailbox.zoho.datacenter', 'com'));
        $accountId = (string) ($mailbox->provider_metadata['zoho_account_id'] ?? '');
        if ($accountId === '') {
            throw new RuntimeException('Zoho account id is missing. Reconnect the mailbox.');
        }

        $apiBase = match ($dc) {
            'eu' => 'https://mail.zoho.eu/api',
            'in' => 'https://mail.zoho.in/api',
            'au' => 'https://mail.zoho.com.au/api',
            'jp' => 'https://mail.zoho.jp/api',
            default => 'https://mail.zoho.com/api',
        };

        $response = Http::timeout(30)
            ->withToken($accessToken)
            ->post("{$apiBase}/accounts/{$accountId}/messages", [
                'fromAddress' => $identity->fromEmail,
                'toAddress' => $toEmail,
                'subject' => $subject,
                'content' => nl2br(e($body), false),
                'mailFormat' => 'html',
            ]);

        if (! $response->successful()) {
            $this->markError($mailbox, 'Zoho send failed: '.$response->body());
            throw new RuntimeException('Zoho send failed: '.$response->body());
        }

        return [
            'message_id' => (string) ($response->json('data.messageId') ?? $response->json('messageId') ?? ''),
            'sent' => true,
        ];
    }

    private function sendSmtp(
        OutreachMailbox $mailbox,
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
    ): array {
        $mailerName = 'outreach_mailbox_'.$mailbox->id;
        config([
            "mail.mailers.{$mailerName}" => [
                'transport' => 'smtp',
                'host' => $mailbox->smtp_host,
                'port' => $mailbox->smtp_port,
                'encryption' => $mailbox->smtp_encryption ?: null,
                'username' => $mailbox->smtp_username,
                'password' => $mailbox->smtp_password,
                'timeout' => 30,
            ],
        ]);

        try {
            Mail::mailer($mailerName)->html(nl2br(e($body), false), function ($message) use ($identity, $toEmail, $subject) {
                $message->from($identity->fromEmail, $identity->fromName)
                    ->to($toEmail)
                    ->subject($subject)
                    ->replyTo($identity->replyTo, $identity->fromName);
            });
        } catch (\Throwable $e) {
            $this->markError($mailbox, $e->getMessage());
            throw new RuntimeException('SMTP send failed: '.$e->getMessage(), 0, $e);
        }

        return [
            'message_id' => null,
            'sent' => true,
        ];
    }

    private function buildMime(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $body,
    ): string {
        $boundary = 'b_'.bin2hex(random_bytes(8));
        $from = sprintf('"%s" <%s>', addslashes($fromName), $fromEmail);
        $html = nl2br(e($body), false);

        return implode("\r\n", [
            "From: {$from}",
            "To: {$toEmail}",
            "Subject: {$subject}",
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
            '',
            "--{$boundary}",
            'Content-Type: text/plain; charset=UTF-8',
            '',
            $body,
            "--{$boundary}",
            'Content-Type: text/html; charset=UTF-8',
            '',
            $html,
            "--{$boundary}--",
        ]);
    }

    private function markError(OutreachMailbox $mailbox, string $message): void
    {
        $mailbox->update([
            'status' => 'error',
            'last_error' => mb_substr($message, 0, 500),
            'last_error_at' => now(),
        ]);
    }
}
