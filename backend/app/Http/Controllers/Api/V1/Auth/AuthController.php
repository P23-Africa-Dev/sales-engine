<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\AccessRequiredException;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrganizationResource;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\AuthService;
use App\Services\Auth\EmailVerificationService;
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
        private readonly EmailVerificationService $verification,
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

        $this->verification->issue($result['user']);

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

        try {
            $result = $this->auth->login($data['email'], $data['password']);
        } catch (AccessRequiredException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => 'access_required',
            ], 403);
        }
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
        $current = $request->attributes->get('organization');

        return response()->json([
            'user' => new UserResource($user),
            'organizations' => OrganizationResource::collection($orgs),
            'current_organization' => $current ? new OrganizationResource($current) : null,
            'onboarding_completed' => $current?->onboarding_completed_at !== null,
        ]);
    }

    public function updateMe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'avatar' => ['sometimes', 'file', 'image', 'max:2048'],
            'avatar_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ]);

        $user = $request->user();
        if (array_key_exists('name', $data)) {
            $user->name = $data['name'];
        }
        if ($request->hasFile('avatar')) {
            $user->avatar_path = $request->file('avatar')->store('avatars', 'public');
        } elseif (array_key_exists('avatar_url', $data)) {
            $user->avatar_path = $data['avatar_url'];
        }
        $user->save();

        return response()->json(['user' => new UserResource($user->fresh())]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password:sanctum'],
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);

        $user = $request->user();
        $user->password = $data['password'];
        $user->save();

        $currentId = $user->currentAccessToken()?->id;
        $user->tokens()->when($currentId, fn ($query) => $query->where('id', '!=', $currentId))->delete();

        return response()->json(['message' => 'Password changed.']);
    }

    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = $this->verification->verify($data['email'], $data['code']);

        return response()->json([
            'data' => [
                'verified' => true,
                'email_verified' => $user->email_verified_at !== null,
            ],
        ]);
    }

    public function resendOtp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::query()->where('email', $data['email'])->first();
        if ($user && $user->email_verified_at === null) {
            $this->verification->issue($user);
        }

        return response()->json(['message' => 'Code sent.']);
    }

    public function factory23Exchange(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assertion' => ['required', 'string'],
            'f23_access_token' => ['nullable', 'string'],
        ]);

        try {
            $claims = $this->verifier->verify($data['assertion']);
            $result = $this->auth->exchangeFactory23($claims, $data['f23_access_token'] ?? null);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        } catch (UnexpectedValueException $e) {
            return response()->json(['message' => $e->getMessage()], 401);
        } catch (AccessRequiredException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => 'access_required',
            ], 403);
        }

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ]);
    }

    /**
     * Control-approved provisioning: create/link SE user for a Factory23 identity.
     * Authenticated via shared internal token (not end-user Sanctum).
     */
    public function factory23Provision(Request $request): JsonResponse
    {
        if (! $this->internalTokenIsValid($request)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $data = $request->validate([
            'sub' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'company_id' => ['nullable', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->auth->provisionFactory23User([
            'sub' => $data['sub'],
            'email' => $data['email'],
            'name' => $data['name'] ?? null,
            'company_id' => $data['company_id'] ?? null,
            'company_name' => $data['company_name'] ?? null,
        ]);

        return response()->json([
            'created' => $result['created'],
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ], $result['created'] ? 201 : 200);
    }

    /**
     * Gate "Log in if you already have an account": SE email/password + F23 assertion → link + session.
     */
    public function factory23LoginLink(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assertion' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'f23_access_token' => ['nullable', 'string'],
        ]);

        try {
            $claims = $this->verifier->verify($data['assertion']);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        } catch (UnexpectedValueException $e) {
            return response()->json(['message' => $e->getMessage()], 401);
        }

        $result = $this->auth->linkFactory23Login(
            $claims,
            $data['email'],
            $data['password'],
            $data['f23_access_token'] ?? null,
        );

        if (! $result) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ]);
    }

    private function internalTokenIsValid(Request $request): bool
    {
        $expected = trim((string) config('services.factory23.internal_token'));
        if ($expected === '') {
            return false;
        }

        $provided = trim((string) $request->header('X-Internal-Token', ''));

        return $provided !== '' && hash_equals($expected, $provided);
    }
}
