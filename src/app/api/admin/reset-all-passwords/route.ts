/**
 * API Route para actualizar password de todos os utilizadores no Supabase Auth
 * 
 * ATENÇÃO: Esta rota deve ser protegida ou removida após uso!
 * 
 * Uso: POST /api/admin/reset-all-passwords
 * Header: x-admin-key: [valor de SUPABASE_SERVICE_ROLE_KEY]
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kqwaibgvmzcqeoctukoy.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FIXED_PASSWORD = "Admin1234!";

export async function POST(req: Request) {
  // Verificar autorização
  const adminKey = req.headers.get("x-admin-key");
  
  if (!adminKey || adminKey !== SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "Service key não configurada" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Listar todos os utilizadores
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const results: { email: string; status: string }[] = [];

    for (const user of users.users) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: FIXED_PASSWORD,
      });

      results.push({
        email: user.email || user.id,
        status: updateError ? `ERRO: ${updateError.message}` : "OK",
      });
    }

    const updated = results.filter((r) => r.status === "OK").length;
    const errors = results.filter((r) => r.status !== "OK").length;

    return NextResponse.json({
      message: `Actualizados: ${updated}, Erros: ${errors}`,
      total: users.users.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
