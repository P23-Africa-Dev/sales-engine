import { NextResponse } from "next/server";
import { getPlacesMetricsSnapshot } from "@/lib/server/places-telemetry";

/**
 * Read-only Places cost metrics for the current Node process.
 * Protect with PLACES_METRICS_SECRET header when set:
 *   Authorization: Bearer <secret>  or  X-Places-Metrics-Secret: <secret>
 */
export async function GET(request: Request) {
  const secret = process.env.PLACES_METRICS_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const header = request.headers.get("x-places-metrics-secret")?.trim();
    if (auth !== secret && header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json(getPlacesMetricsSnapshot());
}
