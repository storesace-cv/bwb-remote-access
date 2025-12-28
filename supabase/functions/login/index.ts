// Make this function public (no platform-level JWT required)
export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOGIN_TIMEOUT_MS = Number(Deno.env.get("LOGIN_TIMEOUT_MS")) || 15000;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const DEFAULT_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,content-type,apikey",
  "Access-Control-Max-Age": "86400",
};

const FORBIDDEN_CORS_HEADERS = {
  ...DEFAULT_CORS_HEADERS,
  "Access-Control-Allow-Origin": "false",
};

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  if (ALLOWED_ORIGINS.length > 0 && (!origin || !ALLOWED_ORIGINS.includes(origin))) {
    return null;
  }

  return { ...DEFAULT_CORS_HEADERS, "Access-Control-Allow-Origin": origin || "*" } as const;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  req?: Request,
  corsHeaders?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders || buildCorsHeaders(req) || {} : {}),
    },
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req: Request) {
  try {
    const corsHeaders = buildCorsHeaders(req);
    if (!corsHeaders) {
      return new Response(null, { status: 403, headers: FORBIDDEN_CORS_HEADERS });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, req, corsHeaders);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch (e) {
      console.error("[login] invalid json body:", String(e));
      return jsonResponse({ error: "invalid_json", message: String(e) }, 400, req, corsHeaders);
    }

    const rawEmail =
      typeof payload === "object" && payload && "email" in payload
        ? (payload as Record<string, unknown>).email
        : undefined;
    const rawPassword =
      typeof payload === "object" && payload && "password" in payload
        ? (payload as Record<string, unknown>).password
        : undefined;

    const email = typeof rawEmail === "string" ? rawEmail : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";
    if (!email || !password) {
      return jsonResponse(
        { error: "missing_fields", message: "Email and password required" },
        400,
        req,
        corsHeaders,
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      const missing = [] as string[];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

      return jsonResponse(
        {
          error: "config_error",
          message: `Missing env: ${missing.join(", ")}`,
        },
        500,
        req,
        corsHeaders,
      );
    }

    const body = new URLSearchParams({
      grant_type: "password",
      username: email,
      password: password,
    }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    let tokenResp: Response;
    try {
      tokenResp = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body,
          signal: controller.signal,
        },
      );
    } catch (err) {
      clearTimeout(timeout);

      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof DOMException && err.name === "AbortError";

      console.error("[login] auth token request failed", message);
      return jsonResponse(
        {
          error: isAbort ? "upstream_timeout" : "token_request_failed",
          message: isAbort
            ? "Login upstream timed out"
            : "Failed to contact auth service",
        },
        isAbort ? 504 : 502,
        req,
        corsHeaders,
      );
    }

    clearTimeout(timeout);

    const text = await tokenResp.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error("[login] failed to parse token response", err);
    }

    if (!tokenResp.ok) {
      const errorDescription =
        json && typeof json.error_description === "string"
          ? json.error_description
          : null;
      const errorMsgField =
        json && typeof json.msg === "string" ? json.msg : null;
      const errorMessage = errorDescription || errorMsgField || text;
      return jsonResponse(
        {
          error:
            json && typeof json.error === "string" ? json.error : "invalid_login",
          message: errorMessage || "Invalid login credentials",
        },
        tokenResp.status,
        req,
        corsHeaders,
      );
    }

    const accessToken =
      json && typeof json.access_token === "string" ? json.access_token : null;
    if (!accessToken) {
      return jsonResponse(
        {
          error: "login_failed",
          message: "Token endpoint did not return access_token",
        },
        502,
        req,
        corsHeaders,
      );
    }

    return jsonResponse({ token: accessToken }, 200, req, corsHeaders);
  } catch (err) {
    console.error("[login] handler error:", err);
    return jsonResponse(
      { error: "internal_error", message: String(err) },
      500,
      req,
      buildCorsHeaders(req) ?? undefined,
    );
  }
}
