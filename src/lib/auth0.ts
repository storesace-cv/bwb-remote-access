/**
 * Auth0 singleton client for server-side operations.
 * 
 * Uses lazy initialization to avoid build-time warnings.
 * Auth0Client is only instantiated at runtime when first accessed,
 * and only if required environment variables are present.
 * 
 * Environment variables required:
 *   - AUTH0_SECRET (32+ char hex string)
 *   - APP_BASE_URL or AUTH0_BASE_URL (PUBLIC URL, e.g., https://rustdesk.bwb.pt)
 *   - AUTH0_DOMAIN
 *   - AUTH0_CLIENT_ID
 *   - AUTH0_CLIENT_SECRET
 * 
 * IMPORTANT FOR REVERSE PROXY:
 *   - Base URL must match the PUBLIC domain users access
 *   - Cookie secure=true is automatic when base URL uses https://
 *   - Nginx must pass X-Forwarded-Proto and X-Forwarded-Host headers
 * 
 * Custom claims contract (injected by Auth0 Post-Login Action):
 *   - https://bwb.pt/claims/email
 *   - https://bwb.pt/claims/global_roles
 *   - https://bwb.pt/claims/org
 *   - https://bwb.pt/claims/org_roles
 */
import "server-only";
import type { Auth0Client } from "@auth0/nextjs-auth0/server";
import { getCanonicalBaseUrl, BaseUrlConfigError } from "./baseUrl";

// Lazy-initialized Auth0Client instance
let _auth0Client: Auth0Client | null = null;

/**
 * Gets the computed base URL from the canonical resolver.
 * Uses the same precedence as the rest of the application.
 * 
 * @throws BaseUrlConfigError in production if no base URL is configured
 */
export function getBaseUrl(): string {
  // In production, this will throw if not configured
  // In development, it will fallback to localhost
  return getCanonicalBaseUrl();
}

/**
 * Checks if Auth0 is configured (all required env vars are set).
 * This check prevents Auth0Client instantiation during build when env vars aren't available.
 */
function isAuth0Configured(): boolean {
  // Check base URL availability without throwing
  let hasBaseUrl = false;
  try {
    getCanonicalBaseUrl({ throwOnMissing: false });
    hasBaseUrl = !!(
      process.env.AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      process.env.NODE_ENV === 'development'
    );
  } catch {
    hasBaseUrl = false;
  }
  
  return !!(
    process.env.AUTH0_SECRET &&
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    hasBaseUrl
  );
}

/**
 * Gets the Auth0Client instance (lazy initialization).
 * Creates the client on first access to avoid build-time initialization.
 * Returns null if Auth0 is not configured (e.g., during build).
 * 
 * Configuration for reverse proxy:
 *   - appBaseUrl: Uses the canonical base URL resolver
 *   - session.cookie.secure: true (automatic for https URLs)
 *   - session.cookie.sameSite: 'lax' (default, works with redirects)
 * 
 * @returns Auth0Client instance or null if not configured
 * @throws BaseUrlConfigError in production if base URL is not configured
 */
function getAuth0Client(): Auth0Client | null {
  if (_auth0Client) {
    return _auth0Client;
  }

  // Skip initialization if Auth0 env vars aren't configured (build time)
  if (!isAuth0Configured()) {
    return null;
  }

  // Get base URL from canonical resolver
  // This will throw in production if not configured (NO localhost fallback)
  const baseUrl = getCanonicalBaseUrl();
  const isHttps = baseUrl.startsWith('https://');

  // Dynamic require to avoid build-time evaluation of Auth0Client constructor
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Auth0Client: Auth0ClientClass } = require("@auth0/nextjs-auth0/server");
  
  // Explicitly configure the client with session/cookie settings for reverse proxy
  _auth0Client = new Auth0ClientClass({
    // CRITICAL: Use the canonical base URL - NO localhost fallback in production
    appBaseUrl: baseUrl,
    
    // Session configuration for reverse proxy
    session: {
      rolling: true,
      // Cookie configuration
      cookie: {
        // Secure must be true when behind HTTPS reverse proxy
        secure: isHttps,
        // SameSite lax works with OAuth redirects
        sameSite: 'lax' as const,
        // Path for cookie
        path: '/',
      },
    },
  }) as Auth0Client;
  
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
