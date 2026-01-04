/**
 * Auth0 SDK Route Handler (App Router)
 * 
 * This is the official Auth0 SDK integration point.
 * Handles: /api/auth/login, /api/auth/logout, /api/auth/callback, /api/auth/me
 */
import { handleAuth } from "@auth0/nextjs-auth0";

export const GET = handleAuth();
export const POST = handleAuth();
