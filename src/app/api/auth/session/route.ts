/**
 * Session API Route
 * 
 * Returns current session info.
 * GET /api/auth/session
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/mesh-auth";

export async function GET() {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  
  return NextResponse.json({
    authenticated: true,
    email: session.email,
    domain: session.domain,
  });
}
