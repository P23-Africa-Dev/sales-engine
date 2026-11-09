import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORT_ACTIVE_COOKIE,
  SUPPORT_LEVEL_COOKIE,
  SUPPORT_TOKEN_COOKIE,
} from "@/lib/auth/support-session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SUPPORT_TOKEN_COOKIE)?.value;

  if (token) {
    await fetch(`${API_BASE_URL}/support-access/end`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }).catch(() => null);
  }

  const response = NextResponse.json({
    success: true,
    message: "Support session ended.",
    data: null,
    errors: null,
  });

  for (const name of [SUPPORT_TOKEN_COOKIE, SUPPORT_ACTIVE_COOKIE, SUPPORT_LEVEL_COOKIE]) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return response;
}
