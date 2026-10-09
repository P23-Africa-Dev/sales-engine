import { NextRequest, NextResponse } from "next/server";
import { SUPPORT_TOKEN_COOKIE } from "@/lib/auth/support-session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SUPPORT_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "No active support session.", data: null, errors: null },
      { status: 401 },
    );
  }

  const upstream = await fetch(`${API_BASE_URL}/support-access/status`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
