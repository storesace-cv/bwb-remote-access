/**
 * Auth0 Client Configuration - Single Transaction Enforcement
 * 
 * SOURCE OF TRUTH: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * INVARIANTS ENFORCED:
 *   1. SINGLE ACTIVE AUTH TRANSACTION (enableParallelTransactions: false)
 *   2. NO AUTH LOOPS (onCallback redirects to /auth-error on failure)
 *   3. SESSION PAYLOAD CONTROL (bounded cookies, no chunking)
 *   4. CONFIGURATION COHERENCE (base URL matches production domain)
 * 
 * Environment variables required:
 *   - AUTH0_SECRET (32+ char hex string)
 *   - APP_BASE_URL or AUTH0_BASE_URL (e.g., https://rustdesk.bwb.pt)
 *   - AUTH0_DOMAIN
 *   - AUTH0_CLIENT_ID
 *   - AUTH0_CLIENT_SECRET
 */
import "server-only";
import type { Auth0Client } from "@auth0/nextjs-auth0/server";
import { getCanonicalBaseUrl } from "./baseUrl";

// =============================================================================
// OBSERVABILITY: Structured logging for auth events
// =============================================================================

type LogLevel = 'info' | 'warn' | 'error';

interface AuthLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

/**
 * Generates a short correlation ID for tracking auth flows.
 * Uses only first 8 chars for brevity in logs.
 */
function generateCorrelationId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Masks sensitive values for safe logging.
 * Shows only first 4 and last 4 characters.
 */
