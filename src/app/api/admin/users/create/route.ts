/**
 * API Route: POST /api/admin/users/create
 * 
 * Creates a user record in Supabase.
 * With MeshCentral authentication, users authenticate via MeshCentral.
 * This endpoint pre-creates the user record with a role assignment.
 * 
 * Protected by RBAC:
 *   - SuperAdmin can create users in any domain
 *   - Domain Admin can only create users in their current domain
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { createClient } from "@supabase/supabase-js";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

type ValidRole = "DOMAIN_ADMIN" | "AGENT" | "USER";
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT", "USER"];

interface CreateUserRequest {
  email: string;
  domain: ValidDomain;
  role: ValidRole;
  display_name?: string;
}

interface CreateUserResponse {
  success: boolean;
  user_id: string;
  email: string;
  domain: ValidDomain;
  role: string;
  is_new_user: boolean;
  message: string;
}

/**
 * Validates email format.
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get Supabase admin client
 */
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  
  if (!url || !key) {
    throw new Error("Supabase not configured");
  }
  
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    // Check admin access
    const { authorized, claims } = await checkAdminAccess();

    if (!authorized || !claims) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Parse request body
    let body: CreateUserRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { email, domain, role, display_name } = body;

    // Validate required fields
    if (!email || !domain || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, domain, role" },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate domain
    if (!VALID_DOMAINS.includes(domain)) {
      return NextResponse.json(
        { error: `Invalid domain. Must be one of: ${VALID_DOMAINS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // RBAC: Domain Admin can only create in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin) {
      if (claims.domain !== domain) {
        return NextResponse.json(
          { error: `Domain Admin can only create users in their domain (${claims.domain})` },
          { status: 403 }
        );
      }
    }

    const supabase = getSupabase();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", normalizedEmail)
      .eq("domain", domain)
      .single();

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // User exists - update role
      userId = existingUser.id;
      
      const { error: updateError } = await supabase
        .from("users")
        .update({ 
          role,
          display_name: display_name || normalizedEmail.split("@")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Error updating user:", updateError);
        throw new Error("Failed to update user");
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          email: normalizedEmail,
          username: normalizedEmail,
          domain,
          role,
          user_type: "user",
          profile_code: role === "DOMAIN_ADMIN" ? "DOMAIN_ADMIN" : "USER",
          display_name: display_name || normalizedEmail.split("@")[0],
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating user:", createError);
        if (createError.code === "23505") {
          return NextResponse.json(
            { error: "A user with this email already exists in this domain" },
            { status: 409 }
          );
        }
        throw new Error("Failed to create user");
      }

      userId = newUser.id;
      isNewUser = true;
    }

    const response: CreateUserResponse = {
      success: true,
      user_id: userId,
      email: normalizedEmail,
      domain,
      role,
      is_new_user: isNewUser,
      message: isNewUser 
        ? "Utilizador criado com sucesso. Pode entrar com credenciais MeshCentral."
        : "Utilizador atualizado com sucesso.",
    };

    return NextResponse.json(response, { status: isNewUser ? 201 : 200 });

  } catch (error) {
    console.error("Error in /api/admin/users/create:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
