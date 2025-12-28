/**
 * Auth0 Route Handler for Next.js App Router (v4)
 * 
 * This creates the following endpoints:
 *   - /api/auth/login     → Redirects to Auth0 login page
 *   - /api/auth/logout    → Logs user out and redirects
 *   - /api/auth/callback  → Handles Auth0 callback after login
 *   - /api/auth/me        → Returns current user session (JSON)
 *   - /api/auth/backchannel-logout  → Handles backchannel logout
 *   - /api/auth/profile   → Returns user profile
 * 
 * Claims contract (injected by Auth0 Post-Login Action):
 *   - https://bwb.pt/claims/email
 *   - https://bwb.pt/claims/global_roles
 *   - https://bwb.pt/claims/org
 *   - https://bwb.pt/claims/org_roles
 */

import { auth0 } from "@/lib/auth0";

export const GET = auth0.handleAuth();
export const POST = auth0.handleAuth();
