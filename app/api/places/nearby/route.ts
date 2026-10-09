import { NextResponse } from "next/server";

/** @deprecated Use Laravel POST /api/v1/places/nearby */
export async function POST() {
  return NextResponse.json(
    { enabled: false, deprecated: true, places: [], message: "Use Laravel POST /api/v1/places/nearby" },
    { status: 410 },
  );
}
