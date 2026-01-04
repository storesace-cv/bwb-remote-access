/**
 * Canonical Logout Endpoint: /auth/logout
 * Redirects to Auth0 SDK handler at /api/auth/logout
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL("/api/auth/logout", request.url);
  return NextResponse.redirect(url, 302);
}
