<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;

class PasswordResetController extends Controller
{
    public function sendLink(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        Password::sendResetLink(['email' => $request->string('email')->toString()]);

        return response()->json([
            'message' => 'If that email exists, a reset link has been sent.',
        ]);
    }

    public function validateToken(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::query()->where('email', $data['email'])->first();
        if (! $user || ! Password::broker()->tokenExists($user, $token)) {
            return response()->json([
                'message' => 'This reset link has expired or was already used.',
            ], 422);
        }

        return response()->json([
            'data' => [
                'valid' => true,
                'email' => $user->email,
            ],
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::defaults()],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password): void {
                $user->forceFill(['password' => $password])->save();
                $user->tokens()->delete();
                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'This reset link has expired or was already used.',
            ], 422);
        }

        return response()->json([
            'message' => 'Password updated.',
            'data' => ['redirect_path' => '/login'],
        ]);
    }
}
