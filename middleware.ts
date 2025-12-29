/**
 * Next.js Middleware - Auth0 Authentication Enforcer
 * 
 * ARCHITECTURE NOTE:
 * This is the ONLY file where NextResponse.next() may be used.
 * Route handlers (app/.../route.ts) must NEVER call middleware functions.
 * 
 * Responsibilities:
 * 1. Auth0 routes (/auth/*) - delegated to Auth0 SDK via auth0.middleware()
 * 2. Public routes - allowed without authentication
 * 3. Protected routes - require Auth0 session, redirect to /auth/login if missing
 * 4. Legacy routes - redirect to new paths or return 410 Gone
 * 
 * Auth0 Routes (nextjs-auth0 v4):
 *   /auth/login     → Redirects to Auth0 Universal Login
 *   /auth/logout    → Logs out and clears session
 *   /auth/callback  → Handles OAuth callback
 *   /auth/me        → Returns session info (JSON)
 *   /auth/profile   → Returns user profile
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ============================================================================
// ROUTE CLASSIFICATION
// ============================================================================

// Auth0 SDK routes - handled by auth0.middleware()
const AUTH0_ROUTES_PREFIX = "/auth";

// Public paths - no authentication required
const PUBLIC_PATHS = [
  "/_next",             // Next.js internals
  "/favicon.ico",
  "/rustdesk-logo.svg",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
  "/api/auth0/me",      // Auth0 session check endpoint (public for status checks)
];

// Legacy routes - redirect or block
const LEGACY_AUTH_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/callback",
  "/api/auth/me",
];

// Deprecated routes - return 410 Gone
const DEPRECATED_ROUTES = [
  "/api/login",
];

// Static asset extensions
const STATIC_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
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

function isLegacyAuthRoute(pathname: string): boolean {
  return LEGACY_AUTH_ROUTES.some((path) => pathname.startsWith(path));
}

function isDeprecatedRoute(pathname: string): boolean {
  return DEPRECATED_ROUTES.includes(pathname);
}

function isStaticAsset(pathname: string): boolean {
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

// ============================================================================
// MIDDLEWARE FUNCTION
// ============================================================================

/**
 * Next.js Middleware Entry Point
 * 
 * This function is the ONLY place where NextResponse.next() is valid.
 * All authentication logic flows through here.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // -------------------------------------------------------------------------
  // 1. DEPRECATED ROUTES → 410 Gone
  // -------------------------------------------------------------------------
  if (isDeprecatedRoute(pathname)) {
    return NextResponse.json(
      {
        error: "Gone",
        message: "This endpoint has been deprecated. Use /auth/login for authentication.",
      },
      { status: 410 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. LEGACY AUTH ROUTES → Redirect to new /auth/* paths
  // -------------------------------------------------------------------------
  if (isLegacyAuthRoute(pathname)) {
    const newPath = pathname.replace("/api/auth/", "/auth/");
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  // -------------------------------------------------------------------------
  // 3. AUTH0 ROUTES → Delegate to Auth0 SDK
  // -------------------------------------------------------------------------
  if (isAuth0Route(pathname)) {
    // Lazy-load auth0 to avoid build-time initialization issues
    const { auth0 } = await import("@/lib/auth0");
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
// MIDDLEWARE CONFIGURATION
// ============================================================================

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
