<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class CountryController extends Controller
{
    public function index(): JsonResponse
    {
        $countries = config('countries');

        return response()->json([
            'data' => [
                'countries' => is_array($countries) ? array_values($countries) : [],
            ],
        ]);
    }
}
