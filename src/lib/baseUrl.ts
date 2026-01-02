/**
 * Canonical Base URL Resolver
 * 
 * Single source of truth for resolving the application's base URL.
 * This module MUST be used by all code that needs the base URL.
 * 
 * STRICT PRECEDENCE ORDER:
 *   1. AUTH0_BASE_URL (Auth0 SDK standard)
 *   2. APP_BASE_URL (Custom deployment variable)
 *   3. NEXT_PUBLIC_SITE_URL (Vercel/generic)
 *   4. NEXT_PUBLIC_VERCEL_URL (Vercel auto-set)
 *   5. ONLY in development → http://localhost:3000
 *   6. In production without config → THROWS ERROR (no silent fallback)
 * 
 * HARD-FAIL IN PRODUCTION:
 *   - If resolved URL contains localhost, 127.0.0.1, 0.0.0.0 → THROWS
 *   - No silent fallback, ever
 * 
 * HTTPS ENFORCEMENT:
 *   - URLs without protocol get https:// prepended
 *   - http:// is ONLY allowed in development
 *   - Trailing slashes are normalized (removed)
 */

/**
 * Configuration error thrown when base URL cannot be resolved or is invalid.
 */
export class BaseUrlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaseUrlConfigError';
  }
}

/**
 * Internal/private host patterns that are NEVER allowed in production.
 * This is the SINGLE SOURCE OF TRUTH for internal host detection.
 */
const INTERNAL_HOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '10.',      // Private network 10.0.0.0/8
  '192.168.', // Private network 192.168.0.0/16
  '172.16.',  // Private network 172.16.0.0/12
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
];

/**
 * Checks if a URL or host string represents an internal/private address.
 * This is the SINGLE SOURCE OF TRUTH for internal host detection.
 * All production hard-fail checks MUST route through this function.
 * 
 * @param urlOrHost - A full URL (e.g., "https://localhost:3000") or host string (e.g., "localhost")
 * @returns true if the URL/host is internal/private, false otherwise
 */
function isInternalHost(urlOrHost: string): boolean {
  // Normalize: extract host if it's a URL, lowercase for comparison
  let host = urlOrHost.toLowerCase().trim();
  
  // If it looks like a URL, extract the host portion
  if (host.includes('://')) {
    try {
      const url = new URL(host);
      host = url.hostname;
    } catch {
      // If URL parsing fails, use the original string
    }
  }
  
  // Check against all internal patterns
  return INTERNAL_HOST_PATTERNS.some(pattern => host.includes(pattern));
}

/**
 * Checks if we are in development mode.
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Normalizes a URL:
 *   - Adds https:// if no protocol (in production)
 *   - Allows http:// only in development
 *   - Removes trailing slashes
 */
function normalizeUrl(url: string, allowHttp: boolean): string {
  let normalized = url.trim();
  
  // Add protocol if missing
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  
  // In production, enforce HTTPS (unless explicitly http in dev)
  if (!allowHttp && normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'https://');
  }
  
  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Resolves the canonical base URL for the application.
 * 
 * PRODUCTION BEHAVIOR:
 *   - HARD FAIL if no base URL configured
 *   - HARD FAIL if resolved URL is internal/localhost/private
 * 
 * DEVELOPMENT BEHAVIOR:
 *   - Allows localhost fallback
 * 
 * @param options.allowLocalhost - If true, allows localhost fallback in development (default: true)
 * @param options.throwOnMissing - If true, throws error when URL cannot be resolved (default: true in production)
 * @returns The canonical base URL without trailing slash
 * @throws BaseUrlConfigError if URL cannot be resolved or is internal in production
 * 
 * @example
 * // Standard usage
 * const baseUrl = getCanonicalBaseUrl();
 * // Returns: "https://rustdesk.bwb.pt"
 * 
 * @example
 * // For redirect URLs
 * const redirectUrl = `${getCanonicalBaseUrl()}/auth/callback`;
 */
