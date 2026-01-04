/**
 * Logout API Route
 * 
 * Clears session cookie.
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";
import { logout } from "@/lib/mesh-auth";

export async function POST() {
  await logout();
  
  return NextResponse.json({ success: true });
}

export async function GET() {
  await logout();
  
  // Redirect to home after logout
  return NextResponse.redirect(new URL("/", process.env.APP_BASE_URL || "https://rustdesk.bwb.pt"));
}
