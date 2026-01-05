/**
 * GET /api/provision/status
 * 
 * Checks the status of a registration session.
 * Returns whether a device has been registered with this session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/mesh-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session?.authenticated) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const sessionId = request.nextUrl.searchParams.get("session_id");
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id é obrigatório" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if there's a device registered with this session
    const { data: registrationSession, error: sessionError } = await supabase
      .from("registration_sessions")
      .select("id, status, matched_device_id, expires_at")
      .eq("session_id", sessionId)
      .single();

    if (sessionError || !registrationSession) {
      return NextResponse.json({
        status: "not_found",
        message: "Sessão não encontrada",
      });
    }

    // Check if session expired
    const expiresAt = new Date(registrationSession.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({
        status: "expired",
        message: "Sessão expirada",
      });
    }

    // If device was matched
    if (registrationSession.matched_device_id) {
      // Get device info
      const { data: device } = await supabase
        .from("devices")
        .select("device_id, friendly_name")
        .eq("id", registrationSession.matched_device_id)
        .single();

      return NextResponse.json({
        status: "completed",
        device_id: device?.device_id,
        friendly_name: device?.friendly_name,
      });
    }

    return NextResponse.json({
      status: "awaiting",
      message: "A aguardar registo de dispositivo",
    });
  } catch (error) {
    console.error("Error in /api/provision/status:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
