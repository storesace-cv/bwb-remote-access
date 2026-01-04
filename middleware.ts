/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * NOTE: /auth/* routes are now handled by explicit route handlers in src/app/auth/
 * This middleware handles session protection for protected routes only.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./src/lib/auth0";

// =============================================================================
// CONFIGURATION
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

function getPublicBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  const envUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL;
  if (envUrl) {
    let url = envUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url.replace(/\/$/, "");
  }
  
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

  // 1. STATIC ASSETS → Pass through
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // 2. /auth/* → Let route handlers handle (src/app/auth/*)
  // Route handlers take precedence, middleware should not interfere
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 3. /api/auth/* → Pass through (if exists)
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // 4. PUBLIC ROUTES → Pass through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 5. PROTECTED ROUTES → Check session
  if (isProtectedRoute(pathname)) {
    try {
      const session = await auth0.getSession(request);
      
      if (!session) {
        const baseUrl = getPublicBaseUrl(request);
        const loginUrl = new URL("/auth/login", baseUrl);
        const returnTo = pathname + (search || "");
        loginUrl.searchParams.set("returnTo", returnTo);
        return NextResponse.redirect(loginUrl, { status: 302 });
      }
    } catch (error) {
      console.error("[MIDDLEWARE] Session check error:", error);
      const baseUrl = getPublicBaseUrl(request);
      const loginUrl = new URL("/auth/login", baseUrl);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }
    
    return NextResponse.next();
  }

  // 6. DEFAULT → Pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
