/**
 * API Route: POST /api/admin/users/create
 * 
 * Creates or invites a user via Auth0 Management API.
 * Also upserts the user to the Supabase mirror.
 * 
 * Protected by RBAC:
 *   - SuperAdmin can create users in any domain
 *   - Domain Admin can only create users in their current org
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdminAny } from "@/lib/rbac";
import { 
  createAuth0User, 
  getAuth0UserByEmail, 
  updateAuth0UserMetadata,
  createPasswordChangeTicket,
  addUserToOrganization,
} from "@/lib/auth0-management";
import { getOrgIdForDomain, getAuth0Connection, type ValidDomain, VALID_DOMAINS } from "@/lib/org-map";
import { upsertMirrorUser } from "@/lib/user-mirror";

type ValidRole = "DOMAIN_ADMIN" | "AGENT";
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT"];

interface CreateUserRequest {
  email: string;
  domain: ValidDomain;
  role: ValidRole;
  display_name?: string;
}

interface CreateUserResponse {
  success: boolean;
  auth0_user_id: string;
  email: string;
  domain: ValidDomain;
  roles: string[];
  password_setup_url?: string;
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
 * Generates a random temporary password.
 */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function POST(req: NextRequest) {
  try {
    // Check admin access
    const { authorized, claims } = await checkAdminAccess();

    if (!authorized) {
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

    // Validate email format
    if (!isValidEmail(email)) {
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

    // RBAC: Domain Admin can only create in their org
    const isSuperAdmin = isSuperAdminAny(claims);
    if (!isSuperAdmin) {
      if (claims.org !== domain) {
        return NextResponse.json(
          { error: `Domain Admin can only create users in their org (${claims.org})` },
          { status: 403 }
        );
      }
    }

    // Get Auth0 Organization ID for domain
    const orgId = getOrgIdForDomain(domain);
    // Note: orgId may be null if not configured - we'll skip org assignment

    // Prepare app_metadata for Auth0
    // Structure: { bwb: { org_roles: { "domain": ["ROLE1", "ROLE2"] } } }
    const orgRoles = role === "DOMAIN_ADMIN" 
      ? ["DOMAIN_ADMIN", "AGENT"] 
      : ["AGENT"];

    const appMetadata = {
      bwb: {
        org_roles: {
          [domain]: orgRoles,
        },
        // Default: not a superadmin
        superadmin_meshcentral: false,
        superadmin_rustdesk: false,
      },
    };

    let auth0User;
    let isNewUser = false;
    let passwordSetupUrl: string | undefined;

    // Check if user already exists in Auth0
    const existingUser = await getAuth0UserByEmail(email);

    if (existingUser) {
      // User exists - update metadata and org membership
      auth0User = existingUser;

      // Merge org_roles with existing metadata
      const existingBwb = (existingUser.app_metadata?.bwb as Record<string, unknown>) || {};
      const existingOrgRoles = (existingBwb.org_roles as Record<string, string[]>) || {};
      
      // Merge roles for the domain
      const mergedOrgRoles = {
        ...existingOrgRoles,
        [domain]: [...new Set([...(existingOrgRoles[domain] || []), ...orgRoles])],
      };

      const updatedAppMetadata = {
        bwb: {
          ...existingBwb,
          org_roles: mergedOrgRoles,
        },
      };

      auth0User = await updateAuth0UserMetadata(existingUser.user_id, updatedAppMetadata);
    } else {
      // Create new user in Auth0
      const connection = getAuth0Connection();
      const tempPassword = generateTempPassword();

      auth0User = await createAuth0User({
        email,
        connection,
        password: tempPassword,
        name: display_name || email.split("@")[0],
        app_metadata: appMetadata,
        email_verified: false,
      });

      isNewUser = true;

      // Create password change ticket so user can set their own password
      try {
        const ticket = await createPasswordChangeTicket(auth0User.user_id);
        passwordSetupUrl = ticket.ticket;
      } catch (ticketError) {
        console.error("Failed to create password change ticket:", ticketError);
        // Non-fatal - user can use "forgot password" flow
      }
    }

    // Add user to Auth0 Organization (if configured)
    if (orgId) {
      try {
        await addUserToOrganization(orgId, auth0User.user_id);
      } catch (orgError) {
        console.error("Failed to add user to organization:", orgError);
        // Non-fatal - org membership is optional
      }
    }

    // Upsert to Supabase mirror
    try {
      await upsertMirrorUser({
        auth0UserId: auth0User.user_id,
        email: auth0User.email,
        displayName: auth0User.name || display_name,
        isSuperAdminMeshCentral: false,
        isSuperAdminRustDesk: false,
        domain,
        role,
      });
    } catch (mirrorError) {
      console.error("Failed to upsert mirror (non-fatal):", mirrorError);
      // Non-fatal - user was created in Auth0
    }

    const response: CreateUserResponse = {
      success: true,
      auth0_user_id: auth0User.user_id,
      email: auth0User.email,
      domain,
      roles: orgRoles,
      is_new_user: isNewUser,
      message: isNewUser 
        ? "User created successfully. Password setup link generated."
        : "User already exists. Roles updated.",
    };

    if (passwordSetupUrl) {
      response.password_setup_url = passwordSetupUrl;
    }

    return NextResponse.json(response, { status: isNewUser ? 201 : 200 });

  } catch (error) {
    console.error("Error in /api/admin/users/create:", error);
    
    const message = error instanceof Error ? error.message : "Internal server error";
    
    // Check for specific Auth0 errors
    if (message.includes("already exists")) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
