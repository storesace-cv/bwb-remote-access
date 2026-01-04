/**
 * Canonical Callback Endpoint: /auth/callback
 * Redirects to Auth0 SDK handler at /api/auth/callback
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL("/api/auth/callback", request.url);
  // Preserve all query params (code, state, etc.)
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url, 302);
}
