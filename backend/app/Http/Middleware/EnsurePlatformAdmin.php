<?php

namespace App\Http\Middleware;

use App\Models\PlatformAdmin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof PlatformAdmin) {
            return response()->json(['message' => 'Platform admin access required.'], 403);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'This platform admin account is inactive.'], 403);
        }

        return $next($request);
    }
}
