/**
 * Next.js Middleware - Session-based Authentication
 * 
 * Authentication is based on MeshCentral credentials.
 * Session is stored in a cookie (mesh_session).
 * 
 * Protected routes redirect to /login if no session.
 */

import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// CONFIGURATION
// =============================================================================

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/auth-error",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
];

const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

const SESSION_COOKIE_NAME = "mesh_session";

// =============================================================================
// HELPERS
// =============================================================================

function getPublicBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  const envUrl = process.env.APP_BASE_URL;
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
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(prefix => 
    pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

function hasSession(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  return !!sessionCookie?.value;
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

  // 2. PUBLIC ROUTES → Pass through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 3. PROTECTED ROUTES → Check session
  if (isProtectedRoute(pathname)) {
    if (!hasSession(request)) {
      const baseUrl = getPublicBaseUrl(request);
      const loginUrl = new URL("/login", baseUrl);
      const returnTo = pathname + (search || "");
      loginUrl.searchParams.set("returnTo", returnTo);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }
    
    return NextResponse.next();
  }

  // 4. DEFAULT → Pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
