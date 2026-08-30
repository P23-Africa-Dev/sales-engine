<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\ChatController;
use App\Http\Controllers\Api\V1\CompanyController;
use App\Http\Controllers\Api\V1\CrmController;
use App\Http\Controllers\Api\V1\DiscoveryController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\IcpProfileController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\MetricsController;
use App\Http\Controllers\Api\V1\OrganizationController;
use App\Http\Controllers\Api\V1\OutreachController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sales Engine API Routes (/api/v1)
|--------------------------------------------------------------------------
*/

Route::get('/health', HealthController::class);

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/factory23/exchange', [AuthController::class, 'factory23Exchange']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me'])->middleware('org.resolve');
    });
});

Route::middleware(['auth:sanctum', 'org.resolve'])->group(function () {
    Route::get('/organizations', [OrganizationController::class, 'index']);
    Route::post('/organizations', [OrganizationController::class, 'store']);
    Route::get('/organizations/current', [OrganizationController::class, 'current']);

    Route::get('/icp-profiles/active', [IcpProfileController::class, 'active']);
    Route::get('/icp-profiles', [IcpProfileController::class, 'index']);
    Route::post('/icp-profiles', [IcpProfileController::class, 'store']);
    Route::get('/icp-profiles/{id}', [IcpProfileController::class, 'show']);
    Route::patch('/icp-profiles/{id}', [IcpProfileController::class, 'update']);
    Route::delete('/icp-profiles/{id}', [IcpProfileController::class, 'destroy']);
    Route::post('/icp-profiles/{id}/activate', [IcpProfileController::class, 'activate']);
    Route::post('/icp-profiles/{id}/duplicate', [IcpProfileController::class, 'duplicate']);

    Route::post('/chat/sessions', [ChatController::class, 'storeSession']);
    Route::get('/chat/sessions/{id}/messages', [ChatController::class, 'messages']);
    Route::post('/chat/sessions/{id}/messages', [ChatController::class, 'postMessage'])
        ->middleware('throttle:30,1');

    Route::post('/discovery/runs', [DiscoveryController::class, 'store'])
        ->middleware('throttle:20,1');
    Route::get('/discovery/runs/{id}', [DiscoveryController::class, 'show']);

    Route::get('/companies', [CompanyController::class, 'index']);
    Route::get('/companies/{id}', [CompanyController::class, 'show']);
    Route::get('/leads', [CompanyController::class, 'leads']);

    Route::get('/metrics', [MetricsController::class, 'index']);
    Route::get('/dashboard', [MetricsController::class, 'index']);
    Route::get('/outreach/recent', [OutreachController::class, 'recent']);
    Route::post('/outreach/draft', [OutreachController::class, 'draft']);

    Route::get('/crm/pipeline', [CrmController::class, 'pipeline']);
    Route::patch('/crm/leads/{id}', [CrmController::class, 'updateLead']);

    Route::get('/integrations/factory23/status', [IntegrationController::class, 'factory23Status']);
    Route::post('/integrations/factory23/crm-sync', [IntegrationController::class, 'factory23CrmSync']);
});
