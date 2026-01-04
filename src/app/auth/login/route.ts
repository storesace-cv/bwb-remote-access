/**
 * Auth Login Route Handler
 * Handles GET and HEAD requests for /auth/login
 * Delegates to Auth0 SDK middleware for actual authentication flow
 */
import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET(request: NextRequest) {
  return auth0.middleware(request);
}

export async function HEAD(request: NextRequest) {
  // HEAD must return same headers as GET but no body
  // Delegate to auth0.middleware which returns redirect
  return auth0.middleware(request);
}
