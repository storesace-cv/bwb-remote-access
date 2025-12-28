/**
 * Auth0 singleton client for server-side operations.
 * 
 * Uses lazy initialization to avoid build-time warnings.
 * Auth0Client is only instantiated at runtime when first accessed.
 * 
 * Environment variables required:
 *   - AUTH0_SECRET
 *   - AUTH0_BASE_URL
 *   - AUTH0_ISSUER_BASE_URL
 *   - AUTH0_CLIENT_ID
 *   - AUTH0_CLIENT_SECRET
 *   - AUTH0_AUDIENCE (optional)
 * 
 * Custom claims contract (injected by Auth0 Post-Login Action):
 *   - https://bwb.pt/claims/email
 *   - https://bwb.pt/claims/global_roles
 *   - https://bwb.pt/claims/org
 *   - https://bwb.pt/claims/org_roles
 */
import "server-only";
import type { Auth0Client } from "@auth0/nextjs-auth0/server";

// Lazy-initialized Auth0Client instance
let _auth0Client: Auth0Client | null = null;

/**
 * Gets the Auth0Client instance (lazy initialization).
 * Creates the client on first access to avoid build-time initialization.
 * 
 * @returns Auth0Client instance
 */
export function getAuth0(): Auth0Client {
  if (!_auth0Client) {
    // Dynamic import to avoid build-time evaluation
    const { Auth0Client: Auth0ClientClass } = require("@auth0/nextjs-auth0/server");
    _auth0Client = new Auth0ClientClass();
  }
  return _auth0Client;
}

/**
 * Auth0 client accessor object.
 * Provides a compatible interface while ensuring lazy initialization.
 */
export const auth0 = {
  get client(): Auth0Client {
    return getAuth0();
  },
  getSession(...args: Parameters<Auth0Client["getSession"]>) {
    return getAuth0().getSession(...args);
  },
  getAccessToken(...args: Parameters<Auth0Client["getAccessToken"]>) {
    return getAuth0().getAccessToken(...args);
  },
  middleware(req: Parameters<Auth0Client["middleware"]>[0]) {
    return getAuth0().middleware(req);
  },
};
