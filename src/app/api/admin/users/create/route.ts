/**
 * API Route: POST /api/admin/users/create
 * 
 * Creates a user record in mesh_users.
 * With MeshCentral authentication, users authenticate via MeshCentral.
 * This endpoint pre-creates the user record.
 * 
 * Protected by RBAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

type UserType = "siteadmin" | "minisiteadmin" | "agent" | "colaborador" | "inactivo" | "candidato";
const VALID_USER_TYPES: UserType[] = ["agent", "colaborador", "candidato"];

interface CreateUserRequest {
  email: string;
  domain: ValidDomain;
  user_type: UserType;
  display_name?: string;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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

    const { email, domain, user_type, display_name } = body;

    // Validate required fields
    if (!email || !domain || !user_type) {
      return NextResponse.json(
        { error: "Missing required fields: email, domain, user_type" },
        { status: 400 }
      );
    }

    // Normalize email (username = email)
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

    // Validate user_type
    if (!VALID_USER_TYPES.includes(user_type)) {
      return NextResponse.json(
        { error: `Invalid user_type. Must be one of: ${VALID_USER_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // RBAC: Domain Admin can only create in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && claims.domain !== domain) {
      return NextResponse.json(
        { error: `Domain Admin can only create users in their domain (${claims.domain})` },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check if user already exists by mesh_username
    const { data: existingUser } = await supabase
      .from("mesh_users")
      .select("id, user_type")
      .eq("mesh_username", normalizedEmail)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // User exists - update
      userId = existingUser.id;
      
      const { error: updateError } = await supabase
        .from("mesh_users")
        .update({ 
          user_type,
          display_name: display_name || normalizedEmail.split("@")[0],
          email: normalizedEmail,
          deleted_at: null,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Error updating user:", updateError);
        throw new Error("Failed to update user");
      }
    } else {
      // Need to find an agent for this domain to satisfy FK constraint
      const { data: domainAgent } = await supabase
        .from("mesh_users")
        .select("id")
        .eq("domain", domain)
        .eq("user_type", "agent")
        .limit(1)
        .maybeSingle();

      if (!domainAgent) {
        return NextResponse.json(
          { error: `No agent found for domain ${domain}. Cannot create user.` },
          { status: 400 }
        );
      }

      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from("mesh_users")
        .insert({
          mesh_username: normalizedEmail,
          email: normalizedEmail,
          domain,
          user_type,
          display_name: display_name || normalizedEmail.split("@")[0],
          agent_id: domainAgent.id,
          source: "admin_created",
        })
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating user:", createError);
        if (createError.code === "23505") {
          return NextResponse.json(
            { error: "A user with this email already exists" },
            { status: 409 }
          );
        }
        throw new Error("Failed to create user");
      }

      userId = newUser.id;
      isNewUser = true;
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      email: normalizedEmail,
      domain,
      user_type,
      is_new_user: isNewUser,
      message: isNewUser 
        ? "Utilizador criado com sucesso. Pode entrar com credenciais MeshCentral."
        : "Utilizador atualizado com sucesso.",
    }, { status: isNewUser ? 201 : 200 });

  } catch (error) {
    console.error("Error in /api/admin/users/create:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
