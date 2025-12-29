/**
 * API Route: POST /api/mesh/open-session
 * 
 * Opens a remote control session for a MeshCentral device.
 * Requires Auth0 session with appropriate permissions.
 * 
 * Request body:
 *   - nodeId: string - MeshCentral device node ID (e.g., "node/mesh/xxxxx")
 *   - domain: string - Device domain (mesh|zonetech|zsangola)
 * 
 * Response:
 *   - sessionUrl: URL to open for remote session
 *   - expiresAt: ISO timestamp when session token expires
 * 
 * Security:
 *   - Validates Auth0 JWT session
 *   - Verifies user has permission to access the device's domain
 *   - Generates time-limited MeshCentral login token
 *   - Never exposes MeshCentral credentials
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import {
  getClaimsFromAuth0Session,
  isSuperAdminAny,
} from "@/lib/rbac";
import {
  generateMeshCentralSession,
  isMeshCentralSessionConfigured,
  canAccessDevice,
  mapAuth0UserToMeshUser,
} from "@/lib/meshcentral-session";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

export interface OpenSessionRequest {
  nodeId: string;
  domain: ValidDomain;
}

export interface OpenSessionResponse {
  success: boolean;
  sessionUrl?: string;
  expiresAt?: string;
  error?: string;
  details?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<OpenSessionResponse>> {
  try {
    // 1. Validate Auth0 session
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          details: "Auth0 session required",
        },
        { status: 401 }
      );
    }

    // 2. Extract user claims
    const claims = getClaimsFromAuth0Session(session);
    const isSuperAdmin = isSuperAdminAny(claims);

    // Check if user has any org role
    const hasOrgRole =
      isSuperAdmin ||
      (claims.org && Object.keys(claims.orgRoles).length > 0);

    if (!hasOrgRole) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden",
          details: "User does not have required organization role",
        },
        { status: 403 }
      );
    }

    // 3. Parse and validate request body
    let body: OpenSessionRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          details: "Invalid JSON body",
        },
        { status: 400 }
      );
    }

    const { nodeId, domain } = body;

    if (!nodeId || typeof nodeId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          details: "nodeId is required and must be a string",
        },
        { status: 400 }
      );
    }

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          details: `domain must be one of: ${VALID_DOMAINS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 4. Authorization check - can user access this device's domain?
    if (!canAccessDevice(claims.org, domain, isSuperAdmin)) {
      console.warn(
        `[SECURITY] User ${claims.email} attempted to access device in domain ${domain} but belongs to ${claims.org}`
      );
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden",
          details: "You do not have permission to access devices in this domain",
        },
        { status: 403 }
      );
    }

    // 5. Check if MeshCentral session generation is configured
    if (!isMeshCentralSessionConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Service Unavailable",
          details:
            "MeshCentral session generation is not configured. " +
            "Please set MESHCENTRAL_LOGIN_TOKEN_KEY and MESHCENTRAL_URL environment variables.",
        },
        { status: 503 }
      );
    }

    // 6. Generate MeshCentral session
    const meshUser = mapAuth0UserToMeshUser(claims.email || "anonymous", claims.org);
    
    console.log(
      `[MESH SESSION] Generating session for user ${claims.email} (${meshUser}) to device ${nodeId} in domain ${domain}`
    );

    const sessionResult = generateMeshCentralSession({
      meshUser,
      nodeId,
      lifetimeSeconds: 300, // 5 minutes
    });

    if (!sessionResult.success) {
      console.error("[MESH SESSION] Failed to generate session:", sessionResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "Internal Server Error",
          details: sessionResult.error,
        },
        { status: 500 }
      );
    }

    console.log(
      `[MESH SESSION] Session generated successfully, expires at ${sessionResult.expiresAt}`
    );

    // 7. Return session URL (do NOT return the raw token)
    return NextResponse.json({
      success: true,
      sessionUrl: sessionResult.sessionUrl,
      expiresAt: sessionResult.expiresAt,
    });

  } catch (error) {
    console.error("Error in /api/mesh/open-session:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        details: message,
      },
      { status: 500 }
    );
  }
}
