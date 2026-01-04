/**
 * Login API Route
 * 
 * Authenticates user via MeshCentral and creates session.
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import { login, getDomainFromHost } from "@/lib/mesh-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }
    
    // Get domain from host header
    const host = request.headers.get("host") || "localhost";
    const domain = getDomainFromHost(host);
    
    // Authenticate
    const result = await login(email, password, domain);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      success: true,
      email,
      domain,
    });
  } catch (error) {
    console.error("[API] Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
