-- MeshCentral multi-domain aware mesh_users schema extension
-- Alinhado com docs/sot/MeshCentral_Supabase_Synchronisation_Multi-Domain_Aware.md
-- e docs/sot/data-models.md (SoT).

-- 1) Add new columns if they do not exist yet
ALTER TABLE public.mesh_users
  ADD COLUMN IF NOT EXISTS domain_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS domain_dns text NULL,
  ADD COLUMN IF NOT EXISTS external_user_id text NULL,
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS siteadmin bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS domainadmin bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'meshcentral',
  ADD COLUMN IF NOT EXISTS email text NULL,
  ADD COLUMN IF NOT EXISTS name text NULL,
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- 2) Backfill domain_key e domain para linhas existentes
UPDATE public.mesh_users
SET domain_key = ''
WHERE domain_key IS NULL OR domain_key = '';

UPDATE public.mesh_users
SET domain = ''
WHERE domain IS NULL;

-- 3) Backfill external_user_id para linhas existentes
-- Para o domínio por omissão, seguimos o formato observado em MeshCentral: user//<username>
UPDATE public.mesh_users
SET external_user_id = CONCAT('user//', mesh_username)
WHERE (external_user_id IS NULL OR external_user_id = '')
  AND mesh_username IS NOT NULL;

-- 4) Backfill role a partir de siteadmin (SoT actual):
-- if siteadmin == 4294967295 or -1 → SUPERADMIN
-- else if siteadmin > 0 → LIMITED_ADMIN
-- else → USER
UPDATE public.mesh_users
SET role = CASE
  WHEN siteadmin = 4294967295 OR siteadmin = -1 THEN 'SUPERADMIN'
  WHEN siteadmin > 0 THEN 'LIMITED_ADMIN'
  ELSE 'USER'
END;

-- 5) Ensure unique external_user_id (chave canónica MeshCentral)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mesh_users_external_user_id_key'
      AND conrelid = 'public.mesh_users'::regclass
  ) THEN
    ALTER TABLE public.mesh_users
      ADD CONSTRAINT mesh_users_external_user_id_key
      UNIQUE (external_user_id);
  END IF;
END$$;

-- 6) Ensure (domain_key, mesh_username) is unique (mesmo username em vários domínios, mas não duplicado no mesmo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mesh_users_domain_key_mesh_username_key'
      AND conrelid = 'public.mesh_users'::regclass
  ) THEN
    ALTER TABLE public.mesh_users
      ADD CONSTRAINT mesh_users_domain_key_mesh_username_key
      UNIQUE (domain_key, mesh_username);
  END IF;
END$$;

-- 7) Optional index on domain_key to speed up domain-based queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_mesh_users_domain_key'
      AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_mesh_users_domain_key
      ON public.mesh_users (domain_key);
  END IF;
END$$;

-- NOTA IMPORTANTE:
-- Não removemos aqui o constraint legacy em mesh_username (mesh_users_mesh_username_key).
-- Quando o sync multi-domínio estiver estável e os dados validados, pode ser feito
-- um migration separado e explicitamente aprovado para:
--
--   ALTER TABLE public.mesh_users
--     DROP CONSTRAINT IF EXISTS mesh_users_mesh_username_key;
--
-- Esta alteração é comportamental/destrutiva e deve ser feita só com confirmação explícita.