function maskValue(value: string | undefined): string {
  if (!value || value.length < 12) return '[redacted]';
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

/**
 * Structured auth logger - NEVER logs secrets, tokens, or full cookies.
 */
function logAuth(level: LogLevel, event: string, details?: Record<string, unknown>): void {
  const entry: AuthLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    details,
  };
  
  const prefix = `[AUTH0:${level.toUpperCase()}]`;
  
  if (level === 'error') {
    console.error(prefix, JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(prefix, JSON.stringify(entry));
  } else {
    console.log(prefix, JSON.stringify(entry));
  }
}

// =============================================================================
// AUTH0 CLIENT CONFIGURATION
// =============================================================================

// Lazy-initialized Auth0Client instance (singleton)
let _auth0Client: Auth0Client | null = null;

/**
 * Gets the computed base URL from the canonical resolver.
 * @throws BaseUrlConfigError in production if no base URL is configured
 */
export function getBaseUrl(): string {
  return getCanonicalBaseUrl();
}

/**
 * Checks if Auth0 is configured (all required env vars are set).
 */
function isAuth0Configured(): boolean {
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
 * 
 * CRITICAL CONFIGURATION:
 *   - enableParallelTransactions: false (INVARIANT 2)
 *   - onCallback: redirects to /auth-error on failure (INVARIANT 4)
 *   - transactionCookie: secure + sameSite lax (INVARIANT 5)
 * 
 * @returns Auth0Client instance or null if not configured
 */
function getAuth0Client(): Auth0Client | null {
  if (_auth0Client) {
    return _auth0Client;
  }

  if (!isAuth0Configured()) {
    logAuth('warn', 'auth0_not_configured', {
      reason: 'Missing required environment variables',
    });
    return null;
  }

  const baseUrl = getCanonicalBaseUrl();
  const isProduction = process.env.NODE_ENV === 'production';
  
  // HARD FAIL: Localhost in production is NEVER allowed
  if (isProduction && baseUrl.includes('localhost')) {
    const error = `CRITICAL: Auth0 baseUrl contains 'localhost' in production. URL: ${baseUrl}`;
    logAuth('error', 'invalid_base_url', { baseUrl, isProduction });
    throw new Error(error);
  }
  
  const isHttps = baseUrl.startsWith('https://');
  
  logAuth('info', 'auth0_client_init', {
    baseUrl: maskValue(baseUrl),
    isHttps,
    isProduction,
    parallelTransactions: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Auth0Client: Auth0ClientClass } = require("@auth0/nextjs-auth0/server");
  
  _auth0Client = new Auth0ClientClass({
    // =======================================================================
    // BASE URL CONFIGURATION (INVARIANT 6: Configuration Coherence)
    // =======================================================================
    appBaseUrl: baseUrl,
    
    // =======================================================================
    // INVARIANT 2: SINGLE ACTIVE AUTH TRANSACTION
    // Disable parallel transactions to enforce one-at-a-time auth flow.
    // This prevents multiple state values and transaction cookie explosion.
    // =======================================================================
    enableParallelTransactions: false,
    
    // =======================================================================
    // SESSION CONFIGURATION (INVARIANT 5: Session Payload Control)
    // =======================================================================
    session: {
      rolling: true,
      absoluteDuration: 60 * 60 * 24 * 7, // 7 days
      inactivityDuration: 60 * 60 * 24,   // 1 day
      cookie: {
        secure: isHttps,
        sameSite: 'lax' as const,
        path: '/',
        // Do NOT set domain - let browser handle it for rustdesk.bwb.pt
      },
    },
    
    // =======================================================================
    // TRANSACTION COOKIE (INVARIANT 5: Session Payload Control)
    // Single transaction cookie, secure in production, sameSite lax for OAuth
    // =======================================================================
    transactionCookie: {
      secure: isHttps,
      sameSite: 'lax' as const,
      // Path must be root for callback to find it
      path: '/',
    },
    
    // =======================================================================
    // INVARIANT 4: NO AUTH LOOPS
    // On callback failure, redirect to /auth-error, NEVER restart auth.
    // =======================================================================
    onCallback: async (
      error: { message?: string; code?: string; cause?: unknown } | null,
      context: { returnTo?: string; responseType?: string },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _session: unknown
    ) => {
      const { NextResponse } = await import('next/server');
      const correlationId = generateCorrelationId();
      
      if (error) {
        // OBSERVABILITY: Log callback error (no secrets)
        logAuth('error', 'callback_error', {
          correlationId,
          errorCode: error.code || 'unknown',
          errorMessage: error.message || 'No message',
          hasContext: !!context,
          returnTo: context?.returnTo ? '[set]' : '[not set]',
        });
        
        // INVARIANT 4: Redirect to error page, NEVER restart auth
        const errorUrl = new URL('/auth-error', baseUrl);
        errorUrl.searchParams.set('e', error.code || 'callback_error');
        errorUrl.searchParams.set('cid', correlationId);
        return NextResponse.redirect(errorUrl);
      }
      
      // OBSERVABILITY: Log successful callback
      logAuth('info', 'callback_success', {
        correlationId,
        returnTo: context?.returnTo ? '[set]' : '[default:/]',
      });
      
      // Success - redirect to returnTo or home
      const returnTo = context?.returnTo || '/';
      return NextResponse.redirect(new URL(returnTo, baseUrl));
    },
  }) as Auth0Client;
  
  return _auth0Client;
}

// =============================================================================
// AUTH0 CLIENT ACCESSOR (PUBLIC API)
// =============================================================================

/**
 * Auth0 client accessor object with observability.
 * All method calls are delegated to the lazily-initialized Auth0Client.
 */
export const auth0 = {
  /**
   * Gets the session data for the current request.
   */
  async getSession(req?: unknown) {
    const client = getAuth0Client();
    if (!client) {
      return null;
    }
    if (req !== undefined) {
      return (client.getSession as (req: unknown) => ReturnType<Auth0Client["getSession"]>)(req);
    }
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
   * 
   * OBSERVABILITY: Logs auth route access for debugging.
   * INVARIANT 1: Each call to /auth/login initiates exactly ONE transaction.
   */
  middleware(req: Parameters<Auth0Client["middleware"]>[0]) {
    const client = getAuth0Client();
    if (!client) {
      throw new Error("Auth0 is not configured");
    }
    
    // OBSERVABILITY: Log auth route access
    const url = new URL(req.url);
    const correlationId = generateCorrelationId();
    
    // Check for cookies (NextRequest has cookies property)
    let hasStateCookie = false;
    let hasSessionCookie = false;
    
    if ('cookies' in req && req.cookies) {
      const cookies = req.cookies as { has: (name: string) => boolean; getAll: () => Array<{ name: string }> };
      hasStateCookie = cookies.has('__txn') || 
                       cookies.getAll().some((c: { name: string }) => c.name.startsWith('__txn'));
      hasSessionCookie = cookies.has('appSession');
    }
    
    logAuth('info', 'auth_route_access', {
      correlationId,
      path: url.pathname,
      method: req.method,
      hasStateCookie,
      hasSessionCookie,
    });
    
    return client.middleware(req);
  },
};

// Export for direct access if needed
export { getAuth0Client as getAuth0 };
export { logAuth };
