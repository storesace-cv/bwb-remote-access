/**
 * API Route: POST /api/mesh/open-session
 * 
 * Opens a remote control session for a MeshCentral device.
 * Requires MeshCentral session with appropriate permissions.
 * 
 * Request body:
 *   - nodeId: string - MeshCentral device node ID (e.g., "node/mesh/xxxxx")
 *   - domain: string - Device domain (mesh|zonetech|zsangola)
 * 
 * Response:
 *   - sessionUrl: URL to open for remote session
 *   - expiresAt: ISO timestamp when session token expires
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims, canAccessDomain, type ValidDomain, VALID_DOMAINS } from "@/lib/rbac-mesh";
import {
  generateMeshCentralSession,
  isMeshCentralSessionConfigured,
} from "@/lib/meshcentral-session";

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

/**
 * Map email to MeshCentral username format
 */
function mapToMeshUser(email: string, domain: string | null): string {
  // Use email prefix as mesh username, scoped by domain
  const username = email.split("@")[0];
  return domain ? `${domain}/${username}` : username;
}

export async function POST(req: NextRequest): Promise<NextResponse<OpenSessionResponse>> {
  try {
    // 1. Validate session
    const session = await getSession();
    if (!session?.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          details: "Session required",
        },
        { status: 401 }
      );
    }

    // 2. Get user claims
    const claims = await getUserClaims(session);
    if (!claims) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          details: "Invalid session",
        },
        { status: 401 }
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
    if (!canAccessDomain(claims, domain)) {
      console.warn(
        `[SECURITY] User ${claims.email} attempted to access device in domain ${domain} but belongs to ${claims.domain}`
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
    const meshUser = mapToMeshUser(claims.email, claims.domain);
    
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

    // 7. Return session URL
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
