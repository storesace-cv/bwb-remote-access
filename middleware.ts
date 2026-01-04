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
 * 5. Base URL MUST use X-Forwarded headers or APP_BASE_URL - NEVER request.url behind proxy
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

/**
 * Get the PUBLIC base URL - NEVER use request.url behind a reverse proxy.
 * Priority: X-Forwarded-Host > APP_BASE_URL > AUTH0_BASE_URL
 */
function getPublicBaseUrl(request: NextRequest): string {
  // 1. Try X-Forwarded headers (set by nginx)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  // 2. Try environment variables
  const envUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL;
  if (envUrl) {
    let url = envUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url.replace(/\/$/, "");
  }
  
  // 3. Fallback - should NEVER happen in production
  console.error("[MIDDLEWARE] WARNING: No public base URL configured!");
  return "https://rustdesk.bwb.pt";
}

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
    try {
      return await auth0.middleware(request);
    } catch (error) {
      console.error("[MIDDLEWARE] Auth0 error:", error);
      // If Auth0 fails, redirect to error page
      const baseUrl = getPublicBaseUrl(request);
      const errorUrl = new URL("/auth-error", baseUrl);
      errorUrl.searchParams.set("e", "auth0_error");
      errorUrl.searchParams.set("message", String(error));
      return NextResponse.redirect(errorUrl, { status: 302 });
    }
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
    try {
      const session = await auth0.getSession(request);
      
      if (!session) {
        // CRITICAL: Use PUBLIC base URL, not request.url (which is localhost behind proxy)
        const baseUrl = getPublicBaseUrl(request);
        const loginUrl = new URL("/auth/login", baseUrl);
        const returnTo = pathname + (search || "");
        loginUrl.searchParams.set("returnTo", returnTo);
        return NextResponse.redirect(loginUrl, { status: 302 });
      }
    } catch (error) {
      console.error("[MIDDLEWARE] Session check error:", error);
      // If session check fails, redirect to login
      const baseUrl = getPublicBaseUrl(request);
      const loginUrl = new URL("/auth/login", baseUrl);
      loginUrl.searchParams.set("returnTo", pathname);
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
