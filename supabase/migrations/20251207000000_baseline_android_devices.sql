-- ============================================================
-- BASELINE MIGRATION: android_devices table
-- ============================================================
-- This migration creates the android_devices table that is required
-- by subsequent migrations (especially 20251208003233 which creates
-- the android_devices_expanded view).
--
-- Based on remote_schema.sql (authoritative).
-- Uses IF NOT EXISTS for idempotency.
-- ============================================================

-- Create the sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS "public"."android_devices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."android_devices" (
    "id" bigint NOT NULL,
    "device_id" "text" NOT NULL,
    "owner" "uuid",
    "notes" "text",
    "group_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mesh_username" "text",
    "friendly_name" "text",
    "last_seen_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rustdesk_password" "text",
    "rustdesk_ip" "text",
    "agent_id" "uuid",
    "group_id" "uuid",
    "provisioning_status" "text" DEFAULT 'ready'::"text" NOT NULL
);

-- Set sequence ownership (idempotent via DO block)
DO $$
BEGIN
    -- Only alter if the default isn't already set
    IF NOT EXISTS (
        SELECT 1 FROM pg_attrdef ad
        JOIN pg_class c ON c.oid = ad.adrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ad.adnum
        WHERE c.relname = 'android_devices'
          AND a.attname = 'id'
          AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%android_devices_id_seq%'
    ) THEN
        ALTER TABLE "public"."android_devices" ALTER COLUMN "id" SET DEFAULT nextval('public.android_devices_id_seq'::regclass);
    END IF;
END $$;

-- Set sequence owned by column
ALTER SEQUENCE "public"."android_devices_id_seq" OWNED BY "public"."android_devices"."id";

-- Add primary key constraint (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'android_devices_pkey' 
          AND conrelid = 'public.android_devices'::regclass
    ) THEN
        ALTER TABLE "public"."android_devices" ADD CONSTRAINT "android_devices_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

-- Add unique constraint on device_id (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'android_devices_device_id_key' 
          AND conrelid = 'public.android_devices'::regclass
    ) THEN
        ALTER TABLE "public"."android_devices" ADD CONSTRAINT "android_devices_device_id_key" UNIQUE ("device_id");
    END IF;
END $$;

-- Add provisioning_status check constraint (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'android_devices_provisioning_status_check' 
          AND conrelid = 'public.android_devices'::regclass
    ) THEN
        ALTER TABLE "public"."android_devices" ADD CONSTRAINT "android_devices_provisioning_status_check" 
        CHECK (("provisioning_status" = ANY (ARRAY['provisioning'::"text", 'ready'::"text"])));
    END IF;
END $$;

-- Add comment on owner column
COMMENT ON COLUMN "public"."android_devices"."owner" IS 'Mesh user ID (FK to mesh_users.id). NULL = orphan device awaiting temporal matching';

-- Grant permissions (safe to re-run)
GRANT ALL ON TABLE "public"."android_devices" TO "anon";
GRANT ALL ON TABLE "public"."android_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."android_devices" TO "service_role";

GRANT ALL ON SEQUENCE "public"."android_devices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."android_devices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."android_devices_id_seq" TO "service_role";
