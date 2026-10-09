import { NextResponse } from "next/server";

/**
 * Deprecated: Places search moved to Laravel `/api/v1/places/*`
 * (Geoapify → Foursquare → Google orchestrator).
 */
export async function POST() {
  return NextResponse.json(
    {
      enabled: false,
      deprecated: true,
      message: "Use Laravel GET /api/v1/places/autocomplete",
      suggestions: [],
    },
    { status: 410 },
  );
}
