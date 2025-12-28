/**
 * Auth0 Route Handler for Next.js App Router
 * 
 * This creates the following endpoints:
 *   - /api/auth/login     → Redirects to Auth0 login page
 *   - /api/auth/logout    → Logs user out and redirects
 *   - /api/auth/callback  → Handles Auth0 callback after login
 *   - /api/auth/me        → Returns current user session (JSON)
 * 
 * Claims contract (injected by Auth0 Post-Login Action):
 *   - https://bwb.pt/claims/email
 *   - https://bwb.pt/claims/global_roles
 *   - https://bwb.pt/claims/org
 *   - https://bwb.pt/claims/org_roles
 */

import { handleAuth } from "@auth0/nextjs-auth0";

export const GET = handleAuth();
