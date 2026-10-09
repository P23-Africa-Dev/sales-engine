<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\AccessRequiredException;
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
