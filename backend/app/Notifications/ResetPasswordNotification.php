<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(public string $token) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $email = method_exists($notifiable, 'getEmailForPasswordReset')
            ? $notifiable->getEmailForPasswordReset()
            : (string) $notifiable->email;

        $url = rtrim((string) config('app.frontend_url'), '/')
            .'/reset-password/'.$this->token
            .'?email='.urlencode($email);

        return (new MailMessage)
            ->subject('Reset your Sales Engine password')
            ->greeting('Reset your password')
            ->line('We received a request to reset the password for your Sales Engine account.')
            ->action('Choose a new password', $url)
            ->line('This link expires in 60 minutes. If you did not ask for a reset, you can ignore this email.');
    }
}
