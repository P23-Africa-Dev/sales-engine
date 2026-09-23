<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachIdentity;
use App\Models\OutreachMailbox;
use App\Services\Outreach\Mailbox\MailboxOAuthService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class OutreachMailboxController extends Controller
{
    public function __construct(private readonly MailboxOAuthService $oauth) {}

    public function index(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $items = OutreachMailbox::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->where('status', '!=', 'disconnected')
            ->orderByDesc('id')
            ->get()
            ->map(fn (OutreachMailbox $m) => $this->format($m));

        return response()->json(['data' => $items]);
    }

    public function authorizeOAuth(Request $request, string $provider): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        try {
            $started = $this->oauth->begin($provider, $org->id, $user->id);
        } catch (InvalidArgumentException|RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $started]);
    }

    public function oauthCallback(Request $request, string $provider): RedirectResponse
    {
        $frontend = rtrim((string) config('outreach.mailbox.frontend_callback'), '/');

        try {
            $code = (string) $request->query('code', '');
            $state = (string) $request->query('state', '');
            if ($code === '' || $state === '') {
                throw new InvalidArgumentException('Missing OAuth code or state.');
            }

            $result = $this->oauth->complete($provider, $code, $state);

            OutreachMailbox::query()->updateOrCreate(
                [
                    'organization_id' => $result['organization_id'],
                    'user_id' => $result['user_id'],
                    'email' => $result['email'],
                ],
                [
                    'provider' => $result['provider'],
                    'status' => 'connected',
                    'access_token' => $result['access_token'],
                    'refresh_token' => $result['refresh_token'],
                    'token_expires_at' => now()->addSeconds(max(60, $result['expires_in'] - 60)),
                    'scopes' => $result['scopes'],
                    'provider_metadata' => $result['metadata'],
                    'smtp_host' => null,
                    'smtp_port' => null,
                    'smtp_encryption' => null,
                    'smtp_username' => null,
                    'smtp_password' => null,
                    'last_error' => null,
                    'last_error_at' => null,
                ]
            );

            OutreachIdentity::query()->updateOrCreate(
                [
                    'organization_id' => $result['organization_id'],
                    'user_id' => $result['user_id'],
                ],
                [
                    'sender_mode' => 'connected_mailbox',
                    'reply_to_email' => $result['email'],
                ]
            );

            return redirect()->away($frontend.'?status=connected&provider='.urlencode($provider));
        } catch (\Throwable $e) {
            return redirect()->away($frontend.'?status=error&message='.urlencode($e->getMessage()));
        }
    }

    public function connectSmtp(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $data = $request->validate([
            'email' => ['required', 'email'],
            'smtp_host' => ['required', 'string', 'max:255'],
            'smtp_port' => ['required', 'integer', 'min:1', 'max:65535'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl'],
            'smtp_username' => ['required', 'string', 'max:255'],
            'smtp_password' => ['required', 'string', 'max:500'],
        ]);

        $email = mb_strtolower($data['email']);

        $mailbox = OutreachMailbox::query()->updateOrCreate(
            [
                'organization_id' => $org->id,
                'user_id' => $user->id,
                'email' => $email,
            ],
            [
                'provider' => 'smtp',
                'status' => 'connected',
                'access_token' => null,
                'refresh_token' => null,
                'token_expires_at' => null,
                'scopes' => null,
                'provider_metadata' => null,
                'smtp_host' => $data['smtp_host'],
                'smtp_port' => $data['smtp_port'],
                'smtp_encryption' => $data['smtp_encryption'] ?? 'tls',
                'smtp_username' => $data['smtp_username'],
                'smtp_password' => $data['smtp_password'],
                'last_error' => null,
                'last_error_at' => null,
            ]
        );

        OutreachIdentity::query()->updateOrCreate(
            ['organization_id' => $org->id, 'user_id' => $user->id],
            [
                'sender_mode' => 'connected_mailbox',
                'reply_to_email' => $email,
            ]
        );

        return response()->json(['data' => $this->format($mailbox)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $mailbox = OutreachMailbox::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $mailbox) {
            return response()->json(['message' => 'Mailbox not found.'], 404);
        }

        $mailbox->update([
            'status' => 'disconnected',
            'access_token' => null,
            'refresh_token' => null,
            'smtp_password' => null,
        ]);

        OutreachIdentity::query()
            ->where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->where('sender_mode', 'connected_mailbox')
            ->update(['sender_mode' => 'platform']);

        return response()->json(['data' => null]);
    }

    private function format(OutreachMailbox $mailbox): array
    {
        return [
            'id' => $mailbox->id,
            'email' => $mailbox->email,
            'provider' => $mailbox->provider,
            'status' => $mailbox->status,
            'last_error' => $mailbox->last_error,
        ];
    }
}
