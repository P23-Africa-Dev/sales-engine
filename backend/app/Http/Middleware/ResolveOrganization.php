<?php

namespace App\Http\Middleware;

use App\Support\OrgContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $headerId = $request->header('X-Organization-Id');
        $orgId = $headerId !== null && $headerId !== '' ? (int) $headerId : null;

        OrgContext::set(OrgContext::resolveForUser($user, $orgId));
        $request->attributes->set('organization', OrgContext::get());

        try {
            return $next($request);
        } finally {
            OrgContext::clear();
        }
    }
}
