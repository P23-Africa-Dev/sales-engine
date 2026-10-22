<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailVerificationCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $name, public string $code) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Sales Engine verification code');
    }

    public function content(): Content
    {
        return new Content(
            htmlString: '<p>Hi '.e($this->name).',</p><p>Your Sales Engine verification code is <strong>'.e($this->code).'</strong>.</p><p>It expires in 15 minutes.</p>',
        );
    }
}
