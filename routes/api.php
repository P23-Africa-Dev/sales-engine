<?php

use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sales Engine API Routes
|--------------------------------------------------------------------------
|
| All routes here are prefixed with /api/v1 (see bootstrap/app.php).
| Product endpoints will be added in the next backend implementation plan.
|
*/

Route::get('/health', HealthController::class);
