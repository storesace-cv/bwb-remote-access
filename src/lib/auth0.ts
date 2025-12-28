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
import { Auth0Client } from "@auth0/nextjs-auth0/server";

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
    _auth0Client = new Auth0Client();
  }
  return _auth0Client;
}

// Re-export for backwards compatibility (deprecated - use getAuth0() instead)
// This creates a Proxy that delegates all calls to the lazy-initialized client
export const auth0: Auth0Client = new Proxy({} as Auth0Client, {
  get(_target, prop) {
    const client = getAuth0();
    const value = client[prop as keyof Auth0Client];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
