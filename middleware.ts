/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * ARCHITECTURE:
 * - /auth/* routes have their own route handlers that redirect to /api/auth/*
 * - /api/auth/* routes are handled by Auth0 SDK (handleAuth)
 * - Middleware only handles session checks for protected routes
 * 
 * FLOW:
 * 1. Static assets → pass through
 * 2. /auth/* and /api/auth/* → pass through (handled by route handlers)
 * 3. Protected routes → check session, redirect if missing
 * 4. Everything else → pass through (public)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * PROTECTED ROUTES - These paths REQUIRE authentication.
 */
const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

/**
 * AUTH ROUTES - Pass through to route handlers (no middleware intervention)
 */
function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/auth/") || pathname.startsWith("/api/auth/");
}

/**
 * STATIC ASSETS - Pass through
 */
function isStaticAsset(pathname: string): boolean {
  const staticPrefixes = ["/_next", "/favicon", "/robots", "/sitemap", "/apk"];
  const staticExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".css", ".js", ".map", ".woff", ".woff2", ".ttf", ".eot", ".xml", ".txt", ".json"];
  
  if (staticPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return true;
  }
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * PROTECTED ROUTES check
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * PUBLIC ROUTES - explicitly public
 */
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = ["/", "/auth-error", "/api/auth0/debug", "/api/auth0/me", "/api/auth0/test-config"];
  return publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

/**
 * Get base URL for redirects
 */
function getBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  const envBaseUrl = process.env.AUTH0_BASE_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envBaseUrl) {
    let url = envBaseUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url.replace(/\/$/, "");
  }
  
  if (IS_PRODUCTION) {
    throw new Error("No base URL configured in production");
  }
  
  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

// =============================================================================
// MIDDLEWARE FUNCTION
// =============================================================================

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. STATIC ASSETS → Pass through
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // 2. AUTH ROUTES → Pass through to route handlers
  // /auth/* handled by src/app/auth/*/route.ts
  // /api/auth/* handled by src/app/api/auth/[auth0]/route.ts (Auth0 SDK)
  if (isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  // 3. PUBLIC ROUTES → Pass through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 4. PROTECTED ROUTES → Check session
  if (isProtectedRoute(pathname)) {
    const sessionCookie = request.cookies.get("appSession");
    
    if (!sessionCookie?.value) {
      const baseUrl = getBaseUrl(request);
      const loginUrl = new URL("/auth/login", baseUrl);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    return NextResponse.next();
  }

  // 5. DEFAULT → Pass through (public)
  return NextResponse.next();
}

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
