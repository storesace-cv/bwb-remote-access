/**
 * Auth0 SDK Route Handler (App Router)
 * 
 * @auth0/nextjs-auth0 v4 uses middleware-based routing.
 * This route handler delegates to the Auth0 client's middleware.
 * 
 * Handles: /api/auth/login, /api/auth/logout, /api/auth/callback, /api/auth/me
 */
import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET(request: NextRequest) {
  return auth0.middleware(request);
}

export async function POST(request: NextRequest) {
  return auth0.middleware(request);
}
