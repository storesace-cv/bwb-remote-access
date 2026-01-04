/**
 * Legacy Login Route - Redirects to /api/auth/login
 * 
 * This endpoint now redirects to the MeshCentral auth endpoint.
 */

import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Moved",
      message: "Please use /api/auth/login for authentication.",
      redirect: "/api/auth/login",
    },
    { status: 308, headers: CORS_HEADERS }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Moved",
      message: "Please use /api/auth/login for authentication.",
      redirect: "/api/auth/login",
    },
    { status: 308, headers: CORS_HEADERS }
  );
}
