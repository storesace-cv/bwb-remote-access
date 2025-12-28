/**
 * Auth0 Management API Client
 * 
 * Server-side only - handles Auth0 Management API token retrieval and requests.
 * Uses client credentials grant with in-memory token caching.
 * 
 * Environment variables required:
 *   - AUTH0_MGMT_DOMAIN (or AUTH0_DOMAIN)
 *   - AUTH0_MGMT_CLIENT_ID
 *   - AUTH0_MGMT_CLIENT_SECRET
 */
import "server-only";

// Configuration from environment
const MGMT_DOMAIN = process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN || "";
const MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID || "";
const MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET || "";
const MGMT_AUDIENCE = process.env.AUTH0_MGMT_AUDIENCE || `https://${MGMT_DOMAIN}/api/v2/`;

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// Buffer time before token expiry (5 minutes)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Fetches a new Management API access token using client credentials grant.
 */
async function fetchManagementToken(): Promise<{ access_token: string; expires_in: number }> {
  if (!MGMT_DOMAIN || !MGMT_CLIENT_ID || !MGMT_CLIENT_SECRET) {
    throw new Error(
      "Auth0 Management API not configured. Set AUTH0_MGMT_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET"
    );
  }

  const response = await fetch(`https://${MGMT_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: MGMT_CLIENT_ID,
      client_secret: MGMT_CLIENT_SECRET,
      audience: MGMT_AUDIENCE,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to fetch Management API token:", errorText);
    throw new Error(`Failed to get Management API token: ${response.status}`);
  }

  return response.json();
}

/**
 * Gets a valid Management API token (from cache or fetches new one).
 */
export async function getMgmtToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid
  if (cachedToken && tokenExpiry > now + EXPIRY_BUFFER_MS) {
    return cachedToken;
  }

  // Fetch new token
  const { access_token, expires_in } = await fetchManagementToken();
  cachedToken = access_token;
  tokenExpiry = now + expires_in * 1000;

  return access_token;
}

/**
 * Makes an authenticated request to the Auth0 Management API.
 * 
 * @param path - API path (e.g., "/api/v2/users")
 * @param init - Fetch init options (method, body, etc.)
 * @returns Fetch Response
 */
export async function mgmtFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getMgmtToken();
  const baseUrl = `https://${MGMT_DOMAIN}`;
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

/**
 * Auth0 Management API response types
 */
export interface Auth0User {
  user_id: string;
  email: string;
  email_verified: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Auth0PasswordChangeTicket {
  ticket: string;
}

/**
 * Creates a user in Auth0 using the Management API.
 */
export async function createAuth0User(params: {
  email: string;
  connection: string;
  password?: string;
  name?: string;
  app_metadata?: Record<string, unknown>;
  email_verified?: boolean;
}): Promise<Auth0User> {
  const response = await mgmtFetch("/api/v2/users", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to create Auth0 user: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Gets an Auth0 user by email.
 */
export async function getAuth0UserByEmail(email: string): Promise<Auth0User | null> {
  const response = await mgmtFetch(
    `/api/v2/users-by-email?email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to get Auth0 user: ${error.message || response.status}`);
  }

  const users: Auth0User[] = await response.json();
  return users.length > 0 ? users[0] : null;
}

/**
 * Updates an Auth0 user's app_metadata.
 */
export async function updateAuth0UserMetadata(
  userId: string,
  appMetadata: Record<string, unknown>
): Promise<Auth0User> {
  const response = await mgmtFetch(`/api/v2/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ app_metadata: appMetadata }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to update Auth0 user: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Creates a password change ticket for a user.
 */
export async function createPasswordChangeTicket(
  userId: string,
  resultUrl?: string
): Promise<Auth0PasswordChangeTicket> {
  const response = await mgmtFetch("/api/v2/tickets/password-change", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      result_url: resultUrl,
      mark_email_as_verified: true,
      includeEmailInRedirect: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to create password change ticket: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Adds a user to an Auth0 Organization.
 */
export async function addUserToOrganization(
  orgId: string,
  userId: string
): Promise<void> {
  const response = await mgmtFetch(`/api/v2/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ members: [userId] }),
  });

  if (!response.ok) {
    // 409 = already a member, which is fine
    if (response.status === 409) {
      return;
    }
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to add user to organization: ${error.message || response.status}`);
  }
}

/**
 * Gets an Auth0 user by ID.
 */
export async function getAuth0UserById(userId: string): Promise<Auth0User> {
  const response = await mgmtFetch(`/api/v2/users/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to get Auth0 user: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Generic PATCH for Auth0 user.
 */
export async function patchAuth0User(
  userId: string,
  patch: Record<string, unknown>
): Promise<Auth0User> {
  const response = await mgmtFetch(`/api/v2/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to patch Auth0 user: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Sets the blocked status for an Auth0 user.
 */
export async function setAuth0UserBlocked(
  userId: string,
  blocked: boolean
): Promise<Auth0User> {
  return patchAuth0User(userId, { blocked });
}

/**
 * Extended Auth0User type with blocked field
 */
export interface Auth0UserWithBlocked extends Auth0User {
  blocked?: boolean;
}

