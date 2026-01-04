/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * RULES (INVIOLABLE):
 * 1. auth0.middleware() is ONLY called in this file
 * 2. /auth/* routes are delegated to auth0.middleware() - NEVER NextResponse.next()
 * 3. Protected routes redirect to /auth/login?returnTo=... if no session
 * 4. Public routes pass through with NextResponse.next()
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./src/lib/auth0";

// =============================================================================
// CONFIGURATION (per SoT)
// =============================================================================

const PUBLIC_ROUTES = [
  "/",
  "/auth-error",
  "/api/auth0/debug",
  "/api/auth0/me",
  "/api/auth0/test-config",
];

const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

// =============================================================================
// HELPERS
// =============================================================================

function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/images/")) return true;
  if (pathname.startsWith("/apk/")) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff|woff2|ttf|eot|xml|txt|json|pdf)$/.test(pathname)) return true;
  return false;
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(prefix => 
    pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

export default async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // -------------------------------------------------------------------------
  // 1. STATIC ASSETS → Pass through immediately
  // -------------------------------------------------------------------------
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 2. /auth/* → Delegate to Auth0 SDK (NEVER NextResponse.next())
  // Auth0 SDK v4 handles: /auth/login, /auth/logout, /auth/callback, /auth/me
  // -------------------------------------------------------------------------
  if (pathname.startsWith("/auth")) {
    return auth0.middleware(request);
  }

  // -------------------------------------------------------------------------
  // 3. PUBLIC ROUTES → Pass through
  // -------------------------------------------------------------------------
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 4. PROTECTED ROUTES → Check session, redirect if missing
  // -------------------------------------------------------------------------
  if (isProtectedRoute(pathname)) {
    const session = await auth0.getSession(request);
    
    if (!session) {
      const loginUrl = new URL("/auth/login", request.url);
      // Preserve full path + query string in returnTo
      const returnTo = pathname + (search || "");
      loginUrl.searchParams.set("returnTo", returnTo);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }
    
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 5. DEFAULT → Pass through (public by default)
  // -------------------------------------------------------------------------
  return NextResponse.next();
}

// =============================================================================
// MATCHER CONFIGURATION
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all paths except static files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
