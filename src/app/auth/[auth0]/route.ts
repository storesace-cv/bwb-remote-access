/**
 * Auth0 Dynamic Route Handler for App Router
 * 
 * This catch-all route handler enables the Auth0 SDK to process authentication
 * requests in Next.js App Router. The [auth0] segment captures all auth-related
 * paths like /auth/login, /auth/logout, /auth/callback, etc.
 * 
 * Routes handled:
 *   GET  /auth/login        → Redirects to Auth0 Universal Login
 *   GET  /auth/logout       → Clears session, redirects to Auth0 logout
 *   GET  /auth/callback     → Handles OAuth callback from Auth0
 *   GET  /auth/profile      → Returns user profile (JSON)
 *   GET  /auth/access-token → Returns access token (JSON)
 *   POST /auth/backchannel-logout → Handles backchannel logout
 * 
 * IMPORTANT: This file works in conjunction with middleware.ts
 * The middleware calls auth0.middleware() which routes to the Auth0Client handler.
 * This route file ensures Next.js recognizes /auth/* as valid routes (not 404).
 * 
 * SDK: @auth0/nextjs-auth0 v4.14.0+
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

/**
 * GET handler for all auth routes
 * Delegates to Auth0 SDK middleware
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auth0: string }> }
): Promise<NextResponse> {
  const { auth0: route } = await params;
  console.log(`[AUTH ROUTE] GET /auth/${route}`);
  
  try {
    // Delegate to Auth0 SDK
    return await auth0.middleware(request);
  } catch (error) {
    console.error(`[AUTH ROUTE] Error processing /auth/${route}:`, error);
    return NextResponse.json(
      { 
        error: 'Authentication error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        route: `/auth/${route}`
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for auth routes that accept POST
 * Primarily for /auth/backchannel-logout
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auth0: string }> }
): Promise<NextResponse> {
  const { auth0: route } = await params;
  console.log(`[AUTH ROUTE] POST /auth/${route}`);
  
  try {
    return await auth0.middleware(request);
  } catch (error) {
    console.error(`[AUTH ROUTE] Error processing POST /auth/${route}:`, error);
    return NextResponse.json(
      { 
        error: 'Authentication error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        route: `/auth/${route}`
      },
      { status: 500 }
    );
  }
}
