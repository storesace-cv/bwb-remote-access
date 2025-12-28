/**
 * Auth0 singleton client for server-side operations.
 * 
 * Uses lazy initialization to avoid build-time warnings.
 * Auth0Client is only instantiated at runtime when first accessed,
 * and only if required environment variables are present.
 * 
 * Environment variables required:
 *   - AUTH0_SECRET
 *   - AUTH0_BASE_URL (or APP_BASE_URL)
 *   - AUTH0_DOMAIN
 *   - AUTH0_CLIENT_ID
 *   - AUTH0_CLIENT_SECRET
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
 * Checks if Auth0 is configured (all required env vars are set).
 * This check prevents Auth0Client instantiation during build when env vars aren't available.
 */
function isAuth0Configured(): boolean {
  return !!(
    process.env.AUTH0_SECRET &&
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    (process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL)
  );
}

/**
 * Gets the Auth0Client instance (lazy initialization).
 * Creates the client on first access to avoid build-time initialization.
 * Returns null if Auth0 is not configured (e.g., during build).
 * 
 * @returns Auth0Client instance or null if not configured
 */
function getAuth0Client(): Auth0Client | null {
  if (_auth0Client) {
    return _auth0Client;
  }

  // Skip initialization if Auth0 env vars aren't configured (build time)
  if (!isAuth0Configured()) {
    return null;
  }

  // Dynamic require to avoid build-time evaluation of Auth0Client constructor
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Auth0Client: Auth0ClientClass } = require("@auth0/nextjs-auth0/server");
  _auth0Client = new Auth0ClientClass() as Auth0Client;
  return _auth0Client;
}

/**
 * Auth0 client accessor object.
 * Provides a compatible interface while ensuring lazy initialization.
 * All method calls are delegated to the lazily-initialized Auth0Client.
 * Methods return null/empty values during build when Auth0 isn't configured.
 */
export const auth0 = {
  /**
   * Gets the session data for the current request.
   * Can be called with no arguments in App Router (Server Components, Route Handlers).
   */
  async getSession(req?: unknown) {
    const client = getAuth0Client();
    if (!client) {
      return null; // Return null during build
    }
    if (req !== undefined) {
      // Pages Router / middleware usage with request object
      return (client.getSession as (req: unknown) => ReturnType<Auth0Client["getSession"]>)(req);
    }
    // App Router usage without arguments
    return client.getSession();
  },

  /**
   * Gets the access token.
   */
  async getAccessToken(options?: unknown) {
    const client = getAuth0Client();
    if (!client) {
      throw new Error("Auth0 is not configured");
    }
    if (options !== undefined) {
      return (client.getAccessToken as (opts: unknown) => ReturnType<Auth0Client["getAccessToken"]>)(options);
    }
    return client.getAccessToken();
  },

  /**
   * Middleware handler for Auth0 routes.
   */
  middleware(req: Parameters<Auth0Client["middleware"]>[0]) {
    const client = getAuth0Client();
    if (!client) {
      throw new Error("Auth0 is not configured");
    }
    return client.middleware(req);
  },
};

// Export getAuth0Client for direct access if needed
export { getAuth0Client as getAuth0 };
