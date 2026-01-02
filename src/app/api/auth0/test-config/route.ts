/**
 * API Route: /api/auth0/test-callback
 * 
 * Diagnostic endpoint to test Auth0 callback processing WITHOUT actually
 * completing the flow. This helps identify configuration issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const headerStore = await headers();
  
  // Check environment
  const envDiag = {
    AUTH0_SECRET: process.env.AUTH0_SECRET 
      ? `set (${process.env.AUTH0_SECRET.length} chars, starts: ${process.env.AUTH0_SECRET.substring(0, 4)}...)` 
      : 'MISSING',
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || 'MISSING',
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID 
      ? `set (starts: ${process.env.AUTH0_CLIENT_ID.substring(0, 8)}...)` 
      : 'MISSING',
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET 
      ? `set (${process.env.AUTH0_CLIENT_SECRET.length} chars)` 
      : 'MISSING',
    APP_BASE_URL: process.env.APP_BASE_URL || 'NOT SET',
    AUTH0_BASE_URL: process.env.AUTH0_BASE_URL || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
  };
  
  // Headers received
  const proxyHeaders = {
    'host': headerStore.get('host'),
    'x-forwarded-host': headerStore.get('x-forwarded-host'),
    'x-forwarded-proto': headerStore.get('x-forwarded-proto'),
    'x-forwarded-port': headerStore.get('x-forwarded-port'),
  };
  
  // Expected callback URL
  const expectedCallback = `${process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || 'https://rustdesk.bwb.pt'}/auth/callback`;
  
  // Auth0 Application URLs that MUST be configured
  const requiredAuth0Config = {
    'Allowed Callback URLs': expectedCallback,
    'Allowed Logout URLs': process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || 'https://rustdesk.bwb.pt',
    'Allowed Web Origins': process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || 'https://rustdesk.bwb.pt',
  };
  
  // Common issues
  const issues: string[] = [];
  
  if (!process.env.AUTH0_SECRET) {
    issues.push('CRITICAL: AUTH0_SECRET is not set');
  } else if (process.env.AUTH0_SECRET.length < 32) {
    issues.push(`CRITICAL: AUTH0_SECRET is too short (${process.env.AUTH0_SECRET.length} chars, need 32+)`);
  }
  
  if (!process.env.AUTH0_DOMAIN) {
    issues.push('CRITICAL: AUTH0_DOMAIN is not set');
  }
  
  if (!process.env.AUTH0_CLIENT_ID) {
    issues.push('CRITICAL: AUTH0_CLIENT_ID is not set');
  }
  
  if (!process.env.AUTH0_CLIENT_SECRET) {
    issues.push('CRITICAL: AUTH0_CLIENT_SECRET is not set');
  }
  
  const baseUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL;
  if (!baseUrl) {
    issues.push('CRITICAL: Neither APP_BASE_URL nor AUTH0_BASE_URL is set');
  } else if (baseUrl.includes('localhost')) {
    issues.push('WARNING: Base URL contains localhost - will fail in production');
  }
  
  if (proxyHeaders['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    issues.push('WARNING: X-Forwarded-Proto is not https - cookies may not work');
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envDiag,
    proxyHeaders,
    expectedCallback,
    requiredAuth0Config,
    issues: issues.length > 0 ? issues : ['No critical issues detected'],
    instructions: [
      '1. Verify AUTH0_SECRET is EXACTLY the same across all deployments/restarts',
      '2. Verify AUTH0_DOMAIN is your Auth0 tenant (e.g., your-tenant.eu.auth0.com)',
      '3. In Auth0 Dashboard > Applications > Your App > Settings:',
      `   - Allowed Callback URLs must include: ${expectedCallback}`,
      `   - Allowed Logout URLs must include: ${requiredAuth0Config['Allowed Logout URLs']}`,
      '4. AUTH0_SECRET must be a random 32+ character hex string',
      '5. If you recently changed AUTH0_SECRET, users must re-login (old cookies invalid)',
    ],
  });
}
