/**
 * API Route: /api/auth0/debug
 * 
 * Diagnostics endpoint for debugging Auth0 session issues behind reverse proxy.
 * Returns sanitized information about:
 *   - Session existence (boolean)
 *   - Relevant request headers (forwarded headers)
 *   - Cookie names present (no values)
 *   - Computed base URL the SDK is using
 * 
 * DOES NOT leak secrets or sensitive data.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { auth0, getBaseUrl } from "@/lib/auth0";
import { validateBaseUrlConfig, getCanonicalBaseUrl } from "@/lib/baseUrl";

export async function GET(request: NextRequest) {
  try {
    // Get headers
    const headerStore = await headers();
    const cookieStore = await cookies();
    
    // Collect relevant proxy headers
    const proxyHeaders: Record<string, string | null> = {
      'host': headerStore.get('host'),
      'x-forwarded-host': headerStore.get('x-forwarded-host'),
      'x-forwarded-proto': headerStore.get('x-forwarded-proto'),
      'x-forwarded-for': headerStore.get('x-forwarded-for'),
      'x-real-ip': headerStore.get('x-real-ip'),
      'origin': headerStore.get('origin'),
      'referer': headerStore.get('referer') ? '[present]' : null,
    };
    
    // Collect cookie NAMES only (no values for security)
    const cookieNames = cookieStore.getAll().map(c => c.name);
    
    // Check for Auth0 session cookies specifically
    const hasAppSession = cookieNames.includes('appSession');
    const has__session = cookieNames.includes('__session');
    
    // Get session status
    let sessionExists = false;
    let sessionError: string | null = null;
    let userSub: string | null = null;
    
    try {
      const session = await auth0.getSession();
      sessionExists = !!session?.user;
      if (session?.user?.sub) {
        // Only show first 10 chars of sub for privacy
        userSub = session.user.sub.substring(0, 10) + '...';
      }
    } catch (err) {
      sessionError = err instanceof Error ? err.message : 'Unknown error';
    }
    
    // Get computed base URL
    const configuredBaseUrl = getBaseUrl();
    const requestUrl = request.url;
    const requestOrigin = new URL(requestUrl).origin;
    
    // Environment check (without exposing values)
    const envCheck = {
      AUTH0_SECRET: process.env.AUTH0_SECRET ? 'set' : 'MISSING',
      AUTH0_DOMAIN: process.env.AUTH0_DOMAIN ? 'set' : 'MISSING',
      AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ? 'set' : 'MISSING',
      AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET ? 'set' : 'MISSING',
      APP_BASE_URL: process.env.APP_BASE_URL || 'NOT SET',
      AUTH0_BASE_URL: process.env.AUTH0_BASE_URL || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    };
    
    // URL analysis
    const urlAnalysis = {
      configuredBaseUrl,
      requestOrigin,
      baseUrlMatchesOrigin: configuredBaseUrl === requestOrigin,
      isHttps: configuredBaseUrl?.startsWith('https://'),
      requestProtocol: new URL(requestUrl).protocol,
      forwardedProto: proxyHeaders['x-forwarded-proto'],
    };
    
    // Potential issues detection
    const potentialIssues: string[] = [];
    
    // Add base URL validation
    const baseUrlValidation = validateBaseUrlConfig();
    potentialIssues.push(...baseUrlValidation.warnings);
    potentialIssues.push(...baseUrlValidation.errors);
    
    // Get canonical base URL (with error handling)
    let canonicalBaseUrl: string | null = null;
    try {
      canonicalBaseUrl = getCanonicalBaseUrl({ throwOnMissing: false });
    } catch {
      potentialIssues.push('Failed to resolve canonical base URL');
    }
    
    if (!configuredBaseUrl) {
      potentialIssues.push('APP_BASE_URL is not set');
    }
    
    if (configuredBaseUrl && !configuredBaseUrl.startsWith('https://') && proxyHeaders['x-forwarded-proto'] === 'https') {
      potentialIssues.push('APP_BASE_URL uses http:// but reverse proxy uses https - cookie secure mismatch likely');
    }
    
    if (configuredBaseUrl && proxyHeaders['x-forwarded-host'] && !configuredBaseUrl.includes(proxyHeaders['x-forwarded-host'])) {
      potentialIssues.push(`APP_BASE_URL (${configuredBaseUrl}) does not match X-Forwarded-Host (${proxyHeaders['x-forwarded-host']})`);
    }
    
    if (!proxyHeaders['x-forwarded-proto']) {
      potentialIssues.push('X-Forwarded-Proto header is missing - reverse proxy may not be configured correctly');
    }
    
    if (!hasAppSession && !has__session) {
      potentialIssues.push('No Auth0 session cookies found (appSession or __session)');
    }
    
    if (sessionError) {
      potentialIssues.push(`Session read error: ${sessionError}`);
    }
    
    // Check for localhost in production
    if (canonicalBaseUrl?.includes('localhost') && process.env.NODE_ENV === 'production') {
      potentialIssues.push('CRITICAL: localhost detected in base URL in production mode');
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      session: {
        exists: sessionExists,
        userSubPrefix: userSub,
        error: sessionError,
      },
      cookies: {
        names: cookieNames,
        hasAppSession,
        has__session,
      },
      headers: proxyHeaders,
      environment: envCheck,
      urlAnalysis: {
        ...urlAnalysis,
        canonicalBaseUrl,
        canonicalSource: baseUrlValidation.source,
      },
      baseUrlValidation: {
        valid: baseUrlValidation.valid,
        source: baseUrlValidation.source,
        warnings: baseUrlValidation.warnings,
        errors: baseUrlValidation.errors,
      },
      potentialIssues: potentialIssues.length > 0 ? potentialIssues : ['None detected'],
    });
  } catch (error) {
    console.error("Error in /api/auth0/debug:", error);
    return NextResponse.json(
      { 
        error: "Internal error",
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
