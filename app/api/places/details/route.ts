import { NextResponse } from "next/server";

/** @deprecated Use Laravel GET /api/v1/places/details */
export async function GET() {
  return NextResponse.json(
    { enabled: false, deprecated: true, message: "Use Laravel GET /api/v1/places/details" },
    { status: 410 },
  );
}
