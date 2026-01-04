/**
 * MeshCentral Session Generator
 * 
 * Generates time-limited login tokens for MeshCentral remote control.
 * Uses the MeshCentral loginTokenKey for AES-256-GCM encryption.
 * 
 * Environment variables required:
 *   - MESHCENTRAL_LOGIN_TOKEN_KEY: Hex string from `meshcentral --logintokenkey`
 *   - MESHCENTRAL_URL: Base URL for MeshCentral (e.g., https://mesh.example.com)
 * 
 * Security:
 *   - Tokens are time-limited (default 5 minutes)
 *   - Never expose the loginTokenKey
 *   - MeshCentral is the authentication source
 */
import "server-only";
import crypto from "crypto";

// Environment variables
const MESHCENTRAL_LOGIN_TOKEN_KEY = process.env.MESHCENTRAL_LOGIN_TOKEN_KEY || "";
const MESHCENTRAL_URL = process.env.MESHCENTRAL_URL || "";

// Default token lifetime in seconds (5 minutes)
const DEFAULT_TOKEN_LIFETIME_SECONDS = 300;

export interface MeshSessionConfig {
  loginTokenKey?: string;
  meshCentralUrl?: string;
}

export interface GenerateSessionResult {
  success: boolean;
  sessionUrl?: string;
  token?: string;
  expiresAt?: string;
  error?: string;
}

export interface MeshSessionRequest {
  /** The MeshCentral user identifier (typically email) */
  meshUser: string;
  /** The device node ID to connect to */
  nodeId: string;
  /** Token lifetime in seconds (default: 300 = 5 minutes) */
  lifetimeSeconds?: number;
}

/**
 * Checks if MeshCentral session generation is configured.
 */
export function isMeshCentralSessionConfigured(): boolean {
  return !!(MESHCENTRAL_LOGIN_TOKEN_KEY && MESHCENTRAL_URL);
}

/**
 * Gets the configured MeshCentral URL.
 */
export function getMeshCentralUrl(): string {
  return MESHCENTRAL_URL;
}

/**
 * Encodes a login token using MeshCentral's algorithm.
 * 
 * The algorithm:
 * 1. Create a JSON cookie object with user info and timestamp
 * 2. Derive AES-256 key from the loginTokenKey using SHA3-384
 * 3. Encrypt with AES-256-GCM
 * 4. Base64 encode with URL-safe character substitutions
 */
function encodeLoginToken(
  loginTokenKeyHex: string,
  username: string,
  expirationSeconds: number = DEFAULT_TOKEN_LIFETIME_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expirationSeconds;
  
  // MeshCentral cookie format for login tokens
  // a=3 indicates login token type
  // u is "user//<domain>/<username>" format
  // For simplicity, we use "user//<username>" which maps to default domain
  const cookie = JSON.stringify({
    a: 3,
    u: `user//${username}`,
    time: now,
    expire: expiresAt,
  });

  // Decode the hex key
  const keyBytes = Buffer.from(loginTokenKeyHex, "hex");
  
  // Derive AES-256 key using SHA3-384 (then truncate to 32 bytes for AES-256)
  const derivedKey = crypto.createHash("sha3-384").update(keyBytes).digest();
  const aesKey = derivedKey.slice(0, 32); // First 32 bytes for AES-256
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.randomBytes(12);
  
  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  let encrypted = cipher.update(cookie, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Combine: IV + encrypted data + auth tag
  const fullCiphertext = Buffer.concat([iv, encrypted, authTag]);
  
  // Base64 encode with URL-safe substitutions
  let token = fullCiphertext.toString("base64");
  token = token.replace(/\+/g, "@").replace(/\//g, "$").replace(/=/g, "");
  
  return token;
}

/**
 * Generates a MeshCentral session URL for remote device access.
 * 
 * This creates a time-limited login token and constructs a URL
 * that opens the device's remote control interface.
 * 
 * @param request - Session request parameters
 * @param config - Optional configuration overrides
 * @returns Session generation result with URL or error
 */
export function generateMeshCentralSession(
  request: MeshSessionRequest,
  config?: MeshSessionConfig
): GenerateSessionResult {
  const loginTokenKey = config?.loginTokenKey || MESHCENTRAL_LOGIN_TOKEN_KEY;
  const meshCentralUrl = config?.meshCentralUrl || MESHCENTRAL_URL;
  const lifetimeSeconds = request.lifetimeSeconds || DEFAULT_TOKEN_LIFETIME_SECONDS;

  // Validate configuration
  if (!loginTokenKey) {
    return {
      success: false,
      error: "MESHCENTRAL_LOGIN_TOKEN_KEY environment variable is not set",
    };
  }

  if (!meshCentralUrl) {
    return {
      success: false,
      error: "MESHCENTRAL_URL environment variable is not set",
    };
  }

  // Validate request
  if (!request.meshUser) {
    return {
      success: false,
      error: "meshUser is required",
    };
  }

  if (!request.nodeId) {
    return {
      success: false,
      error: "nodeId is required",
    };
  }

  try {
    // Generate the login token
    const token = encodeLoginToken(loginTokenKey, request.meshUser, lifetimeSeconds);
    
    // Calculate expiration time
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
    
    // Build the session URL
    // MeshCentral URL format: /login?token=<token>&node=<nodeId>
    // This opens the device directly after auto-login
    const baseUrl = meshCentralUrl.replace(/\/$/, ""); // Remove trailing slash
    const sessionUrl = `${baseUrl}/?login=${encodeURIComponent(token)}&node=${encodeURIComponent(request.nodeId)}`;

    return {
      success: true,
      sessionUrl,
      token,
      expiresAt,
    };
  } catch (error) {
    console.error("Error generating MeshCentral session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate session token",
    };
  }
}

/**
 * Maps a user email to a MeshCentral user identifier.
 * 
 * MeshCentral users are typically in format: user//<domain>/<username>
 * We map email to MeshCentral username.
 * 
 * @param email - User email
 * @param domain - User's organization domain
 * @returns MeshCentral user identifier
 */
export function mapEmailToMeshUser(
  email: string,
  domain: string | null
): string {
  // MeshCentral expects usernames without special characters
  // Convert email to a safe username format
  const safeEmail = email.toLowerCase().replace(/[^a-z0-9]/g, "_");
  
  // If we have a domain, prepend it (MeshCentral format)
  // Otherwise use just the email-based username
  return domain ? `${domain}_${safeEmail}` : safeEmail;
}

// Legacy alias for backwards compatibility
export const mapAuth0UserToMeshUser = mapEmailToMeshUser;

/**
 * Validates that a user can access a device based on domain.
 * 
 * @param userDomain - User's organization domain
 * @param deviceDomain - Device's domain
 * @param isSuperAdmin - Whether user is a super admin
 * @returns true if access is allowed
 */
export function canAccessDevice(
  userDomain: string | null,
  deviceDomain: string,
  isSuperAdmin: boolean
): boolean {
  // Super admins can access any device
  if (isSuperAdmin) {
    return true;
  }

  // Non-super admins can only access devices in their domain
  return userDomain === deviceDomain;
}
