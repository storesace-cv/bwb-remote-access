/**
 * POST /api/admin/devices/[deviceId]/reassign
 * 
 * Allows siteadmin to reassign a device to a different user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getMeshUserByEmail } from "@/lib/mesh-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const session = await getSession();
    
    if (!session?.authenticated) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Check if user is siteadmin
    const meshUser = await getMeshUserByEmail(session.email);
    if (!meshUser || meshUser.user_type !== "siteadmin") {
      return NextResponse.json(
        { error: "Apenas siteadmin pode reatribuir dispositivos" },
        { status: 403 }
      );
    }

    const { deviceId } = await params;
    const body = await request.json();
    const { new_owner_username } = body;

    if (!new_owner_username) {
      return NextResponse.json(
        { error: "new_owner_username é obrigatório" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the new owner
    const { data: newOwner, error: ownerError } = await supabase
      .from("mesh_users")
      .select("id, mesh_username")
      .eq("mesh_username", new_owner_username)
      .single();

    if (ownerError || !newOwner) {
      return NextResponse.json(
        { error: "Utilizador não encontrado" },
        { status: 404 }
      );
    }

    // Update the device
    const { error: updateError } = await supabase
      .from("devices")
      .update({
        owner: newOwner.id,
        mesh_username: newOwner.mesh_username,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);

    if (updateError) {
      console.error("Error reassigning device:", updateError);
      return NextResponse.json(
        { error: "Erro ao reatribuir dispositivo" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Dispositivo ${deviceId} reatribuído para ${new_owner_username}`,
    });
  } catch (error) {
    console.error("Error in /api/admin/devices/reassign:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
