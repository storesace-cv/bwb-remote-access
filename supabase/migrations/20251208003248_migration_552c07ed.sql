-- FIX 3: Fix update_updated_at_column function with immutable search_path
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- Set search_path to prevent search_path injection attacks
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS 
'Trigger function to automatically update updated_at timestamp. Fixed search_path for security.';

-- Recreate any triggers that were using this function
-- (They should already exist, but just in case they were dropped with CASCADE)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      schemaname,
      tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = schemaname
          AND table_name = tablename
          AND column_name = 'updated_at'
      )
  LOOP
    -- Drop existing trigger if present
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I.%I',
      r.tablename, r.schemaname, r.tablename);
    
    -- Create trigger
    EXECUTE format('CREATE TRIGGER update_%I_updated_at
      BEFORE UPDATE ON %I.%I
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column()',
      r.tablename, r.schemaname, r.tablename);
  END LOOP;
END;
$$;