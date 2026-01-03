/**
 * Auth Flow E2E Tests
 * 
 * Tests the OAuth/OIDC invariants defined in:
 * /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
 * 
 * INVARIANTS TESTED:
 *   1. Single authorization request per login attempt
 *   2. No parallel transactions
 *   3. Callback terminates cleanly (no loops)
 *   4. Error path goes to /auth-error
 *   5. Static assets don't trigger auth
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://rustdesk.bwb.pt';

test.describe('Auth Flow Invariants', () => {
  
  /**
   * INVARIANT 1 & 2: Single Authorization Request
   * Clicking login should produce exactly ONE /authorize request
   */
  test('login produces exactly one authorize request', async ({ page }) => {
    const authorizeRequests: string[] = [];
    
    // Track all requests to Auth0 /authorize
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/authorize')) {
        authorizeRequests.push(url);
      }
    });
    
    // Go to protected page (triggers login redirect)
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Wait for redirect to Auth0
    await page.waitForURL(/auth0\.com|auth\/login/, { timeout: 10000 });
    
    // Should have exactly ONE authorize request
    expect(authorizeRequests.length).toBe(1);
  });

  /**
   * INVARIANT 5: Static Assets Don't Trigger Auth
   * Loading static assets concurrently should NOT restart auth
   */
  test('static assets do not trigger auth', async ({ page }) => {
    const authRequests: string[] = [];
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/auth/login') || url.includes('/authorize')) {
        authRequests.push(url);
      }
    });
    
    // Load the home page (public)
    await page.goto(`${BASE_URL}/`);
    
    // Simulate multiple asset loads
    await Promise.all([
      page.evaluate(() => fetch('/_next/static/chunks/main.js').catch(() => {})),
      page.evaluate(() => fetch('/favicon.ico').catch(() => {})),
      page.evaluate(() => fetch('/robots.txt').catch(() => {})),
    ]);
    
    // Wait a bit for any delayed requests
    await page.waitForTimeout(1000);
    
    // No auth requests should have been triggered
    expect(authRequests.length).toBe(0);
  });

  /**
   * INVARIANT 4: Error Path Goes to /auth-error
   * When callback fails, user should land on /auth-error, not login loop
   */
  test('callback error terminates in auth-error page', async ({ page }) => {
    // Directly hit callback with invalid state
    await page.goto(
      `${BASE_URL}/auth/callback?code=fake&state=invalid_state_value`
    );
    
    // Should redirect to /auth-error (not loop back to login)
    await page.waitForURL(/auth-error/, { timeout: 10000 });
    
    // Verify we're on the error page
    expect(page.url()).toContain('/auth-error');
    
    // Verify error page content
    const heading = await page.locator('h1').textContent();
    expect(heading).toContain('Login Failed');
  });

  /**
   * INVARIANT 3: No Redirect Loops
   * Accessing /auth-error should not redirect anywhere
   */
  test('auth-error page is accessible without auth', async ({ page }) => {
    const redirects: string[] = [];
    
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        redirects.push(request.url());
      }
    });
    
    // Go directly to auth-error
    await page.goto(`${BASE_URL}/auth-error?e=test`);
    
    // Should stay on auth-error (not redirect to login)
    expect(page.url()).toContain('/auth-error');
    
    // Should not have triggered any auth redirects
    const authRedirects = redirects.filter(url => 
      url.includes('/auth/login') || url.includes('/authorize')
    );
    expect(authRedirects.length).toBe(0);
  });

  /**
   * INVARIANT 1: Protected Route Redirects Once
   * Accessing protected route without session should redirect ONCE to login
   */
  test('protected route redirects once to login', async ({ page }) => {
    const loginRedirects: string[] = [];
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/auth/login')) {
        loginRedirects.push(url);
      }
    });
    
    // Go to protected page
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Wait for auth redirect
    await page.waitForURL(/auth\/login|auth0\.com/, { timeout: 10000 });
    
    // Should have exactly ONE login redirect
    expect(loginRedirects.length).toBeLessThanOrEqual(1);
  });

  /**
   * Cookie Stability Check
   * Headers should not explode with multiple cookies
   */
  test('cookie count remains bounded', async ({ page, context }) => {
    // Go to public page
    await page.goto(`${BASE_URL}/`);
    
    // Get cookies
    const cookies = await context.cookies();
    
    // Filter auth-related cookies
    const authCookies = cookies.filter(c => 
      c.name.startsWith('__txn') || 
      c.name.includes('appSession') ||
      c.name.includes('auth0')
    );
    
    // Should have at most a few auth cookies (not dozens)
    expect(authCookies.length).toBeLessThanOrEqual(3);
  });

});

test.describe('Public Routes', () => {
  
  test('home page is accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/`);
    expect(response?.status()).toBeLessThan(400);
  });

  test('auth-error page is accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/auth-error`);
    expect(response?.status()).toBe(200);
  });

  test('api/auth0/test-config is accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/api/auth0/test-config`);
    expect(response?.status()).toBe(200);
  });

});
