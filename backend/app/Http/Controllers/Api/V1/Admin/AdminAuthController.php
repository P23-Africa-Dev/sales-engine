<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\PlatformAdminResource;
use App\Models\PlatformAdmin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $admin = PlatformAdmin::query()->where('email', mb_strtolower(trim($data['email'])))->first();

        if (! $admin || ! Hash::check($data['password'], $admin->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if (! $admin->is_active) {
            return response()->json(['message' => 'This platform admin account is inactive.'], 403);
        }

        $token = $admin->createToken('admin')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'admin' => new PlatformAdminResource($admin),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var PlatformAdmin|null $admin */
        $admin = $request->user();
        if ($admin) {
            $bearer = (string) $request->bearerToken();
            if ($bearer !== '' && str_contains($bearer, '|')) {
                [$id] = explode('|', $bearer, 2);
                $admin->tokens()->whereKey($id)->delete();
            } else {
                $admin->tokens()->delete();
            }
        }

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'admin' => new PlatformAdminResource($request->user()),
        ]);
    }
}
