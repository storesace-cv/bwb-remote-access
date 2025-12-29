/**
 * Next.js Middleware - Auth0 Authentication Enforcer
 * 
 * Enforces Auth0-only authentication across the application.
 * 
 * PUBLIC routes (no auth required):
 *   - /api/auth/*  (Auth0 callback, login, logout)
 *   - /_next/*     (Next.js internals)
 *   - /favicon.ico
 *   - Static assets
 * 
 * PROTECTED routes (Auth0 session required):
 *   - Everything else
 * 
 * If no Auth0 session exists, redirects to /api/auth/login
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  "/api/auth",          // Auth0 routes (login, logout, callback, me)
  "/_next",             // Next.js internals
  "/favicon.ico",
  "/rustdesk-logo.svg",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
];

// Legacy routes to block (return 410 Gone)
const BLOCKED_LEGACY_ROUTES = [
  "/api/login",         // Legacy Supabase login
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function isBlockedLegacyRoute(pathname: string): boolean {
  return BLOCKED_LEGACY_ROUTES.some((path) => pathname === path);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block legacy authentication routes
  if (isBlockedLegacyRoute(pathname)) {
    return NextResponse.json(
      {
        error: "Gone",
        message: "This authentication endpoint has been deprecated. Please use Auth0 authentication at /api/auth/login",
      },
      { status: 410 }
    );
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
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
  ) {
    return NextResponse.next();
  }

  // For protected routes, check Auth0 session via cookie
  // Auth0 SDK stores session in 'appSession' cookie
  const sessionCookie = request.cookies.get("appSession");

  if (!sessionCookie?.value) {
    // No Auth0 session - redirect to Auth0 login
    const loginUrl = new URL("/api/auth/login", request.url);
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
