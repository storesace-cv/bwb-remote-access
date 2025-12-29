/**
 * Next.js Proxy - Auth0 Authentication Enforcer
 * 
 * Handles two concerns:
 * 1. Auth0 routes (/auth/*) - delegated to Auth0 SDK middleware
 * 2. Protected routes - enforces Auth0 session requirement
 * 
 * NOTE: In nextjs-auth0 v4, Auth0 routes are at /auth/* (not /api/auth/*)
 * The auth0.middleware() handles login, logout, callback, etc.
 * 
 * PUBLIC routes (no auth required):
 *   - /auth/*       (Auth0 login, logout, callback - handled by Auth0 SDK)
 *   - /_next/*      (Next.js internals)
 *   - /favicon.ico
 *   - Static assets
 * 
 * PROTECTED routes (Auth0 session required):
 *   - Everything else
 * 
 * If no Auth0 session exists, redirects to /auth/login
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

// Auth0 routes - handled by Auth0 SDK middleware
const AUTH0_ROUTES_PREFIX = "/auth";

// Public paths that don't require authentication (besides /auth/*)
const PUBLIC_PATHS = [
  "/_next",             // Next.js internals
  "/favicon.ico",
  "/rustdesk-logo.svg",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
  "/api/auth0/me",      // Auth0 session check endpoint
];

// Legacy routes to block (return 410 Gone)
const BLOCKED_LEGACY_ROUTES = [
  "/api/login",         // Legacy Supabase login
  "/api/auth/login",    // Legacy path - now at /auth/login
  "/api/auth/logout",   // Legacy path - now at /auth/logout
  "/api/auth/callback", // Legacy path - now at /auth/callback
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function isBlockedLegacyRoute(pathname: string): boolean {
  return BLOCKED_LEGACY_ROUTES.some((path) => pathname === path);
}

function isAuth0Route(pathname: string): boolean {
  return pathname.startsWith(AUTH0_ROUTES_PREFIX);
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.includes(".") &&
    (pathname.endsWith(".png") ||
      pathname.endsWith(".jpg") ||
      pathname.endsWith(".jpeg") ||
      pathname.endsWith(".gif") ||
      pathname.endsWith(".svg") ||
      pathname.endsWith(".ico") ||
      pathname.endsWith(".css") ||
      pathname.endsWith(".js") ||
      pathname.endsWith(".woff") ||
      pathname.endsWith(".woff2"))
  );
}

/**
 * Proxy function (Next.js 16+)
 * 
 * Handles Auth0 authentication routes and enforces session requirements.
 * In nextjs-auth0 v4, auth0.middleware() handles /auth/* routes internally.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block legacy authentication routes with helpful redirect message
  if (isBlockedLegacyRoute(pathname)) {
    // For legacy /api/auth/* routes, redirect to new /auth/* paths
    if (pathname.startsWith("/api/auth/")) {
      const newPath = pathname.replace("/api/auth/", "/auth/");
      return NextResponse.redirect(new URL(newPath, request.url));
    }
    
    return NextResponse.json(
      {
        error: "Gone",
        message: "This authentication endpoint has been deprecated. Please use Auth0 authentication at /auth/login",
      },
      { status: 410 }
    );
  }

  // Auth0 routes (/auth/*) - delegate to Auth0 SDK middleware
  // This handles login, logout, callback, me, profile, etc.
  if (isAuth0Route(pathname)) {
    return auth0.middleware(request);
  }

  // Allow other public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // For protected routes, check Auth0 session via cookie
  // Auth0 SDK stores session in 'appSession' cookie
  const sessionCookie = request.cookies.get("appSession");

  if (!sessionCookie?.value) {
    // No Auth0 session - redirect to Auth0 login
    const loginUrl = new URL("/auth/login", request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists - allow request
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
