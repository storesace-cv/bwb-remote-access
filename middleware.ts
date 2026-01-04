/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * ARCHITECTURE RULES:
 * 1. This file MUST be at project ROOT as middleware.ts
 * 2. auth0.middleware() is ONLY called here (never in route handlers)
 * 3. /auth/* routes are delegated to auth0.middleware()
 * 4. /api/auth/* routes pass-through (NOT intercepted)
 * 5. NextResponse.next() is ONLY allowed in this file
 * 
 * Auth0 SDK v4 Routes (handled via middleware):
 *   /auth/login     → Redirects to Auth0 Universal Login
 *   /auth/logout    → Clears session and logs out
 *   /auth/callback  → Handles OAuth callback
 *   /auth/me        → Returns session info (JSON)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./src/lib/auth0";

// =============================================================================
// PATH CONFIGURATION
// =============================================================================

const publicPaths = [
  "/",
  "/auth-error",
  "/api/auth0/debug",
  "/api/auth0/me", 
  "/api/auth0/test-config",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const protectedPrefixes = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

// =============================================================================
// PATH HELPERS
// =============================================================================

function isPublic(pathname: string): boolean {
  if (publicPaths.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/images/")) return true;
  if (pathname.startsWith("/apk/")) return true;
  // Static file extensions
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff|woff2|ttf|eot|xml|txt|json)$/.test(pathname)) {
    return true;
  }
  return false;
}

function isProtected(pathname: string): boolean {
  return protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// =============================================================================
// MIDDLEWARE FUNCTION
// =============================================================================

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // -------------------------------------------------------------------------
  // 1. AUTH0 CANONICAL ROUTES → Delegate to auth0.middleware()
  // /auth/login, /auth/logout, /auth/callback, /auth/me, etc.
  // This is the ONLY place where auth0.middleware() is called.
  // -------------------------------------------------------------------------
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return auth0.middleware(req);
  }

  // -------------------------------------------------------------------------
  // 2. AUTH0 SDK API ROUTES → Pass-through (do NOT intercept)
  // These are handled by route handlers if they exist
  // -------------------------------------------------------------------------
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 3. PUBLIC PATHS → Pass-through
  // -------------------------------------------------------------------------
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // -------------------------------------------------------------------------
  // 4. PROTECTED ROUTES → Check session, redirect if missing
  // -------------------------------------------------------------------------
  if (isProtected(pathname)) {
    const session = await auth0.getSession(req);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(url);
    }
  }

  // -------------------------------------------------------------------------
  // 5. DEFAULT → Pass-through (public by default)
  // -------------------------------------------------------------------------
  return NextResponse.next();
}

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
