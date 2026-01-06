-- ================================================================
-- Script para actualizar password de todos os utilizadores
-- Password fixa: Admin1234!
-- 
-- NOTA: Este script pode não funcionar directamente no SQL Editor
-- devido a restrições do Supabase. Se falhar, use a alternativa abaixo.
-- ================================================================

-- Tentar actualizar via SQL (pode não funcionar)
UPDATE auth.users
SET encrypted_password = crypt('Admin1234!', gen_salt('bf'));

-- Se o acima não funcionar, a alternativa é usar a Edge Function
-- ou a Admin API do Supabase para actualizar cada utilizador.
-- Ver ficheiro: /app/scripts/update-all-passwords.ts
