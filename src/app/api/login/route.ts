/**
 * Legacy Login Route - DEPRECATED
 * 
 * This endpoint has been deprecated in favor of Auth0 authentication.
 * All authentication must now go through /api/auth/login (Auth0).
 * 
 * Returns 410 Gone to indicate the endpoint is no longer available.
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
      error: "Gone",
      message: "Local email/password authentication has been deprecated. Please use Auth0 authentication.",
      redirect: "/api/auth/login",
      documentation: "All users must now authenticate via Auth0 Single Sign-On.",
    },
    { status: 410, headers: CORS_HEADERS }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Gone",
      message: "Local email/password authentication has been deprecated. Please use Auth0 authentication.",
      redirect: "/api/auth/login",
    },
    { status: 410, headers: CORS_HEADERS }
  );
}
