<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\ChatController;
use App\Http\Controllers\Api\V1\CompanyController;
use App\Http\Controllers\Api\V1\CrmController;
use App\Http\Controllers\Api\V1\DiscoveryController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\IcpProfileController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\LeadSyncController;
use App\Http\Controllers\Api\V1\MetricsController;
use App\Http\Controllers\Api\V1\OrganizationController;
use App\Http\Controllers\Api\V1\OutreachController;
use App\Http\Controllers\Api\V1\OutreachDomainController;
use App\Http\Controllers\Api\V1\OutreachMailboxController;
use App\Http\Controllers\Api\V1\OutreachSenderController;
use App\Http\Controllers\Api\V1\SendGridWebhookController;
use App\Http\Controllers\Api\V1\SocialListeningController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sales Engine API Routes (/api/v1)
|--------------------------------------------------------------------------
*/

Route::get('/health', HealthController::class);

// Public: SendGrid posts delivery/open/click/bounce events here. Verified via
// ECDSA signature inside the controller, not session/token auth.
Route::post('/webhooks/sendgrid', [SendGridWebhookController::class, 'handle']);

// Public OAuth callbacks for outreach mailbox connect (state is encrypted + single-use).
Route::get('/outreach/mailboxes/oauth/{provider}/callback', [OutreachMailboxController::class, 'oauthCallback']);

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/factory23/exchange', [AuthController::class, 'factory23Exchange']);
    Route::post('/factory23/provision', [AuthController::class, 'factory23Provision']);
    Route::post('/factory23/login-link', [AuthController::class, 'factory23LoginLink']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me'])->middleware('org.resolve');
    });
});

Route::middleware(['auth:sanctum', 'org.resolve'])->group(function () {
    Route::get('/organizations', [OrganizationController::class, 'index']);
    Route::post('/organizations', [OrganizationController::class, 'store']);
    Route::get('/organizations/current', [OrganizationController::class, 'current']);

    Route::get('/signal-types', [\App\Http\Controllers\Api\V1\SignalTypeController::class, 'index']);
    Route::post('/icp-profiles/suggest-search-brief', [IcpProfileController::class, 'suggestSearchBrief'])
        ->middleware('throttle:20,1');
    Route::get('/icp-profiles/active', [IcpProfileController::class, 'active']);
    Route::get('/icp-profiles', [IcpProfileController::class, 'index']);
    Route::post('/icp-profiles', [IcpProfileController::class, 'store']);
    Route::get('/icp-profiles/{id}', [IcpProfileController::class, 'show']);
    Route::patch('/icp-profiles/{id}', [IcpProfileController::class, 'update']);
    Route::delete('/icp-profiles/{id}', [IcpProfileController::class, 'destroy']);
    Route::post('/icp-profiles/{id}/activate', [IcpProfileController::class, 'activate']);
    Route::post('/icp-profiles/{id}/duplicate', [IcpProfileController::class, 'duplicate']);

    Route::post('/chat/sessions', [ChatController::class, 'storeSession']);
    Route::get('/chat/sessions/current', [ChatController::class, 'currentSession']);
    Route::get('/chat/sessions/{id}/messages', [ChatController::class, 'messages']);
    Route::delete('/chat/sessions/{id}/messages', [ChatController::class, 'clearMessages']);
    Route::post('/chat/sessions/{id}/messages', [ChatController::class, 'postMessage'])
        ->middleware('throttle:30,1');

    Route::post('/discovery/runs', [DiscoveryController::class, 'store'])
        ->middleware('throttle:20,1');
    Route::get('/discovery/runs/{id}', [DiscoveryController::class, 'show']);
    Route::post('/discovery/runs/{id}/cancel', [DiscoveryController::class, 'cancel'])
        ->middleware('throttle:30,1');

    Route::get('/companies', [CompanyController::class, 'index']);
    Route::get('/companies/{id}', [CompanyController::class, 'show']);
    Route::get('/leads', [CompanyController::class, 'leads']);
    Route::post('/leads/{id}/sync-to-crm', [LeadSyncController::class, 'syncToCrm']);
    Route::post('/leads/sync-to-crm', [LeadSyncController::class, 'syncBatch']);

    Route::get('/metrics', [MetricsController::class, 'index']);
    Route::get('/dashboard', [MetricsController::class, 'index']);
    Route::get('/outreach/recent', [OutreachController::class, 'recent']);
    Route::post('/outreach/draft', [OutreachController::class, 'draft']);
    Route::get('/outreach/activities/{id}', [OutreachController::class, 'show']);
    Route::post('/outreach/activities/{id}/regenerate', [OutreachController::class, 'regenerate']);
    Route::post('/outreach/activities/{id}/send', [OutreachController::class, 'sendActivity']);
    Route::delete('/outreach/activities/{id}', [OutreachController::class, 'destroy']);
    Route::get('/outreach/sender-settings', [OutreachSenderController::class, 'show']);
    Route::put('/outreach/sender-settings', [OutreachSenderController::class, 'update']);
    Route::get('/outreach/domain', [OutreachDomainController::class, 'show']);
    Route::post('/outreach/domain', [OutreachDomainController::class, 'authenticate']);
    Route::post('/outreach/domain/verify', [OutreachDomainController::class, 'verify']);
    Route::post('/outreach/domain/integrity-recheck', [OutreachDomainController::class, 'recheckIntegrity']);
    Route::delete('/outreach/domain', [OutreachDomainController::class, 'destroy']);

    Route::get('/outreach/mailboxes', [OutreachMailboxController::class, 'index']);
    Route::get('/outreach/mailboxes/oauth/{provider}/authorize', [OutreachMailboxController::class, 'authorizeOAuth']);
    Route::post('/outreach/mailboxes/smtp', [OutreachMailboxController::class, 'connectSmtp']);
    Route::delete('/outreach/mailboxes/{id}', [OutreachMailboxController::class, 'destroy']);

    Route::get('/social-listening/signals', [SocialListeningController::class, 'indexSignals']);
    Route::get('/social-listening/signals/{id}', [SocialListeningController::class, 'showSignal']);
    Route::get('/social-listening/metrics', [SocialListeningController::class, 'metrics']);
    Route::get('/social-listening/settings', [SocialListeningController::class, 'showSettings']);
    Route::put('/social-listening/settings', [SocialListeningController::class, 'updateSettings']);
    Route::post('/social-listening/runs', [SocialListeningController::class, 'storeRun'])
        ->middleware('throttle:10,60');
    Route::post('/social-listening/runs/bootstrap', [SocialListeningController::class, 'bootstrapRun'])
        ->middleware('throttle:10,60');
    Route::get('/social-listening/runs/{id}', [SocialListeningController::class, 'showRun']);
    Route::post('/social-listening/signals/{id}/outreach', [SocialListeningController::class, 'createOutreach']);
    Route::post('/social-listening/signals/{id}/reminder', [SocialListeningController::class, 'setReminder']);
    Route::post('/social-listening/signals/{id}/sync-to-crm', [SocialListeningController::class, 'syncToCrm']);
    Route::post('/social-listening/signals/{id}/dismiss', [SocialListeningController::class, 'dismiss']);

    Route::get('/crm/pipeline', [CrmController::class, 'pipeline']);
    Route::patch('/crm/leads/{id}', [CrmController::class, 'updateLead']);

    Route::get('/integrations/factory23/status', [IntegrationController::class, 'factory23Status']);
    Route::post('/integrations/factory23/ensure', [IntegrationController::class, 'ensureFactory23CrmLink']);
    Route::post('/integrations/factory23/crm-sync', [IntegrationController::class, 'factory23CrmSync']);
});
