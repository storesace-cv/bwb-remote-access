#!/usr/bin/env bash
set -euo pipefail

# MeshCentral → Supabase Sync (DB-native, multi-domain aware)
# Source of truth: /opt/meshcentral/meshcentral-data/meshcentral.db
#
# This script is intended to run on the droplet as:
#   /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh
#
# Requirements on the droplet:
#   - bash
#   - node (LTS, e.g. 18+)
#   - curl
#   - jq (for manual diagnostics)
#   - flock (util-linux) for overlap protection
#
# Environment variables are auto-loaded from:
#   /opt/rustdesk-frontend/.env.local
#
# If running manually, you can override paths:
#   ENV_FILE=/path/to/.env.local ./sync-meshcentral-to-supabase.sh

MESH_DB="${MESH_DB:-/opt/meshcentral/meshcentral-data/meshcentral.db}"
TMP_DB="${TMP_DB:-/tmp/meshcentral.db.snapshot}"

# CRÍTICO: .env.local está SEMPRE em /opt/rustdesk-frontend/.env.local
# (independentemente de onde este script está a ser executado)
ENV_FILE="${ENV_FILE:-/opt/rustdesk-frontend/.env.local}"

# DEBUG mode (set DEBUG=1 to enable verbose output)
DEBUG="${DEBUG:-0}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&1
}

err() {
  printf '[%s] [ERROR] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2
}

debug() {
  if [ "$DEBUG" = "1" ]; then
    printf '[%s] [DEBUG] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2
  fi
}

# -------------------------------------------------------------------
# Overlap protection: ensure only ONE sync runs at a time
# -------------------------------------------------------------------
LOCK_FILE="/run/meshcentral-supabase-sync.lock"

if ! command -v flock >/dev/null 2>&1; then
  err "flock is required but not installed (util-linux). Install it to enable overlap protection."
  exit 1
fi

# FD 9 used for flock
exec 9>"$LOCK_FILE" || {
  err "Failed to open lock file: $LOCK_FILE"
  exit 1
}

if ! flock -n 9; then
  log "Another meshcentral-supabase-sync instance is already running; exiting without doing work."
  exit 0
fi

# Load environment variables
if [ -f "$ENV_FILE" ]; then
  log "Loading environment from: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  err "Environment file not found: $ENV_FILE"
  err "Create $ENV_FILE with SUPABASE_URL and keys"
  exit 1
fi

# Variables - USAR O MESMO PADRÃO QUE sync-devices.sh e sync-mesh-users.sh
SUPABASE_URL="${SUPABASE_URL:-}"
REST_URL="${SUPABASE_URL}/rest/v1"

# Authentication - PROCURAR JWT EM MÚLTIPLAS VARIÁVEIS
# Priority order:
# 1. SUPABASE_SERVICE_ROLE_JWT (dedicated JWT variable)
# 2. SYNC_JWT (alternative name)
# 3. SUPABASE_SERVICE_ROLE_KEY (only if it's a JWT, not sb_secret_)
# 4. NEXT_PUBLIC_SUPABASE_ANON_KEY (fallback, but won't bypass RLS)

AUTH_BEARER=""

# Try SUPABASE_SERVICE_ROLE_JWT first
if [ -n "${SUPABASE_SERVICE_ROLE_JWT:-}" ] && [[ "${SUPABASE_SERVICE_ROLE_JWT}" =~ ^eyJ ]]; then
  AUTH_BEARER="$SUPABASE_SERVICE_ROLE_JWT"
  log "Using SUPABASE_SERVICE_ROLE_JWT for authentication"
# Try SYNC_JWT second
elif [ -n "${SYNC_JWT:-}" ] && [[ "${SYNC_JWT}" =~ ^eyJ ]]; then
  AUTH_BEARER="$SYNC_JWT"
  log "Using SYNC_JWT for authentication"
