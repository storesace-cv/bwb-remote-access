#!/usr/bin/env bash
#
# Synchronises MeshCentral users -> Supabase (mesh_users), multi-domain aware.
#
# - MeshCentral is the source of truth for users/domains.
# - Upserts into public.mesh_users using external_user_id as the stable key.
# - Preserves auth_user_id mapping (never overwrites it).
# - Runs idempotently: can be called every ~15 minutes.
#
# Requirements:
#   - jq
#   - curl
#
# Expected JSON input (example based on docs/users_all_domains.json):
# [
#   {
#     "_id": "user//admin",
#     "domain": "",
#     "name": "admin",
#     "email": "suporte@storesace.cv",
#     "siteadmin": 4294967295,
#     "domainadmin": 0,
#     "creation": 1721004286,
#     "login": 1765996903,
#     "access": 1765996903,
#     "llang": "pt"
#   },
#   ...
# ]
#
set -euo pipefail

USERS_JSON="${USERS_JSON:-/opt/meshcentral/meshcentral-data/users_all_domains.json}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-/opt/meshcentral/meshcentral-data/sync-env.sh}"

if [ -f "$CREDENTIALS_FILE" ]; then
  # shellcheck disable=SC1091
  source "$CREDENTIALS_FILE"
fi

SUPABASE_URL="${SUPABASE_URL:-https://kqwaibgvmzcqeoctukoy.supabase.co}"
REST_URL="${SUPABASE_URL}/rest/v1"

AUTH_BEARER="${SYNC_JWT:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
API_KEY="${SUPABASE_ANON_KEY:-}"

# Domain registry configuration (explicit; MUST match MeshCentral config)
MESH_DEFAULT_DOMAIN_DNS="${MESH_DEFAULT_DOMAIN_DNS:-mesh.bwb.pt}"
MESH_DOMAIN_SUFFIX="${MESH_DOMAIN_SUFFIX:-bwb.pt}"
MESH_DOMAINS_JSON="${MESH_DOMAINS_JSON:-/opt/meshcentral/meshcentral-data/domains.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "[sync-mesh-users] ERROR: jq is required." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[sync-mesh-users] ERROR: curl is required." >&2
  exit 1
fi

if [ -z "${SUPABASE_URL:-}" ]; then
  echo "[sync-mesh-users] ERROR: SUPABASE_URL not defined." >&2
  exit 1
fi

if [ -z "${AUTH_BEARER:-}" ]; then
  echo "[sync-mesh-users] ERROR: define SYNC_JWT or SUPABASE_SERVICE_ROLE_KEY in ${CREDENTIALS_FILE}." >&2
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  API_KEY="$AUTH_BEARER"
fi

if [ ! -f "$USERS_JSON" ]; then
  echo "[sync-mesh-users] WARNING: users JSON not found at $USERS_JSON; nothing to do."
  exit 0
fi

supabase_patch_mesh_users_disable_all() {
  echo "[sync-mesh-users] Marking all meshcentral-sourced mesh_users as disabled=true..."
  curl -sS --fail-with-body \
    -X PATCH \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"disabled": true}' \
    "${REST_URL}/mesh_users?source=eq.meshcentral" >/dev/null 2>&1 || {
      echo "[sync-mesh-users] WARNING: failed to mark existing meshcentral users as disabled; continuing." >&2
    }
}

supabase_upsert_mesh_user() {
  local payload="$1"

  curl -sS --fail-with-body \
    -X POST \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    -d "[$payload]" \
    "${REST_URL}/mesh_users?on_conflict=external_user_id" >/dev/null 2>&1 || {
      echo "[sync-mesh-users] WARNING: failed to upsert mesh_user payload: $payload" >&2
      return 1
    }

  return 0
}

