/**
 * Next.js Middleware - Auth0 Authentication Boundary
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * RULES:
 * 1. auth0.middleware() is ONLY called here
 * 2. /auth/* routes are handled by Auth0 SDK via middleware
 * 3. Protected routes redirect to /auth/login if no session
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./src/lib/auth0";

// Protected path prefixes
const protectedPrefixes = ["/admin", "/dashboard", "/mesh", "/provisioning"];

// Public paths (never require auth)
const publicPaths = ["/", "/auth-error", "/health", "/api/health", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

function isProtected(pathname: string): boolean {
  return protectedPrefixes.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string): boolean {
  if (publicPaths.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/api/auth0/")) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|map|json)$/.test(pathname)) return true;
  return false;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. ALL requests go through auth0.middleware() first to handle cookies/session
  const authResponse = await auth0.middleware(req);

  // 2. /auth/* routes: return Auth0 SDK response directly
  if (pathname.startsWith("/auth")) {
    return authResponse;
  }

  // 3. Public paths: pass through
  if (isPublic(pathname)) {
    return authResponse;
  }

  // 4. Protected paths: check session
  if (isProtected(pathname)) {
    const session = await auth0.getSession(req);
    if (!session) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl, { status: 303 });
    }
  }

  // 5. Default: return auth response (preserves cookies)
  return authResponse;
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
