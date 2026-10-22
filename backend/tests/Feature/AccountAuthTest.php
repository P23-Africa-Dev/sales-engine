<?php

namespace Tests\Feature;

use App\Mail\EmailVerificationCodeMail;
use App\Models\EmailVerificationCode;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AccountAuthTest extends TestCase
{
    public function test_forgot_password_is_neutral_and_notifies_existing_users(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ada@example.com'])
            ->assertOk()
            ->assertJsonPath('message', 'If that email exists, a reset link has been sent.');

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.com'])
            ->assertOk();

        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_reset_password_rejects_an_invalid_token(): void
    {
        User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'ada@example.com',
            'token' => 'not-a-token',
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
        ])->assertStatus(422);
    }

    public function test_reset_password_updates_the_password_and_revokes_tokens(): void
    {
        $user = User::factory()->create(['email' => 'ada@example.com']);
        $user->createToken('api');
        $token = Password::broker()->createToken($user);

        $this->getJson('/api/v1/auth/reset-password/'.$token.'?email=ada@example.com')
            ->assertOk()
            ->assertJsonPath('data.valid', true);

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'ada@example.com',
            'token' => $token,
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
        ])->assertOk()->assertJsonPath('data.redirect_path', '/login');

        $this->assertTrue(Hash::check('Password1!', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_change_password_requires_the_current_password(): void
    {
        $user = User::factory()->create();
        $this->actingAsOrgMember($user, $this->createUserWithOrg()[1]);

        $this->putJson('/api/v1/auth/password', [
            'current_password' => 'wrong-password',
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
        ])->assertStatus(422);
    }

    public function test_register_queues_a_verification_code(): void
    {
        Mail::fake();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Ada Lovelace',
            'email' => 'new@example.com',
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
            'organization_name' => 'Analytical',
        ])->assertCreated()->assertJsonPath('user.email_verified', false);

        Mail::assertQueued(EmailVerificationCodeMail::class);
    }

    public function test_verify_email_accepts_a_valid_code(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'new@example.com']);
        EmailVerificationCode::query()->create([
            'user_id' => $user->id,
            'code_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'new@example.com',
            'code' => '123456',
        ])->assertOk()->assertJsonPath('data.verified', true);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
