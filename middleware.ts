/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * ARCHITECTURE RULES (NON-NEGOTIABLE):
 * 1. This file MUST be at the project ROOT as `middleware.ts`
 * 2. The exported function MUST be named `middleware`
 * 3. Auth0 routes (/auth/*) are delegated to `auth0.middleware(request)`
 * 4. No src/app/auth/ directory may exist (would shadow Auth0 routes)
 * 5. NextResponse.next() is ONLY allowed in this file
 * 6. No explicit Auth0 route handlers (v4 auto-mounts via middleware)
 * 
 * Auth0 SDK v4 Routes (auto-mounted via middleware):
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
// BASE URL RESOLUTION FOR REDIRECTS
// ============================================================================

/**
 * Gets the canonical base URL for redirects.
 * 
 * Priority:
 *   1. X-Forwarded-Host + X-Forwarded-Proto headers (reverse proxy)
 *   2. AUTH0_BASE_URL environment variable
 *   3. APP_BASE_URL environment variable
 *   4. NEXT_PUBLIC_SITE_URL environment variable
 *   5. request.url (fallback, may be localhost in dev)
 * 
 * This ensures redirects use the public URL, not the internal server URL.
 */
function getRedirectBaseUrl(request: NextRequest): string {
  // Check for reverse proxy headers first (most reliable in production)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  // Check environment variables (strict precedence)
  const envBaseUrl = 
    process.env.AUTH0_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  
  if (envBaseUrl) {
    // Normalize: ensure protocol, remove trailing slash
    let url = envBaseUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }
  
  // Fallback to request URL (may be localhost in dev - acceptable)
  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

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
// MIDDLEWARE FUNCTION (Next.js Standard)
// ============================================================================

/**
 * Next.js Middleware Entry Point
 * 
 * This function:
 * 1. Delegates /auth/* routes to Auth0 SDK (v4 auto-mounts handlers)
 * 2. Handles legacy route redirects
 * 3. Enforces authentication on protected routes
 * 4. Returns NextResponse.next() for allowed requests
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
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
    // Auth0 SDK v4 handles all /auth/* routes via middleware:
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
// MIDDLEWARE CONFIGURATION (Next.js Standard)
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
