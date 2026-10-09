import { NextRequest, NextResponse } from "next/server";
import { SUPPORT_TOKEN_COOKIE } from "@/lib/auth/support-session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get(SUPPORT_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "No active support session.", data: null, errors: null },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  if (!Array.isArray(path) || path.some((segment) => !segment || segment === "." || segment === "..")) {
    return NextResponse.json(
      { success: false, message: "Invalid API path.", data: null, errors: null },
      { status: 400 },
    );
  }

  const upstreamUrl = `${API_BASE_URL}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const contentType = request.headers.get("content-type");
  const isSafeMethod = request.method === "GET" || request.method === "HEAD";

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      Accept: request.headers.get("accept") ?? "application/json",
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: isSafeMethod ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "retry-after"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
