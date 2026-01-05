/**
 * API Route: GET /api/admin/users/allowed-types
 * 
 * Returns the user types that the current user can assign.
 */

import { NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import type { UserType } from "@/lib/supabase-admin";

// User type hierarchy (lower index = higher privilege)
const USER_TYPE_HIERARCHY: UserType[] = [
  "siteadmin",
  "minisiteadmin",
  "agent",
  "colaborador",
  "inactivo",
  "candidato",
];

const USER_TYPE_LABELS: Record<UserType, string> = {
  siteadmin: "Site Admin",
  minisiteadmin: "Mini Admin",
  agent: "Agente",
  colaborador: "Colaborador",
  inactivo: "Inativo",
  candidato: "Candidato",
};

export async function GET() {
  try {
    const { authorized, claims } = await checkAdminAccess();
    
    if (!authorized || !claims) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const userIndex = USER_TYPE_HIERARCHY.indexOf(claims.userType);
    const allowedTypes = userIndex >= 0 
      ? USER_TYPE_HIERARCHY.slice(userIndex) 
      : [];

    return NextResponse.json({
      currentUserType: claims.userType,
      allowedTypes,
      labels: USER_TYPE_LABELS,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/allowed-types:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
