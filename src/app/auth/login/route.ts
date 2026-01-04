/**
 * Canonical Login Endpoint: /auth/login
 * Redirects to Auth0 SDK handler at /api/auth/login
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL("/api/auth/login", request.url);
  // Preserve returnTo if present
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  if (returnTo) {
    url.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(url, 302);
}
