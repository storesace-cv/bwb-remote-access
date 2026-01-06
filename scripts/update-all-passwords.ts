/**
 * Script para actualizar password de todos os utilizadores no Supabase Auth
 * 
 * Execução: npx ts-node scripts/update-all-passwords.ts
 * 
 * Requer: SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kqwaibgvmzcqeoctukoy.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FIXED_PASSWORD = "Admin1234!";

async function updateAllPasswords() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY não definida!");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("A obter lista de utilizadores...");

  // Listar todos os utilizadores
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error("Erro ao listar utilizadores:", listError.message);
    process.exit(1);
  }

  console.log(`Encontrados ${users.users.length} utilizadores`);

  let updated = 0;
  let errors = 0;

  for (const user of users.users) {
    console.log(`A actualizar: ${user.email}...`);

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: FIXED_PASSWORD,
    });

    if (updateError) {
      console.error(`  ERRO: ${updateError.message}`);
      errors++;
    } else {
      console.log(`  OK`);
      updated++;
    }
  }

  console.log(`\nConcluído: ${updated} actualizados, ${errors} erros`);
}

updateAllPasswords().catch(console.error);