# Try SUPABASE_SERVICE_ROLE_KEY third (only if JWT format)
elif [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [[ "${SUPABASE_SERVICE_ROLE_KEY}" =~ ^eyJ ]]; then
  AUTH_BEARER="$SUPABASE_SERVICE_ROLE_KEY"
  log "Using SUPABASE_SERVICE_ROLE_KEY (JWT format) for authentication"
# Fallback to ANON_KEY (won't bypass RLS, but better than nothing)
elif [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ] && [[ "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" =~ ^eyJ ]]; then
  AUTH_BEARER="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
  log "⚠️  Using NEXT_PUBLIC_SUPABASE_ANON_KEY (will be subject to RLS policies)"
fi

# API_KEY for apikey header (always use ANON_KEY)
API_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"

# Fallback: if API_KEY empty, use AUTH_BEARER
if [ -z "$API_KEY" ]; then
  API_KEY="$AUTH_BEARER"
fi

# Validate we have required variables
if [ -z "$SUPABASE_URL" ]; then
  err "SUPABASE_URL not defined in $ENV_FILE"
  exit 1
fi

if [ -z "$AUTH_BEARER" ]; then
  err "No valid JWT token found!"
  err ""
  err "Checked variables (in priority order):"
  err "  1. SUPABASE_SERVICE_ROLE_JWT"
  err "  2. SYNC_JWT"
  err "  3. SUPABASE_SERVICE_ROLE_KEY (if JWT format)"
  err "  4. NEXT_PUBLIC_SUPABASE_ANON_KEY"
  err ""
  err "Current state:"
  if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    if [[ "${SUPABASE_SERVICE_ROLE_KEY}" =~ ^sb_secret_ ]]; then
      err "  SUPABASE_SERVICE_ROLE_KEY: Found but is 'sb_secret_' format (not JWT)"
      err "  → This is for Management API, not REST API"
    else
      err "  SUPABASE_SERVICE_ROLE_KEY: Found but invalid format"
    fi
  else
    err "  SUPABASE_SERVICE_ROLE_KEY: Not set"
  fi
  err ""
  err "Solution:"
  err "  1. Go to Supabase Dashboard → Project Settings → API"
  err "  2. Find 'service_role' key under 'Project API keys'"
  err "  3. Click 'Reveal' to see the full JWT token (starts with 'eyJhbGc...')"
  err "  4. Add to $ENV_FILE:"
  err "     SUPABASE_SERVICE_ROLE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  err ""
  err "  OR use Softgen's fetch_and_update_api_keys tool to do it automatically"
  exit 1
fi

# Extract SUPABASE_URL from NEXT_PUBLIC_SUPABASE_URL if not set directly
if [ -z "${SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
  debug "Using SUPABASE_URL from NEXT_PUBLIC_SUPABASE_URL"
fi

# Validate required variables
if [ -z "${SUPABASE_URL:-}" ]; then
  err "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required in $ENV_FILE"
  exit 1
fi

# For REST API, we need a JWT token (not sb_secret_)
# Priority: SUPABASE_SERVICE_ROLE_JWT > NEXT_PUBLIC_SUPABASE_ANON_KEY > SUPABASE_ANON_KEY
REST_API_TOKEN=""

if [ -n "${SUPABASE_SERVICE_ROLE_JWT:-}" ]; then
  REST_API_TOKEN="$SUPABASE_SERVICE_ROLE_JWT"
  debug "Using SUPABASE_SERVICE_ROLE_JWT for REST API"
elif [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  REST_API_TOKEN="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
  debug "Using NEXT_PUBLIC_SUPABASE_ANON_KEY for REST API"
elif [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  REST_API_TOKEN="$SUPABASE_ANON_KEY"
  debug "Using SUPABASE_ANON_KEY for REST API"
else
  err "No JWT token found for REST API"
  err ""
  err "Required: JWT token (format: eyJhbGc...) for Supabase REST API"
  err ""
  err "Please add ONE of these to $ENV_FILE:"
  err "  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... (recommended)"
  err "  SUPABASE_ANON_KEY=eyJhbGc..."
  err "  SUPABASE_SERVICE_ROLE_JWT=eyJhbGc... (if you have service_role JWT)"
  err ""
  err "Note: SUPABASE_SERVICE_ROLE_KEY with 'sb_secret_' format is for Management API only."
  exit 1
fi

# Validate JWT format (must have 3 parts: header.payload.signature)
JWT_PARTS=$(echo "$REST_API_TOKEN" | tr '.' '\n' | wc -l)
JWT_LENGTH=${#REST_API_TOKEN}

debug "JWT validation: parts=$JWT_PARTS, length=$JWT_LENGTH chars"

if [ "$JWT_PARTS" -ne 3 ]; then
  err "❌ INVALID JWT TOKEN FORMAT!"
  err ""
  err "Expected: JWT with 3 parts (header.payload.signature)"
  err "Got: $JWT_PARTS parts"
  err ""
  err "Current token: ${REST_API_TOKEN:0:50}..."
  err ""
  err "This means your token is:"
  err "  - Truncated/incomplete"
  err "  - Not a valid JWT token"
  err "  - Missing parts after copy/paste"
  err ""
  err "How to fix:"
  err "  1. Go to Supabase Dashboard → Project Settings → API"
  err "  2. Copy the COMPLETE 'anon' key (starts with 'eyJhbGc...')"
  err "  3. Update $ENV_FILE with the COMPLETE token"
  err ""
  err "A valid JWT token is typically 200-400 characters long."
  err "Your current token is only $JWT_LENGTH characters."
  exit 1
fi

if [ "$JWT_LENGTH" -lt 150 ]; then
  err "⚠️  WARNING: JWT TOKEN seems too short!"
  err ""
  err "Current length: $JWT_LENGTH characters"
  err "Expected length: 200-400 characters"
  err ""
  err "Your token might be truncated. Please verify you copied the complete token."
  exit 1
fi

# Key starts with 'eyJ' (base64 encoded JSON header)
if [[ ! "$REST_API_TOKEN" =~ ^eyJ ]]; then
  err "❌ JWT TOKEN doesn't start with 'eyJ' (invalid JWT)"
  err ""
  err "Current token starts with: ${REST_API_TOKEN:0:10}"
  err ""
  err "Valid JWT tokens always start with 'eyJ' (base64 of '{\"alg\":...')"
  err ""
  err "If you have a token starting with 'sb_secret_', that's for Management API only."
  err "For REST API (this script), you need the JWT token from Dashboard → API."
  exit 1
fi

log "✓ JWT validation passed (3 parts, $JWT_LENGTH chars, valid format)"

REST_URL="${SUPABASE_URL%/}/rest/v1"
API_KEY="$REST_API_TOKEN"

debug "SUPABASE_URL=${SUPABASE_URL:0:40}..."
debug "REST_URL=${REST_URL:0:40}..."
debug "API_KEY length=${#API_KEY}"

# Verify prerequisites
if ! command -v node >/dev/null 2>&1; then
  err "node is required but not installed"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  err "curl is required but not installed"
  exit 1
fi

if [ ! -f "$MESH_DB" ]; then
  err "MeshCentral DB not found at $MESH_DB"
  exit 1
fi

DB_SIZE=$(stat -f%z "$MESH_DB" 2>/dev/null || stat -c%s "$MESH_DB" 2>/dev/null || echo "unknown")
debug "MeshCentral DB size: $DB_SIZE bytes"

log "Starting MeshCentral → Supabase sync (DB-native)"
log "Using MeshCentral DB: $MESH_DB"
log "Target Supabase: $SUPABASE_URL"

# 1) Snapshot da DB para evitar race conditions
cp "$MESH_DB" "$TMP_DB" || {
  err "Failed to create DB snapshot"
  exit 1
}
log "Snapshot created at $TMP_DB"

SNAPSHOT_SIZE=$(stat -f%z "$TMP_DB" 2>/dev/null || stat -c%s "$TMP_DB" 2>/dev/null || echo "unknown")
debug "Snapshot size: $SNAPSHOT_SIZE bytes"

# 2) Validar token JWT format para API_KEY (REST)
if [[ "$API_KEY" =~ ^eyJ ]]; then
  JWT_PARTS=$(echo "$API_KEY" | tr '.' '\n' | wc -l)
  JWT_LENGTH=${#API_KEY}
  
  if [ "$JWT_PARTS" -ne 3 ]; then
    err "Invalid JWT format: $JWT_PARTS parts (expected 3)"
    err "JWT must be: header.payload.signature"
    exit 1
  fi
  
  if [ "$JWT_LENGTH" -lt 150 ]; then
    err "JWT too short: $JWT_LENGTH chars (expected 200+)"
    err "Token may be truncated"
    exit 1
  fi
  
  log "✓ JWT validation passed ($JWT_PARTS parts, $JWT_LENGTH chars, valid format)"
  
  # Decode JWT payload to check role
  JWT_PAYLOAD=$(echo "$API_KEY" | cut -d'.' -f2)
  # Add padding if needed (JWT base64 may not be padded)
  JWT_PAYLOAD_PADDED="$JWT_PAYLOAD$(printf '=%.0s' {1..4})"
  JWT_DECODED=$(echo "$JWT_PAYLOAD_PADDED" | base64 -d 2>/dev/null || echo '{}')
  JWT_ROLE=$(echo "$JWT_DECODED" | grep -o '"role":"[^"]*"' | cut -d'"' -f4)
  
  if [ -n "$JWT_ROLE" ]; then
    log "JWT role: $JWT_ROLE"
    
    if [ "$JWT_ROLE" = "anon" ]; then
      err "JWT has role 'anon' which is subject to RLS policies"
      err "For sync operations, you need a JWT with role 'service_role'"
      err ""
      err "Solutions:"
      err "  1. Get service_role JWT from Supabase Dashboard → Settings → API"
      err "  2. Look for 'service_role' key (NOT 'anon' key)"
      err "  3. Add to $ENV_FILE:"
      err "     SUPABASE_SERVICE_ROLE_JWT=eyJhbGc... (complete JWT with role=service_role)"
      err ""
      err "Or modify RLS policies to allow 'anon' role to INSERT (not recommended)"
      exit 1
    elif [ "$JWT_ROLE" = "service_role" ]; then
      log "✓ JWT has 'service_role' - will bypass RLS"
    else
      err "JWT role '$JWT_ROLE' is unusual (expected 'anon' or 'service_role')"
      exit 1
    fi
  else
    err "Could not decode JWT role (payload: ${JWT_DECODED:0:50}...)"
    exit 1
  fi
else
  err "API_KEY does not start with 'eyJ' (not a JWT token)"
  err "Current value starts with: ${API_KEY:0:20}"
  exit 1
fi

# -------------------------------------------------------------------
# 2) Fetch existing mesh_users mapping (id, agent_id) for source=meshcentral
#     - Ensures stable, non-null agent_id for all upserts
# -------------------------------------------------------------------
log "Fetching existing mesh_users mapping from Supabase (source=meshcentral)"

EXISTING_USERS_RESPONSE=$(curl -sS --fail-with-body -w "\n%{http_code}" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -H "Accept: application/json" \
  "${REST_URL}/mesh_users?select=id,external_user_id,agent_id,source&source=eq.meshcentral" 2>&1) || true

EXISTING_USERS_HTTP=$(echo "$EXISTING_USERS_RESPONSE" | tail -1)
EXISTING_USERS_BODY=$(echo "$EXISTING_USERS_RESPONSE" | sed '$d')

debug "Existing mesh_users HTTP: $EXISTING_USERS_HTTP"
debug "Existing mesh_users body (first 500 chars): ${EXISTING_USERS_BODY:0:500}"

if [ "$EXISTING_USERS_HTTP" != "200" ]; then
  err "Failed to fetch existing mesh_users mapping (HTTP $EXISTING_USERS_HTTP)"
  err "Response: ${EXISTING_USERS_BODY:0:500}"
  err "Skipping sync this run to avoid corrupting agent_id mappings."
  # Treat as transient data/backend issue: do not mark service as failed
  rm -f "$TMP_DB"
  exit 0
fi

# Validate JSON and compute count
if ! echo "$EXISTING_USERS_BODY" | jq empty 2>/dev/null; then
  err "Existing mesh_users mapping is not valid JSON"
  err "Body: ${EXISTING_USERS_BODY:0:500}"
  rm -f "$TMP_DB"
  exit 1
fi

EXISTING_USERS_COUNT=$(echo "$EXISTING_USERS_BODY" | jq 'length' 2>/dev/null || echo "0")
log "Existing mesh_users (source=meshcentral): $EXISTING_USERS_COUNT"

EXISTING_USERS_JSON="$EXISTING_USERS_BODY"

# -------------------------------------------------------------------
# 3) Gerar JSON de utilizadores efectivos (última versão por _id) via Node
# IMPORTANTE: stdout = JSON data, stderr = debug/error messages
# -------------------------------------------------------------------
debug "Starting Node.js pipeline..."

USERS_JSON="$(
  MESH_DB_SNAPSHOT="$TMP_DB" DEBUG="$DEBUG" EXISTING_MESH_USERS_JSON="$EXISTING_USERS_JSON" node <<'NODE'
const fs = require("fs");
const readline = require("readline");
const { randomUUID } = require("crypto");

const dbPath = process.env.MESH_DB_SNAPSHOT;
const DEBUG = process.env.DEBUG === "1";
const existingUsersJson = process.env.EXISTING_MESH_USERS_JSON || "[]";

function debug(msg) {
  if (DEBUG) {
    console.error(`[DEBUG] ${msg}`);
  }
}

function err(msg) {
  console.error(`[ERROR] ${msg}`);
}

debug(`dbPath = ${dbPath}`);

if (!dbPath) {
  err("MESH_DB_SNAPSHOT not set");
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  err(`File does not exist: ${dbPath}`);
  process.exit(1);
}

let existingUsers = [];
try {
  existingUsers = JSON.parse(existingUsersJson);
  if (!Array.isArray(existingUsers)) {
    debug("EXISTING_MESH_USERS_JSON is not an array, treating as empty");
    existingUsers = [];
  }
} catch (e) {
  err(`Failed to parse EXISTING_MESH_USERS_JSON: ${e.message}`);
  existingUsers = [];
}

const existingByExternalId = new Map();
for (const u of existingUsers) {
  if (
    u &&
    typeof u.external_user_id === "string" &&
    typeof u.id === "string" &&
    typeof u.agent_id === "string"
  ) {
    existingByExternalId.set(u.external_user_id, {
      id: u.id,
      agent_id: u.agent_id,
    });
  }
}

debug(`Existing mapping entries: ${existingByExternalId.size}`);

const stats = fs.statSync(dbPath);
debug(`File size: ${stats.size} bytes`);

const input = fs.createReadStream(dbPath, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

const lastById = new Map();
const domainsByKey = new Map();
let lineCount = 0;
let userCount = 0;
let domainCount = 0;
let parseErrors = 0;

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    parseErrors++;
    if (parseErrors <= 5) {
      console.error(`[WARN] Failed to parse line ${lineCount}: ${e.message.slice(0, 100)}`);
    }
    return null;
  }
}

function isUserId(id) {
  return typeof id === "string" && id.startsWith("user/");
}

function isDomainId(id) {
  return typeof id === "string" && id.startsWith("domain/");
}

function deriveDomainKeyAndUsername(externalId) {
  const prefix = "user/";
  if (!externalId.startsWith(prefix)) {
    return { domainKey: "", username: "" };
  }
  const tail = externalId.slice(prefix.length);
  if (tail.startsWith("/")) {
    return {
      domainKey: "",
      username: tail.slice(1),
    };
  }
  const firstSlash = tail.indexOf("/");
  if (firstSlash === -1) {
    return {
      domainKey: "",
      username: tail,
    };
  }
  return {
    domainKey: tail.slice(0, firstSlash),
    username: tail.slice(firstSlash + 1),
  };
}

function deriveRole(siteadmin) {
  const v = typeof siteadmin === "number" ? siteadmin : 0;
  if (v === 4294967295 || v === -1) return "SUPERADMIN";
  if (v > 0) return "LIMITED_ADMIN";
  return "USER";
}

(async () => {
  for await (const line of rl) {
    lineCount++;
    const rec = parseJsonLine(line);
    if (!rec || typeof rec._id !== "string") continue;

    lastById.set(rec._id, rec);

    if (isUserId(rec._id)) {
      userCount++;
    } else if (isDomainId(rec._id)) {
      domainCount++;
      const idTail = rec._id.slice("domain/".length);
      let domainKey = "";
      if (idTail.startsWith("/")) {
        domainKey = "";
      } else {
        const firstSlash = idTail.indexOf("/");
        domainKey = firstSlash === -1 ? idTail : idTail.slice(0, firstSlash);
      }

      const dns =
        typeof rec.dns === "string" && rec.dns.length > 0
          ? rec.dns
          : typeof rec.dnsname === "string" && rec.dnsname.length > 0
          ? rec.dnsname
          : null;

      const domainField =
        typeof rec.domain === "string" && rec.domain.length > 0
          ? rec.domain
          : "";

      domainsByKey.set(domainKey, {
        dns,
        domain: domainField,
      });
    }
  }

  debug(`Processed ${lineCount} lines`);
  debug(`Found ${userCount} user records`);
  debug(`Found ${domainCount} domain records`);
  debug(`Parse errors: ${parseErrors}`);
  debug(`lastById.size = ${lastById.size}`);

  if (parseErrors > 5) {
    console.error(`[WARN] Total parse errors: ${parseErrors} (showing first 5)`);
  }

  const users = [];

  for (const [id, rec] of lastById.entries()) {
    if (!isUserId(id)) continue;

    const externalUserId = id;
    const { domainKey, username } = deriveDomainKeyAndUsername(externalUserId);

    if (!username) {
      console.error(`[WARN] Empty username for ${id}`);
      continue;
    }

    const meshUser = {
      external_user_id: externalUserId,
      domain_key: domainKey,
      mesh_username: username,
    };

    const domainInfo = domainsByKey.get(domainKey) || null;
    meshUser.domain_dns = domainInfo && domainInfo.dns ? domainInfo.dns : null;
    meshUser.domain =
      typeof rec.domain === "string" && rec.domain.length > 0
        ? rec.domain
        : domainInfo && typeof domainInfo.domain === "string"
        ? domainInfo.domain
        : "";

    // ✅ NOVO: Mapear domínio vazio para 'mesh' (default do MeshCentral)
    if (!meshUser.domain || meshUser.domain === "") {
      meshUser.domain = "mesh";
    }
    if (!meshUser.domain_key || meshUser.domain_key === "") {
      meshUser.domain_key = "mesh";
    }

    meshUser.email =
      typeof rec.email === "string" && rec.email.length > 0
        ? rec.email
        : null;
    meshUser.name =
      typeof rec.name === "string" && rec.name.length > 0
        ? rec.name
        : null;

    meshUser.display_name =
      meshUser.name ||
      (meshUser.email && meshUser.email.length > 0 ? meshUser.email : null);

    const disabledRaw =
      rec.disabled !== undefined
        ? rec.disabled
        : rec.deleted !== undefined
        ? rec.deleted
        : 0;
    meshUser.disabled = !!disabledRaw;

    const siteadmin =
      typeof rec.siteadmin === "number" ? rec.siteadmin : 0;
    const domainadmin =
      typeof rec.domainadmin === "number" ? rec.domainadmin : 0;
    meshUser.siteadmin = siteadmin;
    meshUser.domainadmin = domainadmin;
    meshUser.role = deriveRole(siteadmin);
    meshUser.source = "meshcentral";
    meshUser.user_type = "candidato"; // ✅ NORMALIZADO: lowercase

    // ----------------------------------------------------------------
    // Agent model alignment:
    //  - For existing meshcentral users: reuse id and agent_id
    //  - For new users: assign a deterministic self-agent (id = agent_id)
    // ----------------------------------------------------------------
    const existing = existingByExternalId.get(externalUserId);

    if (existing && typeof existing.id === "string" && typeof existing.agent_id === "string") {
      meshUser.id = existing.id;
      meshUser.agent_id = existing.agent_id;
    } else {
      const newId = randomUUID();
      meshUser.id = newId;
      meshUser.agent_id = newId;
    }

    users.push(meshUser);
  }

  debug(`Generated ${users.length} user objects`);

  if (users.length === 0) {
    err("No users generated from DB!");
    err(`Stats: ${lineCount} lines, ${userCount} user records, ${lastById.size} unique IDs`);
    process.exit(1);
  }

  // Extra safeguard: ensure no null agent_id leaves this pipeline
  const nullAgentUsers = users.filter((u) => !u.agent_id);
  if (nullAgentUsers.length > 0) {
    err(`Internal invariant broken: ${nullAgentUsers.length} users without agent_id`);
    err(`Sample user without agent_id: ${JSON.stringify(nullAgentUsers[0]).slice(0, 500)}`);
    process.exit(1);
  }

  // Output JSON to stdout (para captura pelo script bash)
  process.stdout.write(JSON.stringify(users));
})().catch((err) => {
  console.error("[ERROR] Node pipeline failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
NODE
)" 2>&1

NODE_EXIT=$?

if [ $NODE_EXIT -ne 0 ]; then
  err "Node.js pipeline failed with exit code $NODE_EXIT"
  err "Output: ${USERS_JSON:0:500}..."
  rm -f "$TMP_DB"
  exit 1
fi

if [ -z "$USERS_JSON" ]; then
  err "Node pipeline produced empty output"
  rm -f "$TMP_DB"
  exit 1
fi

# Validar se é JSON válido
if ! echo "$USERS_JSON" | jq empty 2>/dev/null; then
  err "Node pipeline produced invalid JSON"
  err "Output: ${USERS_JSON:0:500}..."
  rm -f "$TMP_DB"
  exit 1
fi

USER_COUNT=$(echo "$USERS_JSON" | jq 'length' 2>/dev/null || echo "0")
log "Parsed $USER_COUNT users from MeshCentral DB"

if [ "$USER_COUNT" -eq 0 ]; then
  err "No users found in MeshCentral DB"
  rm -f "$TMP_DB"
  exit 1
fi

debug "First user: $(echo "$USERS_JSON" | jq '.[0]' 2>/dev/null || echo '{}')"

# 4) Desactivar (disabled=true) todos os mesh_users com source='meshcentral'
log "Marking existing meshcentral users as disabled=true"
PATCH_RESPONSE=$(curl -sS --fail-with-body -w "\n%{http_code}" \
  -X PATCH \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"disabled": true}' \
  "${REST_URL}/mesh_users?source=eq.meshcentral" 2>&1) || true

PATCH_HTTP=$(echo "$PATCH_RESPONSE" | tail -1)
PATCH_BODY=$(echo "$PATCH_RESPONSE" | sed '$d')

debug "PATCH response HTTP: $PATCH_HTTP"
debug "PATCH response body: ${PATCH_BODY:0:500}"

if [ "$PATCH_HTTP" != "200" ] && [ "$PATCH_HTTP" != "204" ]; then
  # Classify transient vs real failure
  if [ "$PATCH_HTTP" -ge 500 ] 2>/dev/null; then
    err "Transient Supabase error while disabling existing meshcentral users (HTTP $PATCH_HTTP)"
    err "Response: ${PATCH_BODY:0:500}"
    log "Treating PATCH failure as transient; skipping this run without marking service failed."
    rm -f "$TMP_DB"
    exit 0
  fi

  err "Failed to mark existing meshcentral users as disabled (HTTP $PATCH_HTTP)"
  err "Response: $PATCH_BODY"
  err "Check SUPABASE_URL and JWT token (ANON_KEY or SERVICE_ROLE_JWT) in $ENV_FILE"
  rm -f "$TMP_DB"
  exit 1
fi

# 5) Upsert array com todos os users (sempre com agent_id não-nulo)
log "Upserting MeshCentral users into Supabase (mesh_users)"
UPSERT_RESPONSE=$(curl -sS --fail-with-body -w "\n%{http_code}" \
  -X POST \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  -d "$USERS_JSON" \
  "${REST_URL}/mesh_users?on_conflict=external_user_id" 2>&1) || true

UPSERT_HTTP=$(echo "$UPSERT_RESPONSE" | tail -1)
UPSERT_BODY=$(echo "$UPSERT_RESPONSE" | sed '$d')

debug "UPSERT response HTTP: $UPSERT_HTTP"
debug "UPSERT response body: ${UPSERT_BODY:0:500}"

if [ "$UPSERT_HTTP" != "200" ] && [ "$UPSERT_HTTP" != "201" ]; then
  # Log full response body and a sample failing record (best-effort)
  err "Failed to upsert mesh_users into Supabase (HTTP $UPSERT_HTTP)"
  err "Response body: ${UPSERT_BODY:0:2000}"

  SAMPLE_USER="$(echo "$USERS_JSON" | jq '.[0]' 2>/dev/null || echo '{}')"
  err "Sample payload record (redacted, first record): ${SAMPLE_USER:0:1000}"

  # Classify transient (5xx) vs real (4xx) failure
  if [ "$UPSERT_HTTP" -ge 500 ] 2>/dev/null; then
    err "Treating UPSERT HTTP $UPSERT_HTTP as transient backend error; not marking service as failed."
    rm -f "$TMP_DB"
    exit 0
  fi

  err "HTTP $UPSERT_HTTP indicates contract / data error (e.g., 400 Postgres 23502)."
  err "Please review mesh_users schema and the payload sample above."
  rm -f "$TMP_DB"
  exit 1
fi

log "MeshCentral → Supabase sync completed successfully"

# Cleanup
rm -f "$TMP_DB"
debug "Cleanup: removed $TMP_DB"