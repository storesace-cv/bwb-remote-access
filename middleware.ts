/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * ARCHITECTURE MODEL: ALLOWLIST-BASED PROTECTION
 * - Only explicitly listed protected routes require authentication
 * - Everything else is public by default (prevents accidental auth triggers)
 * - Auth routes (/auth/*) are ALWAYS delegated to Auth0 SDK without guards
 * 
 * INVARIANTS ENFORCED:
 *   1. CALLBACK IS TERMINAL AND UNGUARDED (/auth/* routes never trigger auth)
 *   2. NO ACCIDENTAL AUTH TRIGGERS (static assets, public routes never start auth)
 *   3. SINGLE AUTH INITIATION (middleware never creates parallel auth flows)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "./src/lib/auth0";

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// =============================================================================
// ROUTE CLASSIFICATION (ALLOWLIST MODEL)
// =============================================================================

/**
 * PROTECTED ROUTES - These paths REQUIRE authentication.
 * Only these routes will trigger a redirect to /auth/login if no session exists.
 * Everything else is public by default.
 */
const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

/**
 * AUTH0 SDK ROUTES - Delegated directly to auth0.middleware()
 * INVARIANT 1: These routes MUST NEVER trigger auth guards or redirects.
 */
const AUTH0_ROUTES_PREFIX = "/auth";

/**
 * EXPLICITLY PUBLIC ROUTES - Always allowed without auth (for clarity)
 */
const PUBLIC_ROUTES = [
  "/",
  "/auth-error",
  "/api/auth0/debug",
  "/api/auth0/me",
  "/api/auth0/test-config",
];

/**
 * STATIC ASSET PATTERNS - Never trigger auth
 */
const STATIC_ASSET_PREFIXES = [
  "/_next",
  "/favicon",
  "/robots",
  "/sitemap",
  "/apk",
];

const STATIC_ASSET_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".css", ".js", ".map",
  ".woff", ".woff2", ".ttf", ".eot",
  ".xml", ".txt", ".json",
];

/**
 * LEGACY AUTH ROUTES - Redirect to new /auth/* paths
 */
const LEGACY_AUTH_REDIRECTS: Record<string, string> = {
  "/api/auth/login": "/auth/login",
  "/api/auth/logout": "/auth/logout",
  "/api/auth/callback": "/auth/callback",
  "/api/auth/me": "/auth/me",
};

// =============================================================================
// ROUTE CLASSIFICATION HELPERS
// =============================================================================

function isAuth0Route(pathname: string): boolean {
  return pathname.startsWith(AUTH0_ROUTES_PREFIX);
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isExplicitlyPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isStaticAsset(pathname: string): boolean {
  // Check prefixes
  if (STATIC_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return true;
  }
  // Check extensions
  return STATIC_ASSET_EXTENSIONS.some(ext => pathname.endsWith(ext));
}

function getLegacyRedirect(pathname: string): string | null {
  return LEGACY_AUTH_REDIRECTS[pathname] || null;
}

// =============================================================================
// BASE URL RESOLUTION
// =============================================================================

function getRedirectBaseUrl(request: NextRequest): string {
  // Priority 1: X-Forwarded-Host header (reverse proxy)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    const url = `${forwardedProto}://${forwardedHost}`;
    if (IS_PRODUCTION && url.includes('localhost')) {
      throw new Error(`CRITICAL: localhost in production. URL: ${url}`);
    }
    return url;
  }
  
  // Priority 2: Environment variables
  const envBaseUrl = 
    process.env.AUTH0_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  
  if (envBaseUrl) {
    let url = envBaseUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    if (IS_PRODUCTION && url.includes('localhost')) {
      throw new Error(`CRITICAL: localhost in base URL. URL: ${url}`);
    }
    return url;
  }
  
  // Priority 3: Development fallback only
  if (IS_PRODUCTION) {
    throw new Error("CRITICAL: No base URL configured in production.");
  }
  
  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

// =============================================================================
// MIDDLEWARE FUNCTION
// =============================================================================

/**
 * Next.js Middleware Entry Point
 * 
 * Flow:
 *   1. Static assets → NextResponse.next() (no auth)
 *   2. Auth0 routes → auth0.middleware() (delegated, UNGUARDED)
 *   3. Explicitly public routes → NextResponse.next() (no auth)
 *   4. Protected routes → Check session, redirect to login if missing
 *   5. Everything else → NextResponse.next() (public by default)
 * 
 * IMPORTANT: Auth routes (/auth/login, /auth/logout, etc.) MUST be accessed
 * via full page navigation (<a href>) NOT client-side navigation (<Link>).
 * Client-side navigation uses fetch/RSC which causes CORS errors with Auth0.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // -------------------------------------------------------------------------
  // 1. STATIC ASSETS → Pass through without any auth logic
  // -------------------------------------------------------------------------
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 2. LEGACY AUTH ROUTES → Redirect to /auth/*
  // -------------------------------------------------------------------------
  const legacyRedirect = getLegacyRedirect(pathname);
  if (legacyRedirect) {
    const baseUrl = getRedirectBaseUrl(request);
    return NextResponse.redirect(new URL(legacyRedirect, baseUrl));
  }

  // -------------------------------------------------------------------------
  // 3. AUTH0 ROUTES → Delegate to Auth0 SDK (INVARIANT 1: UNGUARDED)
  // CRITICAL: These routes MUST NOT trigger any auth checks or redirects.
  // The callback route is TERMINAL - it must complete without interference.
  // -------------------------------------------------------------------------
  if (isAuth0Route(pathname)) {
    try {
      return await auth0.middleware(request);
    } catch (error) {
      console.error(`[MIDDLEWARE] Auth0 SDK error for ${pathname}:`, error);
      return NextResponse.json(
        { error: 'Auth0 error', message: String(error), path: pathname },
        { status: 500 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // 5. EXPLICITLY PUBLIC ROUTES → Pass through without auth
  // -------------------------------------------------------------------------
  if (isExplicitlyPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 6. PROTECTED ROUTES → Require session
  // Only these routes will trigger a redirect to /auth/login
  // -------------------------------------------------------------------------
  if (isProtectedRoute(pathname)) {
    const sessionCookie = request.cookies.get("appSession");
    
    if (!sessionCookie?.value) {
      // No session - redirect to login
      // INVARIANT 2: Only ONE redirect to login, with returnTo for this path
      const baseUrl = getRedirectBaseUrl(request);
      const loginUrl = new URL("/auth/login", baseUrl);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    // Session exists - allow access
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 7. DEFAULT: PUBLIC (Allowlist model - unmatched routes are public)
  // This prevents accidental auth triggers for any route not explicitly protected.
  // -------------------------------------------------------------------------
  return NextResponse.next();
}

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

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
