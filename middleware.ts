/**
 * Next.js Middleware - Session-based Authentication
 * 
 * - Root (/) shows login form (handled by page, not middleware)
 * - Protected routes redirect to / if no session
 * - Authenticated users on /login redirect to /dashboard
 */

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "mesh_session";

const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];

function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/images/")) return true;
  if (pathname.startsWith("/apk/")) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff|woff2|ttf|eot|xml|txt|json|pdf)$/.test(pathname)) return true;
  return false;
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

function getPublicBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || "https://rustdesk.bwb.pt";
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static assets → pass through
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // 2. API routes → pass through
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 3. /login with session → redirect to dashboard
  if (pathname === "/login" && hasSession(request)) {
    const baseUrl = getPublicBaseUrl(request);
    return NextResponse.redirect(new URL("/dashboard", baseUrl), { status: 302 });
  }

  // 4. Protected routes without session → redirect to root
  if (isProtectedRoute(pathname) && !hasSession(request)) {
    const baseUrl = getPublicBaseUrl(request);
    return NextResponse.redirect(new URL("/", baseUrl), { status: 302 });
  }

  // 5. Everything else → pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
