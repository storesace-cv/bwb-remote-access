/**
 * GET /api/groups
 * 
 * Returns canonical groups for the current user's domain.
 * Used in the adopt device modal to select group/subgroup.
 */

import { NextResponse } from "next/server";
import { getSession, getMeshUserByEmail } from "@/lib/mesh-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session?.authenticated) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Get user's domain
    const meshUser = await getMeshUserByEmail(session.email);
    const userDomain = meshUser?.domain || session.domain;

    if (!userDomain) {
      return NextResponse.json(
        { error: "Domínio não configurado" },
        { status: 400 }
      );
    }

    // Fetch groups from Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: groups, error } = await supabase
      .from("canonical_groups")
      .select("id, name, description, parent_group_id, path, level, device_count")
      .eq("domain", userDomain)
      .order("path");

    if (error) {
      console.error("Error fetching groups:", error);
      return NextResponse.json(
        { error: "Erro ao carregar grupos" },
        { status: 500 }
      );
    }

    return NextResponse.json({ groups: groups || [] });
  } catch (error) {
    console.error("Error in /api/groups:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
