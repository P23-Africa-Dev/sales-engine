<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrganizationResource;
use App\Http\Resources\UserResource;
use App\Services\Auth\AuthService;
use App\Services\Auth\Factory23AssertionVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use InvalidArgumentException;
use UnexpectedValueException;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly Factory23AssertionVerifier $verifier,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::defaults()],
            'organization_name' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->auth->register(
            $data['name'],
            $data['email'],
            $data['password'],
            $data['organization_name'] ?? null,
        );

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $result = $this->auth->login($data['email'], $data['password']);
        if (! $result) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => $result['organization']
                ? new OrganizationResource($result['organization'])
                : null,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $orgs = $user->organizations()->get();

        return response()->json([
            'user' => new UserResource($user),
            'organizations' => OrganizationResource::collection($orgs),
            'current_organization' => $request->attributes->get('organization')
                ? new OrganizationResource($request->attributes->get('organization'))
                : null,
        ]);
    }

    public function factory23Exchange(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assertion' => ['required', 'string'],
        ]);

        try {
            $claims = $this->verifier->verify($data['assertion']);
            $result = $this->auth->exchangeFactory23($claims);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        } catch (UnexpectedValueException $e) {
            return response()->json(['message' => $e->getMessage()], 401);
        }

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ]);
    }
}
