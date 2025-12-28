import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_AUTH_USER_ID =
  Deno.env.get("ADMIN_AUTH_USER_ID") ??
  "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handler(req: Request): Promise<Response> {
  console.log("[admin-list-auth-users] Request received:", req.method);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[admin-list-auth-users] Missing Supabase env vars");
    const missing: string[] = [];
    if (!SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    return jsonResponse(
      {
        error: "config_error",
        message: `Missing Supabase configuration: ${missing.join(", ")}`,
      },
      500,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[admin-list-auth-users] Missing Authorization header");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        },
        401,
      );
    }

    const jwt = authHeader.substring(7);

    console.log("[admin-list-auth-users] Validating JWT via /auth/v1/user...");
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authResponse.ok) {
      const text = await authResponse.text();
      console.error(
        "[admin-list-auth-users] JWT validation failed:",
        authResponse.status,
        text,
      );
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid or expired token",
        },
        401,
      );
    }

    const user = (await authResponse.json()) as { id?: string } | null;
    const userId = user?.id;
    if (!userId) {
      console.error(
        "[admin-list-auth-users] Auth payload missing id:",
        user,
      );
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid auth payload",
        },
        401,
      );
    }

    if (userId !== ADMIN_AUTH_USER_ID) {
      console.error(
        "[admin-list-auth-users] Forbidden: user is not canonical admin:",
        userId,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only canonical admin can perform this action",
        },
        403,
      );
    }

    console.log("[admin-list-auth-users] Admin verified:", userId);

    const url = new URL(req.url);
    const pageParam = url.searchParams.get("page");
    const perPageParam = url.searchParams.get("per_page");

    let page = Number.isFinite(Number(pageParam)) ? Number(pageParam) : 1;
    let perPage = Number.isFinite(Number(perPageParam))
      ? Number(perPageParam)
      : 50;

    if (page < 1) page = 1;
    if (perPage < 1) perPage = 1;
    if (perPage > 200) perPage = 200;

    console.log(
      "[admin-list-auth-users] Fetching users: page",
      page,
      "perPage",
      perPage,
    );

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      },
    );

    const { data: authData, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (listError) {
      console.error(
        "[admin-list-auth-users] Error listing auth users:",
        listError,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to list auth users",
          details: listError.message,
        },
        500,
      );
    }

    const usersRaw = Array.isArray(authData?.users) ? authData.users : [];
    console.log(
      "[admin-list-auth-users] Found auth users:",
      usersRaw.length,
    );

    const authIds = usersRaw
      .map((u: unknown) => (u as { id?: unknown })?.id ?? null)
      .filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );

    let meshRows: Array<{
      id: string;
      auth_user_id: string;
      mesh_username: string | null;
      display_name: string | null;
      domain_key: string | null;
      domain: string | null;
      user_type: string | null;
    }> = [];

    if (authIds.length > 0) {
      console.log(
        "[admin-list-auth-users] Fetching mesh_users for auth_ids:",
        authIds,
      );

      const { data: meshData, error: meshError } = await supabaseAdmin
        .from("mesh_users")
        .select(
          "id, auth_user_id, mesh_username, display_name, domain_key, domain, user_type",
        )
        .in("auth_user_id", authIds)
        .is("deleted_at", null);

      console.log(
        "[admin-list-auth-users] mesh_users query result:",
        "error=",
        meshError,
        "data=",
        JSON.stringify(meshData),
      );

      if (meshError) {
        console.error(
          "[admin-list-auth-users] Error fetching mesh_users:",
          meshError,
        );
      } else if (Array.isArray(meshData)) {
        meshRows = meshData as Array<{
          id: string;
          auth_user_id: string;
          mesh_username: string | null;
          display_name: string | null;
          domain_key: string | null;
          domain: string | null;
          user_type: string | null;
        }>;
        console.log(
          "[admin-list-auth-users] Found mesh_users rows:",
          meshRows.length,
        );
        console.log(
          "[admin-list-auth-users] First mesh_user sample:",
          meshRows[0],
        );
      }
    }

    const meshMap = new Map<
      string,
      {
        id: string | null;
        mesh_username: string | null;
        display_name: string | null;
        domain_key: string | null;
        domain: string | null;
        user_type: string | null;
      }
    >();

    for (const row of meshRows) {
      console.log(
        "[admin-list-auth-users] Adding to meshMap:",
        "auth_user_id=",
        row.auth_user_id,
        "domain_key=",
        row.domain_key,
        "domain=",
        row.domain,
        "user_type=",
        row.user_type,
      );
      meshMap.set(row.auth_user_id, {
        id: row.id ?? null,
        mesh_username: row.mesh_username ?? null,
        display_name: row.display_name ?? null,
        domain_key: row.domain_key ?? null,
        domain: row.domain ?? null,
        user_type: row.user_type ?? null,
      });
    }

    console.log(
      "[admin-list-auth-users] meshMap size:",
      meshMap.size,
      "entries:",
      Array.from(meshMap.entries()).map(([k, v]) => ({
        auth_user_id: k,
        domain_key: v.domain_key,
        domain: v.domain,
        user_type: v.user_type,
      })),
    );

    const enriched = usersRaw.map((u) => {
      const userObj = u as Record<string, unknown>;
      const id = typeof userObj.id === "string" ? userObj.id : "";
      const mesh = id ? meshMap.get(id) : undefined;

      console.log(
        "[admin-list-auth-users] Enriching user:",
        "id=",
        id,
        "mesh found=",
        !!mesh,
        "mesh_domain_key=",
        mesh?.domain_key,
        "mesh_domain=",
        mesh?.domain,
        "mesh_user_type=",
        mesh?.user_type,
      );

      return {
        ...userObj,
        mesh_username: mesh?.mesh_username ?? null,
        mesh_display_name: mesh?.display_name ?? null,
        mesh_domain_key: mesh?.domain_key ?? null,
        mesh_domain: mesh?.domain ?? null,
        mesh_user_id: mesh?.id ?? null,
        mesh_user_type: mesh?.user_type ?? null,
      };
    });

    console.log(
      "[admin-list-auth-users] Sample enriched user:",
      JSON.stringify(enriched[0]),
    );

    console.log(
      "[admin-list-auth-users] Returning enriched users:",
      enriched.length,
    );

    return jsonResponse(
      {
        users: enriched,
        page,
        per_page: perPage,
        total: enriched.length,
      },
      200,
    );
  } catch (err) {
    console.error("[admin-list-auth-users] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: "internal_error", message }, 500);
  }
}

serve(handler);