/**
 * Auth Callback Route Handler
 * Handles GET and HEAD requests for /auth/callback
 * Delegates to Auth0 SDK middleware for OAuth callback processing
 */
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET(request: NextRequest) {
  return auth0.middleware(request);
}

export async function HEAD(request: NextRequest) {
  // For HEAD on callback, return 200 to indicate route exists
  // Actual callback requires GET with code/state params
  const url = new URL(request.url);
  if (!url.searchParams.has('code') || !url.searchParams.has('state')) {
    return new NextResponse(null, { status: 200 });
  }
  return auth0.middleware(request);
}