export function getCanonicalBaseUrl(options?: {
  allowLocalhost?: boolean;
  throwOnMissing?: boolean;
}): string {
  const {
    allowLocalhost = true,
    throwOnMissing = !isDevelopment(),
  } = options ?? {};
  
  const inDev = isDevelopment();
  
  // Strict precedence order
  const candidates = [
    process.env.AUTH0_BASE_URL,
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ];
  
  // Find first non-empty candidate
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      const normalized = normalizeUrl(candidate, inDev);
      
      // PRODUCTION HARD-FAIL: Internal hosts are NEVER allowed
      // All internal host detection routes through isInternalHost()
      if (!inDev && isInternalHost(normalized)) {
        throw new BaseUrlConfigError(
          `Base URL "${normalized}" is an internal/private address. ` +
          'Production requires a public domain. ' +
          'Set AUTH0_BASE_URL or APP_BASE_URL to your public domain.'
        );
      }
      
      return normalized;
    }
  }
  
  // Development fallback
  if (inDev && allowLocalhost) {
    return 'http://localhost:3000';
  }
  
  // Production without configuration - HARD FAIL
  if (throwOnMissing) {
    throw new BaseUrlConfigError(
      'Cannot resolve base URL in production. ' +
      'Set one of: AUTH0_BASE_URL, APP_BASE_URL, NEXT_PUBLIC_SITE_URL, or NEXT_PUBLIC_VERCEL_URL'
    );
  }
  
  // Fallback only if explicitly allowed (not recommended)
  return 'http://localhost:3000';
}

/**
 * Gets the base URL with a trailing slash.
 * Useful for building URLs where you'll append a path without leading slash.
 * 
 * @example
 * const url = `${getCanonicalBaseUrlWithSlash()}auth/callback`;
 */
export function getCanonicalBaseUrlWithSlash(): string {
  return `${getCanonicalBaseUrl()}/`;
}

/**
 * Builds a full URL from a path using the canonical base URL.
 * 
 * @param path - The path to append (with or without leading slash)
 * @returns Full URL
 * 
 * @example
 * buildUrl('/auth/callback');  // "https://rustdesk.bwb.pt/auth/callback"
 * buildUrl('auth/callback');   // "https://rustdesk.bwb.pt/auth/callback"
 */
export function buildUrl(path: string): string {
  const base = getCanonicalBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Validates that the base URL is properly configured.
 * Useful for startup checks or health endpoints.
 * 
 * Uses isInternalHost() as the SINGLE SOURCE OF TRUTH for internal host detection.
 * 
 * @returns Object with validation status and details
 */
export function validateBaseUrlConfig(): {
  valid: boolean;
  baseUrl: string | null;
  source: string | null;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  let source: string | null = null;
  let baseUrl: string | null = null;
  
  const inDev = isDevelopment();
  
  // Check each source in precedence order
  if (process.env.AUTH0_BASE_URL) {
    source = 'AUTH0_BASE_URL';
    baseUrl = process.env.AUTH0_BASE_URL;
  } else if (process.env.APP_BASE_URL) {
    source = 'APP_BASE_URL';
    baseUrl = process.env.APP_BASE_URL;
  } else if (process.env.NEXT_PUBLIC_SITE_URL) {
    source = 'NEXT_PUBLIC_SITE_URL';
    baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    source = 'NEXT_PUBLIC_VERCEL_URL';
    baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  } else if (inDev) {
    source = 'development-fallback';
    baseUrl = 'http://localhost:3000';
    warnings.push('Using localhost fallback (only valid in development)');
  } else {
    errors.push('No base URL configured and not in development mode');
  }
  
  // Validate the URL if we have one
  if (baseUrl) {
    const normalized = normalizeUrl(baseUrl, inDev);
    
    if (!inDev && normalized.startsWith('http://')) {
      warnings.push('Base URL uses http:// in non-development mode');
    }
    
    // SINGLE SOURCE OF TRUTH: Use isInternalHost() for internal host detection
    if (!inDev && isInternalHost(normalized)) {
      errors.push('Internal/private host in base URL is not allowed in production');
    }
    
    baseUrl = normalized;
  }
  
  return {
    valid: errors.length === 0,
    baseUrl,
    source,
    warnings,
    errors,
  };
}