parse_domain_key_and_username() {
  local full_id="$1"
  local tail
  local domain_key
  local username

  tail="${full_id#user/}"

  if [[ "$tail" == /* ]]; then
    domain_key=""
    username="${tail#/}"
  else
    domain_key="${tail%%/*}"
    username="${tail#*/}"
  fi

  printf '%s;%s\n' "$domain_key" "$username"
}

load_domain_dns() {
  local key="$1"
  local dns=""

  if [ -n "${MESH_DOMAINS_JSON:-}" ] && [ -f "$MESH_DOMAINS_JSON" ]; then
    dns=$(jq -r --arg k "$key" '
      (.domains // [])[]
      | select(.key == $k)
      | .dns
    ' "$MESH_DOMAINS_JSON" 2>/dev/null || echo "")
  fi

  if [ -z "$dns" ] || [ "$dns" = "null" ]; then
    if [ -z "$key" ]; then
      dns="$MESH_DEFAULT_DOMAIN_DNS"
    else
      dns="$key.$MESH_DOMAIN_SUFFIX"
    fi
  fi

  printf '%s\n' "$dns"
}

derive_role_from_privileges() {
  local siteadmin="$1"
  local domainadmin="$2"

  if [ "$siteadmin" = "4294967295" ]; then
    printf 'SUPERADMIN\n'
  elif [ "$domainadmin" != "0" ]; then
    printf 'DOMAIN_ADMIN\n'
  elif [ "$siteadmin" != "0" ]; then
    printf 'LIMITED_ADMIN\n'
  else
    printf 'USER\n'
  fi
}

echo "[sync-mesh-users] 🚀 Starting MeshCentral → Supabase user sync"
echo "[sync-mesh-users] Using users JSON: $USERS_JSON"
echo "[sync-mesh-users] Supabase URL: $SUPABASE_URL"

supabase_patch_mesh_users_disable_all

users_count=$(jq 'length' "$USERS_JSON" | tr -d '"')
echo "[sync-mesh-users] Found $users_count user entries in JSON"

jq -c '.[]' "$USERS_JSON" | while read -r row; do
  full_id=$(echo "$row" | jq -r '._id // empty')
  if [ -z "$full_id" ] || [ "$full_id" = "null" ]; then
    continue
  fi

  domain_and_user=$(parse_domain_key_and_username "$full_id")
  domain_key="${domain_and_user%%;*}"
  username="${domain_and_user#*;}"

  if [ -z "$username" ]; then
    echo "[sync-mesh-users] WARNING: could not parse username from _id=$full_id; skipping." >&2
    continue
  fi

  domain_dns=$(load_domain_dns "$domain_key")

  name=$(echo "$row" | jq -r '.name // empty')
  email=$(echo "$row" | jq -r '.email // empty')
  domain_field=$(echo "$row" | jq -r '.domain // empty')

  if [ "$domain_field" = "null" ]; then
    domain_field=""
  fi

  # ✅ NOVO: Mapear domínio vazio para 'mesh' (default do MeshCentral)
  if [ -z "$domain_field" ]; then
    domain_field="mesh"
  fi

  # ✅ NOVO: Mapear domain_key vazio para 'mesh' (default do MeshCentral)
  if [ -z "$domain_key" ]; then
    domain_key="mesh"
  fi

  siteadmin_raw=$(echo "$row" | jq -r '.siteadmin // 0')
  if [ -z "$siteadmin_raw" ] || [ "$siteadmin_raw" = "null" ]; then
    siteadmin_raw="0"
  fi

  domainadmin_raw=$(echo "$row" | jq -r '.domainadmin // 0')
  if [ -z "$domainadmin_raw" ] || [ "$domainadmin_raw" = "null" ]; then
    domainadmin_raw="0"
  fi

  disabled_flag=$(echo "$row" | jq -r '.disabled // 0')
  disabled_json="false"
  if [ "$disabled_flag" = "1" ] || [ "$disabled_flag" = "true" ]; then
    disabled_json="true"
  fi

  role=$(derive_role_from_privileges "$siteadmin_raw" "$domainadmin_raw")

  display_name="$name"
  if [ -z "$display_name" ] && [ -n "$email" ]; then
    display_name="$email"
  fi

  payload=$(jq -n \
    --arg ext_id "$full_id" \
    --arg domain_key "$domain_key" \
    --arg domain_dns "$domain_dns" \
    --arg domain_field "$domain_field" \
    --arg username "$username" \
    --arg display_name "$display_name" \
    --arg email "$email" \
    --arg name "$name" \
    --arg source "meshcentral" \
    --arg siteadmin_str "$siteadmin_raw" \
    --arg domainadmin_str "$domainadmin_raw" \
    --arg role "$role" \
    --argjson disabled "$disabled_json" \
    '{
      external_user_id: $ext_id,
      domain_key: $domain_key,
      domain_dns: (if ($domain_dns | length) > 0 then $domain_dns else null end),
      domain: $domain_field,
      mesh_username: $username,
      email: (if ($email | length) > 0 then $email else null end),
      name: (if ($name | length) > 0 then $name else null end),
      display_name: (if ($display_name | length) > 0 then $display_name else null end),
      disabled: $disabled,
      siteadmin: ($siteadmin_str | tonumber),
      domainadmin: ($domainadmin_str | tonumber),
      role: $role,
      source: $source
    }')

  echo "[sync-mesh-users] ⇢ Upserting mesh_user external_user_id=$full_id domain_key='${domain_key}' username='${username}' role=${role}"

  supabase_upsert_mesh_user "$payload" || true
done

echo "[sync-mesh-users] ✅ MeshCentral → Supabase user sync completed"