<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Discovery\DiscoveryGeo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeoController extends Controller
{
    public function __construct(
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    public function places(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:80'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $places = $this->discoveryGeo->searchPlaces(
            $data['q'],
            (int) ($data['limit'] ?? 20),
        );

        return response()->json(['data' => $places]);
    }
}
