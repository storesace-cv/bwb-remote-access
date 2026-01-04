/**
 * Auth Logout Route Handler
 * Handles GET and HEAD requests for /auth/logout
 * Delegates to Auth0 SDK middleware for logout flow
 */
import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET(request: NextRequest) {
  return auth0.middleware(request);
}

export async function HEAD(request: NextRequest) {
  return auth0.middleware(request);
}
