/**
 * Auth0 Catch-All Route Handler
 * 
 * This file is REQUIRED for @auth0/nextjs-auth0 v4 with App Router.
 * The [auth0] dynamic segment handles all Auth0 routes:
 *   /auth/login     → Redirects to Auth0 Universal Login
 *   /auth/logout    → Clears session, redirects to Auth0 logout
 *   /auth/callback  → Handles OAuth callback from Auth0
 *   /auth/profile   → Returns user profile (JSON)
 *   /auth/access-token → Returns access token (JSON)
 *   /auth/backchannel-logout → Handles backchannel logout
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * SDK: @auth0/nextjs-auth0 v4.14.0+
 */

import { handleAuth, handleLogin, handleCallback, handleLogout } from '@auth0/nextjs-auth0';
import { NextRequest } from 'next/server';

/**
 * Custom login handler with explicit returnTo handling
 */
const login = handleLogin({
  authorizationParams: {
    // Force prompt to ensure fresh login if needed
    // prompt: 'login', // Uncomment to force re-authentication
  },
  returnTo: '/', // Default returnTo if none specified
});

/**
 * Custom callback handler with error handling
 */
const callback = handleCallback({
  afterCallback: async (_req: NextRequest, session) => {
    // Session is established - can add custom logic here
    // e.g., sync user to database, add custom claims
    return session;
  },
});

/**
 * Custom logout handler
 */
const logout = handleLogout({
  returnTo: '/', // Where to go after logout
});

/**
 * Auth0 route handler - handles all /auth/* routes
 * 
 * GET /auth/login    → Initiates login flow
 * GET /auth/logout   → Initiates logout flow  
 * GET /auth/callback → Handles OAuth callback
 * GET /auth/profile  → Returns user profile
 * GET /auth/me       → Returns session info
 */
export const GET = handleAuth({
  login,
  callback,
  logout,
});

/**
 * POST handler for logout (some Auth0 configs use POST)
 */
export const POST = handleAuth({
  logout,
});
