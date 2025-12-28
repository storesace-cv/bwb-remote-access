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
 * Uses dynamic require to prevent build-time class instantiation.
 * 
 * @returns Auth0Client instance
 */
function getAuth0Client(): Auth0Client {
  if (!_auth0Client) {
    // Dynamic require to avoid build-time evaluation of Auth0Client constructor
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Auth0Client: Auth0ClientClass } = require("@auth0/nextjs-auth0/server");
    _auth0Client = new Auth0ClientClass();
  }
  return _auth0Client;
}

/**
 * Auth0 client accessor object.
 * Provides a compatible interface while ensuring lazy initialization.
 * All method calls are delegated to the lazily-initialized Auth0Client.
 */
export const auth0 = {
  /**
   * Gets the session data for the current request.
   * Can be called with no arguments in App Router (Server Components, Route Handlers).
   */
  getSession(req?: unknown) {
    const client = getAuth0Client();
    if (req !== undefined) {
      return client.getSession(req as Parameters<Auth0Client["getSession"]>[0]);
    }
    return client.getSession();
  },

  /**
   * Gets the access token.
   */
  getAccessToken(options?: Parameters<Auth0Client["getAccessToken"]>[0]) {
    return getAuth0Client().getAccessToken(options);
  },

  /**
   * Middleware handler for Auth0 routes.
   */
  middleware(req: Parameters<Auth0Client["middleware"]>[0]) {
    return getAuth0Client().middleware(req);
  },
};

// Export getAuth0Client for direct access if needed
export { getAuth0Client as getAuth0 };
