<?php

namespace App\Mail;

use App\Models\OrganizationInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrganizationInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public OrganizationInvitation $invitation, public string $token) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'You are invited to '.$this->invitation->organization->name);
    }

    public function content(): Content
    {
        $url = rtrim((string) config('app.frontend_url'), '/')
            .'/onboarding/internal?token='.urlencode($this->token);

        $name = e($this->invitation->organization->name);

        return new Content(
            htmlString: '<p>You have been invited to join <strong>'.$name.'</strong> on Sales Engine as '.e($this->invitation->role).'.</p><p><a href="'.e($url).'">Accept invitation</a></p>',
        );
    }
}
