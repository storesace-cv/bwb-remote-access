/**
 * Login API Route
 * 
 * Authenticates user via MeshCentral and creates session.
 * Also mirrors user to Supabase Auth and returns JWT for edge functions.
 * 
 * POST /api/auth/login
 * 
 * Body: { email, password, domain }
 * domain MUST be one of: mesh | zonetech | zsangola
 * 
 * Returns: { success, token, email, domain, fullDomain }
 */

import { NextRequest, NextResponse } from "next/server";
import { login, getDomainFromHost, ensureSupabaseUser, ensureProfileExists, getSupabaseJWT } from "@/lib/mesh-auth";
import { isValidDomain, type ValidDomain, VALID_DOMAINS } from "@/lib/domain";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, domain: requestedDomain } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Determine domain: use explicit domain from request, fallback to host header
    let domain: ValidDomain;

    if (requestedDomain) {
      // STRICT VALIDATION: domain must be in allowlist
      if (!isValidDomain(requestedDomain)) {
        return NextResponse.json(
          { 
            error: `Invalid domain: ${requestedDomain}. Must be one of: ${VALID_DOMAINS.join(", ")}` 
          },
          { status: 400 }
        );
      }
      domain = requestedDomain;
    } else {
      // Fallback: derive from host header (for backward compatibility)
      const host = request.headers.get("host") || "localhost";
      const hostDomain = getDomainFromHost(host);
      
      // Map full domain to short domain
      const domainMap: Record<string, ValidDomain> = {
        "mesh.bwb.pt": "mesh",
        "zonetech.bwb.pt": "zonetech", 
        "zsangola.bwb.pt": "zsangola",
      };
      
      domain = domainMap[hostDomain] || "mesh";
    }

    // Map short domain to full domain for MeshCentral auth
    const fullDomainMap: Record<ValidDomain, string> = {
      mesh: "mesh.bwb.pt",
      zonetech: "zonetech.bwb.pt",
      zsangola: "zsangola.bwb.pt",
    };
    
    const fullDomain = fullDomainMap[domain];

    // Authenticate against MeshCentral
    const result = await login(email, password, fullDomain);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }

    // Mirror user to Supabase tables
    console.log(`[API] Mirroring user to Supabase: ${email} @ ${fullDomain}`);
    const meshUser = await ensureSupabaseUser(email, fullDomain);
    console.log(`[API] meshUser result:`, meshUser);
    
    let token = "";
    
    if (meshUser?.auth_user_id) {
      // Ensure profile exists
      await ensureProfileExists(meshUser.auth_user_id, email);
      
      // Get JWT from Supabase Auth
      console.log(`[API] Getting JWT for auth_user_id: ${meshUser.auth_user_id}`);
      const jwtResult = await getSupabaseJWT(email, meshUser.auth_user_id);
      if (jwtResult?.token) {
        token = jwtResult.token;
        console.log(`[API] JWT obtained for user: ${email}, token length: ${token.length}`);
      } else {
        console.warn(`[API] Could not get JWT for user: ${email}`, jwtResult?.error);
      }
    } else {
      console.warn(`[API] No auth_user_id for user: ${email}, meshUser:`, meshUser);
    }

    // Return success with token
    console.log(`[API] Returning response, token length: ${token.length}`);
    return NextResponse.json({
      success: true,
      token,
      email,
      domain,
      fullDomain,
    });
  } catch (error) {
    console.error("[API] Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
