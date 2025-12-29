/**
 * Next.js 16 Proxy - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * ARCHITECTURE RULES (NON-NEGOTIABLE):
 * 1. This file MUST be at the project ROOT as `proxy.ts`
 * 2. The exported function MUST be named `proxy` (not `middleware`)
 * 3. Auth0 routes (/auth/*) are delegated to `auth0.middleware(request)`
 * 4. No src/app/auth/ directory may exist
 * 5. NextResponse.next() is ONLY allowed in this file
 * 
 * Auth0 SDK Routes (auto-mounted):
 *   /auth/login     → Redirects to Auth0 Universal Login
 *   /auth/logout    → Clears session and logs out
 *   /auth/callback  → Handles OAuth callback
 *   /auth/me        → Returns session info (JSON)
 *   /auth/profile   → Returns user profile
 *   /auth/access-token → Returns access token
 *   /auth/backchannel-logout → Handles backchannel logout
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "./src/lib/auth0";

// ============================================================================
// ROUTE CLASSIFICATION
// ============================================================================

// Auth0 SDK routes - MUST be delegated to auth0.middleware()
const AUTH0_ROUTES_PREFIX = "/auth";

// Public paths - no authentication required
const PUBLIC_PATHS = [
  "/_next",
  "/favicon.ico",
  "/api/auth0/me",      // Public session check endpoint
];

// Legacy routes to redirect
const LEGACY_AUTH_REDIRECTS: Record<string, string> = {
  "/api/auth/login": "/auth/login",
  "/api/auth/logout": "/auth/logout",
  "/api/auth/callback": "/auth/callback",
  "/api/auth/me": "/auth/me",
};

// Deprecated routes - return 410 Gone
const DEPRECATED_ROUTES = ["/api/login"];

// Static asset extensions
const STATIC_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
  ".map", ".webp",
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isAuth0Route(pathname: string): boolean {
  return pathname.startsWith(AUTH0_ROUTES_PREFIX);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function isStaticAsset(pathname: string): boolean {
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

function getLegacyRedirect(pathname: string): string | null {
  return LEGACY_AUTH_REDIRECTS[pathname] || null;
}

function isDeprecatedRoute(pathname: string): boolean {
  return DEPRECATED_ROUTES.includes(pathname);
}

// ============================================================================
// PROXY FUNCTION (Next.js 16 Required Name)
// ============================================================================

/**
 * Next.js 16 Proxy Entry Point
 * 
 * This function:
 * 1. Delegates /auth/* routes to Auth0 SDK
 * 2. Handles legacy route redirects
 * 3. Enforces authentication on protected routes
 * 4. Returns NextResponse.next() for allowed requests
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // -------------------------------------------------------------------------
  // 1. DEPRECATED ROUTES → 410 Gone
  // -------------------------------------------------------------------------
  if (isDeprecatedRoute(pathname)) {
    return NextResponse.json(
      { error: "Gone", message: "Use /auth/login for authentication." },
      { status: 410 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. LEGACY AUTH ROUTES → Redirect to /auth/*
  // -------------------------------------------------------------------------
  const legacyRedirect = getLegacyRedirect(pathname);
  if (legacyRedirect) {
    return NextResponse.redirect(new URL(legacyRedirect, request.url));
  }

  // -------------------------------------------------------------------------
  // 3. AUTH0 ROUTES → Delegate to Auth0 SDK (CRITICAL)
  // -------------------------------------------------------------------------
  if (isAuth0Route(pathname)) {
    // The Auth0 SDK handles all /auth/* routes:
    // /auth/login, /auth/logout, /auth/callback, /auth/me, /auth/profile, etc.
    return auth0.middleware(request);
  }

  // -------------------------------------------------------------------------
  // 4. PUBLIC PATHS → Allow without authentication
  // -------------------------------------------------------------------------
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 5. STATIC ASSETS → Allow without authentication
  // -------------------------------------------------------------------------
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 6. PROTECTED ROUTES → Require Auth0 session
  // -------------------------------------------------------------------------
  const sessionCookie = request.cookies.get("appSession");

  if (!sessionCookie?.value) {
    // No session - redirect to Auth0 login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists - allow request
  return NextResponse.next();
}

// ============================================================================
// PROXY CONFIGURATION (Next.js 16 Required)
// ============================================================================

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
