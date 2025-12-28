#!/usr/bin/env bash
#
# Sincroniza dispositivos RustDesk/MeshCentral -> Supabase (android_devices)
#
# - Usa REST API direta (sem Edge Functions) para evitar timeouts
# - Faz matching temporal com base em device_registration_sessions
# - Quando não encontra utilizador para um órfão, atribui-o de imediato ao admin canónico
#
set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-/opt/meshcentral/meshcentral-data/android-users.json}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-/opt/meshcentral/meshcentral-data/sync-env.sh}"
RUSTDESK_DB="${RUSTDESK_DB:-/opt/rustdesk/db_v2.sqlite3}"

if [ -f "$CREDENTIALS_FILE" ]; then
  # shellcheck disable=SC1091
  source "$CREDENTIALS_FILE"
fi

SUPABASE_URL="${SUPABASE_URL:-https://kqwaibgvmzcqeoctukoy.supabase.co}"
REST_URL="${SUPABASE_URL}/rest/v1"

AUTH_BEARER="${SYNC_JWT:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
API_KEY="${SUPABASE_ANON_KEY:-}"

# Admin canónico (auth.users.id) conforme especificação
ADMIN_AUTH_USER_ID="${ADMIN_AUTH_USER_ID:-9ebfa3dd-392c-489d-882f-8a1762cb36e8}"
ADMIN_MESH_USER_ID=""
ADMIN_MESH_USERNAME=""

if ! command -v jq >/dev/null 2>&1; then
  echo "[sync-devices] ERRO: jq não está instalado." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[sync-devices] ERRO: curl não está instalado." >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[sync-devices] AVISO: sqlite3 não instalado - sync RustDesk desativado." >&2
  RUSTDESK_SYNC_DISABLED=1
else
  RUSTDESK_SYNC_DISABLED=0
fi

if [ -z "$SUPABASE_URL" ]; then
  echo "[sync-devices] ERRO: SUPABASE_URL não definido." >&2
  exit 1
fi

if [ -z "$AUTH_BEARER" ]; then
  echo "[sync-devices] ERRO: Defina SYNC_JWT ou SUPABASE_SERVICE_ROLE_KEY." >&2
  exit 1
fi

if [ -z "$API_KEY" ]; then
  API_KEY="$AUTH_BEARER"
fi

# ====================================================================
# RESOLUÇÃO DO ADMIN CANÓNICO
# ====================================================================

init_admin_mesh_user() {
  if [ -z "$ADMIN_AUTH_USER_ID" ]; then
    echo "[sync-devices] ERRO: ADMIN_AUTH_USER_ID não definido." >&2
    exit 1
  fi

  echo "[sync-devices] 🔑 A resolver mesh_user do admin canónico ($ADMIN_AUTH_USER_ID)..."
  local resp
  resp=$(supabase_query "/mesh_users?auth_user_id=eq.${ADMIN_AUTH_USER_ID}&select=id,mesh_username")

  local count
  count=$(echo "$resp" | jq 'length' | tr -d '"')
  if [ "$count" -eq 0 ]; then
    echo "[sync-devices] ERRO: mesh_users não tem mapping para ADMIN_AUTH_USER_ID=$ADMIN_AUTH_USER_ID" >&2
    exit 1
  fi

  ADMIN_MESH_USER_ID=$(echo "$resp" | jq -r '.[0].id')
  ADMIN_MESH_USERNAME=$(echo "$resp" | jq -r '.[0].mesh_username // empty')

  echo "[sync-devices] ✅ Admin mesh_user.id=$ADMIN_MESH_USER_ID mesh_username=${ADMIN_MESH_USERNAME:-<none>}"
}

# ====================================================================
# FUNÇÕES REST API - ACESSO DIRETO AO POSTGRESQL
# ====================================================================

# Query com GET
supabase_query() {
  local endpoint="$1"
  
  curl -sS --fail-with-body \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H "Content-Type: application/json" \
    "${REST_URL}${endpoint}" 2>/dev/null || echo "[]"
}

# Upsert device (INSERT com ON CONFLICT), incluindo rustdesk_ip
upsert_device() {
  local device_id="$1"
  local owner="${2:-null}"
  local mesh_username="${3:-null}"
  local friendly_name="${4:-null}"
  local last_seen="${5:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
  local rustdesk_ip="${6:-null}"
  
  # Construir JSON payload
  local payload
  payload=$(jq -n \
    --arg device_id "$device_id" \
    --arg owner "$owner" \
    --arg mesh_username "$mesh_username" \
    --arg friendly_name "$friendly_name" \
    --arg last_seen "$last_seen" \
    --arg rustdesk_ip "$rustdesk_ip" \
    '{
      device_id: $device_id,
      owner: (if $owner == "null" then null else $owner end),
      mesh_username: (if $mesh_username == "null" then null else $mesh_username end),
      friendly_name: (if $friendly_name == "null" then null else $friendly_name end),
      last_seen_at: $last_seen,
      rustdesk_ip: (if $rustdesk_ip == "null" then null else $rustdesk_ip end),
      deleted_at: null
    }')
  
  # DEBUG opcional (descomentar se necessário)
  # echo "      [DEBUG] Upsert payload: $payload" >&2
  
  # Upsert via REST API
  local response
  response=$(curl -sS --fail-with-body \
    -X POST \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    -d "$payload" \
    "${REST_URL}/android_devices?on_conflict=device_id" 2>&1)
  
  local exit_code=$?
  
  if (exit_code -eq 0); then
    echo "$response"
    return 0
  else
    echo "ERROR: $response" >&2
    return 1
  fi
}

# Atualizar device existente
update_device() {
  local device_id="$1"
  local updates="$2"
  
  curl -sS --fail-with-body \
    -X PATCH \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$updates" \
    "${REST_URL}/android_devices?device_id=eq.${device_id}" 2>/dev/null
}

# ====================================================================
# SYNC RUSTDESK DATABASE
# ====================================================================

sync_rustdesk_devices() {
  echo "[sync-devices] 🔍 Iniciando sync de devices RustDesk..."
  
  if [ "$RUSTDESK_SYNC_DISABLED" -eq 1 ]; then
    echo "[sync-devices] ⚠️  Sync RustDesk desativado (sqlite3 não instalado)"
    return 0
  fi
  
  if [ ! -f "$RUSTDESK_DB" ]; then
    echo "[sync-devices] ⚠️  Base de dados RustDesk não encontrada: $RUSTDESK_DB"
    return 0
  fi
  
  echo "[sync-devices] 📂 Lendo devices de: $RUSTDESK_DB"
  
  # Extrair devices
  local devices_json
  devices_json=$(sqlite3 "$RUSTDESK_DB" -json "SELECT id, info FROM peer WHERE pk IS NOT NULL AND pk != ''")
  
  if [ -z "$devices_json" ] || [ "$devices_json" = "[]" ]; then
    echo "[sync-devices] ℹ️  Sem devices no RustDesk"
    return 0
  fi
  
  local devices_count
  devices_count=$(echo "$devices_json" | jq 'length' | tr -d '"')
  echo "[sync-devices] 📱 Encontrados $devices_count devices no RustDesk"
  
  # Processar cada device
  echo "$devices_json" | jq -c '.[]' | while read -r device; do
    local device_id
    device_id=$(echo "$device" | jq -r '.id')
    
    if [ -z "$device_id" ] || [ "$device_id" = "null" ]; then
      continue
    fi
    
    echo "  [sync-devices] 📱 Device: $device_id"
    
    # Verificar se device já existe
    local existing
    existing=$(supabase_query "/android_devices?device_id=eq.$device_id&select=device_id,owner,deleted_at")
    local exists
    exists=$(echo "$existing" | jq 'length' | tr -d '"')
    
    # Extrair friendly_name, last_seen e rustdesk_ip a partir do info JSON do RustDesk
    local friendly_name="null"
    local lastSeen=""
    local rustdesk_ip="null"
    local info
    info=$(echo "$device" | jq -r '.info // ""')
    
    if [ -n "$info" ] && [ "$info" != "null" ]; then
      friendly_name=$(echo "$info" | jq -r '.username // .hostname // .device_name // "null"' 2>/dev/null || echo "null")
      lastSeen=$(echo "$info" | jq -r '.last_seen // .last_seen_at // .lastseen // empty' 2>/dev/null || echo "")
      rustdesk_ip=$(echo "$info" | jq -r '.ip // .peer.ip // empty' 2>/dev/null || echo "")
    fi
    
    # Normalizar rustdesk_ip (remover prefixos ::ffff:)
    if [ -n "$rustdesk_ip" ] && [ "$rustdesk_ip" != "null" ]; then
      if [[ "$rustdesk_ip" == *"::ffff:"* ]]; then
        rustdesk_ip="${rustdesk_ip##*ffff:}"
      fi
    else
      rustdesk_ip="null"
    fi
    
    if [ -z "$lastSeen" ] || [ "$lastSeen" = "null" ]; then
      lastSeen=""
    fi
    
    if [ "$exists" -gt 0 ]; then
      local has_owner
      has_owner=$(echo "$existing" | jq -r '.[0].owner // "null"')
      local is_deleted
      is_deleted=$(echo "$existing" | jq -r '.[0].deleted_at // "null"')
      
      # Se o device foi soft-deleted, nunca o reactivamos a partir do RustDesk
      if [ "$is_deleted" != "null" ]; then
        echo "    [sync-devices] ✓ Device deleted, skip"
        continue
      fi
      
      # Device já adoptado (owner != NULL, ainda activo):
      # ➜ actualizar apenas last_seen_at (e opcionalmente rustdesk_ip) e NÃO mexer em owner/notes/mesh_username
      if [ "$has_owner" != "null" ]; then
        if [ -z "$lastSeen" ] || [ "$lastSeen" = "null" ]; then
          echo "    [sync-devices] ⚠️  Device adoptado sem last_seen válido no RustDesk; a manter valor existente"
        else
          echo "    [sync-devices] ↻ Device adoptado, a actualizar last_seen_at"
          local update_payload
          if [ "$rustdesk_ip" != "null" ]; then
            update_payload=$(jq -n \
              --arg last_seen "$lastSeen" \
              --arg rustdesk_ip "$rustdesk_ip" \
              '{ last_seen_at: $last_seen, rustdesk_ip: $rustdesk_ip }')
          else
            update_payload=$(jq -n \
              --arg last_seen "$lastSeen" \
              '{ last_seen_at: $last_seen }')
          fi
          update_device "$device_id" "$update_payload" >/dev/null 2>&1 || echo "    [sync-devices] ❌ Erro ao actualizar last_seen_at para device adoptado" >&2
        fi
        continue
      fi
      # Se existe mas continua órfão (owner=null), cai no fluxo de órfãos abaixo
    fi
    
    echo "    [sync-devices] 🔄 Criando entrada para matching temporal..."
    
    local upsert_result
    upsert_result=$(upsert_device "$device_id" "null" "null" "$friendly_name" "$lastSeen" "$rustdesk_ip" 2>&1)
    local upsert_exit=$?
    
    if [ $upsert_exit -eq 0 ]; then
      echo "    [sync-devices] ✅ Device registado para matching"
    else
      echo "    [sync-devices] ❌ Erro ao registar device:" >&2
      echo "    $upsert_result" >&2
    fi
  done
  
  echo "[sync-devices] ✅ Sync RustDesk completo"
}

# ====================================================================
# MATCHING TEMPORAL
# ====================================================================

process_temporal_matching() {
  echo "[sync-devices] 🔍 Iniciando matching temporal (janela 0–8 minutos após o último last_seen)..."

  if [ -z "$ADMIN_MESH_USER_ID" ]; then
    echo "[sync-devices] ERRO: ADMIN_MESH_USER_ID não resolvido. Chame init_admin_mesh_user primeiro." >&2
    return 1
  fi

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # 1. Buscar todos os devices órfãos (sem owner, não apagados) nas últimas 24h
  local day_ago
  day_ago=$(date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "$now")

  local orphan_devices
  orphan_devices=$(supabase_query "/android_devices?owner=is.null&deleted_at=is.null&last_seen_at=gte.${day_ago}&order=last_seen_at.asc")

  if [ "$orphan_devices" = "[]" ] || [ -z "$orphan_devices" ]; then
    echo "[sync-devices] ℹ️  Sem devices órfãos recentes para matching"
    return 0
  fi

  local devices_count
  devices_count=$(printf '%s\n' "$orphan_devices" | jq -r 'length' 2>/dev/null || echo "0")
  echo "[sync-devices] 📱 Encontrados $devices_count devices órfãos para analisar"

  local matched_count=0
  local assigned_to_admin=0

  while IFS= read -r device; do
    local device_id
    device_id=$(printf '%s\n' "$device" | jq -r '.device_id // empty')

    local last_seen
    last_seen=$(printf '%s\n' "$device" | jq -r '.last_seen_at // .created_at // empty')

    local rustdesk_ip
    rustdesk_ip=$(printf '%s\n' "$device" | jq -r '.rustdesk_ip // empty')
    if [ -n "$rustdesk_ip" ] && [ "$rustdesk_ip" != "null" ]; then
      if [[ "$rustdesk_ip" == *"::ffff:"* ]]; then
        rustdesk_ip="${rustdesk_ip##*ffff:}"
      fi
    else
      rustdesk_ip=""
    fi

    if [ -z "$device_id" ] || [ "$device_id" = "null" ]; then
      continue
    fi

    if [ -z "$last_seen" ] || [ "$last_seen" = "null" ]; then
      echo "  [sync-devices] ⚠️  Device $device_id sem last_seen_at nem created_at válido, a atribuir ao admin" >&2
      local admin_payload
      admin_payload=$(jq -n \
        --arg owner "$ADMIN_MESH_USER_ID" \
        --arg mesh_username "$ADMIN_MESH_USERNAME" \
        '{
          owner: $owner,
          mesh_username: ($mesh_username | select(length > 0))
        }')
      update_device "$device_id" "$admin_payload" >/dev/null 2>&1 || true
      assigned_to_admin=$((assigned_to_admin + 1))
      continue
    fi

    echo "  [sync-devices] ➕ Device órfão: $device_id (last_seen_at=$last_seen)"

    # 2. Calcular janela [last_seen - 8min, last_seen]
    local window_start
    window_start=$(date -u -d "$last_seen - 8 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "$last_seen")

    # 3. Buscar sessões de registo que caem nesta janela:
    local sessions
    sessions=$(supabase_query "/device_registration_sessions?status=eq.awaiting_device&clicked_at=lte.${last_seen}&clicked_at=gte.${window_start}&select=id,user_id,clicked_at,ip_address")

    local sess_count
    sess_count=$(printf '%s\n' "$sessions" | jq -r 'length' 2>/dev/null || echo "0")

    case "$sess_count" in
      '' )
        sess_count=0
        ;;
      *[!0-9]* )
        echo "    [sync-devices] ⚠️  Valor inesperado de sess_count=\"$sess_count\", a tratar como 0" >&2
        sess_count=0
        ;;
    esac

    if [ "$sess_count" -eq 0 ]; then
      echo "    [sync-devices] ⚠️  0 sessões candidatas na janela [${window_start}, ${last_seen}] para $device_id"
      echo "    [sync-devices] ➡️  A atribuir device ao admin canónico (no_sessions)"

      # Notificar ambiguidade (sem sessões)
      local notify_payload
      notify_payload=$(jq -n \
        --arg device_id "$device_id" \
        --arg rustdesk_ip "$rustdesk_ip" \
        --arg reason "no_sessions" \
        '{
          device_id: $device_id,
          rustdesk_ip: (if ($rustdesk_ip | length) > 0 then $rustdesk_ip else null end),
          reason: $reason,
          candidates: []
        }')
      curl -sS -X POST \
        -H "Authorization: Bearer $AUTH_BEARER" \
        -H "apikey: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$notify_payload" \
        "${SUPABASE_URL}/functions/v1/notify-ambiguous-device" >/dev/null 2>&1 || echo "    [sync-devices] ⚠️  Falha ao chamar notify-ambiguous-device (no_sessions)" >&2

      local admin_payload
      admin_payload=$(jq -n \
        --arg owner "$ADMIN_MESH_USER_ID" \
        --arg mesh_username "$ADMIN_MESH_USERNAME" \
        '{
          owner: $owner,
          mesh_username: ($mesh_username | select(length > 0))
        }')
      update_device "$device_id" "$admin_payload" >/dev/null 2>&1 || true
      assigned_to_admin=$((assigned_to_admin + 1))
      continue
    fi

    # Se houver uma ou mais sessões, primeiro verificar se todos os user_id são o mesmo
    local distinct_users
    distinct_users=$(printf '%s\n' "$sessions" | jq '[.[].user_id] | map(tostring) | unique')
    local user_count
    user_count=$(printf '%s\n' "$distinct_users" | jq -r 'length' 2>/dev/null || echo "0")

    if [ "$user_count" -eq 1 ]; then
      # Todas as sessões pertencem ao mesmo utilizador – matching inequívoco
      local user_id
      user_id=$(printf '%s\n' "$distinct_users" | jq -r '.[0]')
      local session_id
      session_id=$(printf '%s\n' "$sessions" | jq -r '.[0].id')

      echo "    [sync-devices] ✅ MATCH: Device $device_id → user_id=$user_id (todas as sessões pertencem ao mesmo utilizador)"

      local mesh_user_response
      mesh_user_response=$(supabase_query "/mesh_users?auth_user_id=eq.${user_id}&select=id,mesh_username")
      local mesh_count
      mesh_count=$(printf '%s\n' "$mesh_user_response" | jq -r 'length' 2>/dev/null || echo "0")

      if [ "$mesh_count" -eq 0 ]; then
        echo "    [sync-devices] ⚠️  mesh_user não encontrado para user_id=$user_id, a atribuir ao admin" >&2
        local admin_payload
        admin_payload=$(jq -n \
          --arg owner "$ADMIN_MESH_USER_ID" \
          --arg mesh_username "$ADMIN_MESH_USERNAME" \
          '{
            owner: $owner,
            mesh_username: ($mesh_username | select(length > 0))
          }')
        update_device "$device_id" "$admin_payload" >/dev/null 2>&1 || true
        assigned_to_admin=$((assigned_to_admin + 1))
        continue
      fi

      local owner_id
      owner_id=$(printf '%s\n' "$mesh_user_response" | jq -r '.[0].id')
      local mesh_username
      mesh_username=$(printf '%s\n' "$mesh_user_response" | jq -r '.[0].mesh_username // empty')

      local update_payload
      update_payload=$(jq -n \
        --arg owner "$owner_id" \
        --arg mesh_username "$mesh_username" \
        '{
          owner: $owner,
          mesh_username: ($mesh_username | select(length > 0))
        }')

      if update_device "$device_id" "$update_payload" >/dev/null 2>&1; then
        echo "    [sync-devices] ✅ Device atualizado com owner=$owner_id"
        matched_count=$((matched_count + 1))

        local update_session_payload
        update_session_payload=$(jq -n \
          --arg device_id "$device_id" \
          --arg now "$now" \
          '{
            status: "completed",
            matched_device_id: $device_id,
            matched_at: $now
          }')

        curl -sS --fail-with-body \
          -X PATCH \
          -H "apikey: $API_KEY" \
          -H "Authorization: Bearer $AUTH_BEARER" \
          -H "Content-Type: application/json" \
          -H "Prefer: return=representation" \
          -d "$update_session_payload" \
          "${REST_URL}/device_registration_sessions?id=eq.${session_id}" >/dev/null 2>&1 || true
      else
        echo "    [sync-devices] ❌ Erro ao atualizar device com owner=$owner_id" >&2
      fi
      continue
    fi

    # user_count > 1 → vários utilizadores com sessões na mesma janela.
    # Se tivermos rustdesk_ip, tentar reduzir para 1 sessão usando o IP como critério.
    if [ -n "$rustdesk_ip" ]; then
      echo "    [sync-devices] ℹ️  ${sess_count} sessões de múltiplos utilizadores; a tentar filtrar por rustdesk_ip=$rustdesk_ip"
      local filtered_sessions
      filtered_sessions=$(printf '%s\n' "$sessions" | jq --arg ip "$rustdesk_ip" '[.[] | select((.ip_address // "") == $ip)]')
      local filtered_count
      filtered_count=$(printf '%s\n' "$filtered_sessions" | jq -r 'length' 2>/dev/null || echo "0")

      if [ "$filtered_count" -eq 1 ]; then
        local session_id
        session_id=$(printf '%s\n' "$filtered_sessions" | jq -r '.[0].id')
        local user_id
        user_id=$(printf '%s\n' "$filtered_sessions" | jq -r '.[0].user_id')

        echo "    [sync-devices] ✅ MATCH: Device $device_id → user_id=$user_id (desempate por IP RustDesk)"

        local mesh_user_response
        mesh_user_response=$(supabase_query "/mesh_users?auth_user_id=eq.${user_id}&select=id,mesh_username")
        local mesh_count
        mesh_count=$(printf '%s\n' "$mesh_user_response" | jq -r 'length' 2>/dev/null || echo "0")

        if [ "$mesh_count" -eq 0 ]; then
          echo "    [sync-devices] ⚠️  mesh_user não encontrado para user_id=$user_id, a atribuir ao admin" >&2
          local admin_payload
          admin_payload=$(jq -n \
            --arg owner "$ADMIN_MESH_USER_ID" \
            --arg mesh_username "$ADMIN_MESH_USERNAME" \
            '{
              owner: $owner,
              mesh_username: ($mesh_username | select(length > 0))
            }')
          update_device "$device_id" "$admin_payload" >/dev/null 2>&1 || true
          assigned_to_admin=$((assigned_to_admin + 1))
          continue
        fi

        local owner_id
        owner_id=$(printf '%s\n' "$mesh_user_response" | jq -r '.[0].id')
        local mesh_username
        mesh_username=$(printf '%s\n' "$mesh_user_response" | jq -r '.[0].mesh_username // empty')

        local update_payload
        update_payload=$(jq -n \
          --arg owner "$owner_id" \
          --arg mesh_username "$mesh_username" \
          '{
            owner: $owner,
            mesh_username: ($mesh_username | select(length > 0))
          }')

        if update_device "$device_id" "$update_payload" >/dev/null 2>&1; then
          echo "    [sync-devices] ✅ Device atualizado com owner=$owner_id (via IP)"
          matched_count=$((matched_count + 1))

          local update_session_payload
          update_session_payload=$(jq -n \
            --arg device_id "$device_id" \
            --arg now "$now" \
            '{
              status: "completed",
              matched_device_id: $device_id,
              matched_at: $now
            }')

          curl -sS --fail-with-body \
            -X PATCH \
            -H "apikey: $API_KEY" \
            -H "Authorization: Bearer $AUTH_BEARER" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=representation" \
            -d "$update_session_payload" \
            "${REST_URL}/device_registration_sessions?id=eq.${session_id}" >/dev/null 2>&1 || true
        else
          echo "    [sync-devices] ❌ Erro ao atualizar device com owner=$owner_id (via IP)" >&2
        fi
        continue
      else
        echo "    [sync-devices] ⚠️  Filtro por IP não produziu 1 sessão única (count=$filtered_count); a usar fallback admin" >&2
      fi
    else
      echo "    [sync-devices] ℹ️  Não há rustdesk_ip para usar como critério de desempate; a usar fallback admin" >&2
    fi

    # Se chegámos aqui, continuamos a considerar caso ambíguo: múltiplos utilizadores e IP não resolveu
    echo "    [sync-devices] ⚠️  ${sess_count} sessões candidatas na janela [${window_start}, ${last_seen}] para $device_id"
    echo "    [sync-devices] ➡️  A atribuir device ao admin canónico (multiple_sessions)"

    # Notificar ambiguidade com lista de candidatos
    local notify_payload
    notify_payload=$(printf '%s\n' "$sessions" | jq \
      --arg device_id "$device_id" \
      --arg rustdesk_ip "$rustdesk_ip" \
      --arg reason "multiple_sessions" \
      '{
        device_id: $device_id,
        rustdesk_ip: (if ($rustdesk_ip | length) > 0 then $rustdesk_ip else null end),
        reason: $reason,
        candidates: [ .[] | {
          session_id: .id,
          user_id: .user_id,
          clicked_at: .clicked_at,
          ip_address: .ip_address
        }]
      }')
    curl -sS -X POST \
      -H "Authorization: Bearer $AUTH_BEARER" \
      -H "apikey: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$notify_payload" \
      "${SUPABASE_URL}/functions/v1/notify-ambiguous-device" >/dev/null 2>&1 || echo "    [sync-devices] ⚠️  Falha ao chamar notify-ambiguous-device (multiple_sessions)" >&2

    local admin_payload
    admin_payload=$(jq -n \
      --arg owner "$ADMIN_MESH_USER_ID" \
      --arg mesh_username "$ADMIN_MESH_USERNAME" \
      '{
        owner: $owner,
        mesh_username: ($mesh_username | select(length > 0))
      }')

    update_device "$device_id" "$admin_payload" >/dev/null 2>&1 || true
    assigned_to_admin=$((assigned_to_admin + 1))
  done < <(printf '%s\n' "$orphan_devices" | jq -c '.[]')

  echo "[sync-devices] ✅ Matching completo: $matched_count associados a utilizadores, $assigned_to_admin atribuídos ao admin"
}

# ====================================================================
# SYNC MESHCENTRAL (COMPATIBILIDADE)
# ====================================================================

sync_meshcentral_devices() {
  if [ ! -f "$CONFIG_PATH" ]; then
    echo "[sync-devices] ⚠️  android-users.json não encontrado"
    return 0
  fi
  
  MESH_FILES_ROOT=$(jq -r '.meshFilesRoot // "/opt/meshcentral/meshcentral-files"' "$CONFIG_PATH")
  ROOT_FOLDER=$(jq -r '.rootFolder // "ANDROID"' "$CONFIG_PATH")
  BASE_DIR="${MESH_FILES_ROOT%/}/${ROOT_FOLDER:+/$ROOT_FOLDER}"

  echo "[sync-devices] 📂 Base MeshCentral: $BASE_DIR"
  echo "[sync-devices] 🔄 Sync de devices.json..."

  jq -c '.users[]' "$CONFIG_PATH" | while read -r USER; do
    meshUser=$(echo "$USER" | jq -r '.meshUser // empty')
    folderName=$(echo "$USER" | jq -r '.folderName // empty')

    if [ -z "$meshUser" ] || [ -z "$folderName" ]; then
      continue
    fi

    USER_DIR="$BASE_DIR/$folderName"
    DEVICES_JSON="$USER_DIR/devices.json"

    echo "[sync-devices] 👤 User $meshUser → $USER_DIR"

    if [ ! -f "$DEVICES_JSON" ]; then
      echo "  [sync-devices] ℹ️  Sem devices.json"
      continue
    fi

    devices_json_content=$(jq -c '.devices[]?' "$DEVICES_JSON")
    if [ -z "$devices_json_content" ]; then
      continue
    fi

    echo "$devices_json_content" | while read -r DEV; do
      deviceId=$(echo "$DEV" | jq -r '.device_id // empty')
      friendlyName=$(echo "$DEV" | jq -r '.friendly_name // .device_name // .name // empty')
      lastSeen=$(echo "$DEV" | jq -r '.last_seen // .last_seen_at // .lastseen // empty')

      if [ -z "$deviceId" ]; then
        continue
      fi

      echo "  [sync-devices] 🔄 Device $deviceId"
      
      local mesh_user_response
      mesh_user_response=$(supabase_query "/mesh_users?mesh_username=eq.${meshUser}&select=id")
      local owner_id
      owner_id=$(echo "$mesh_user_response" | jq -r '.[0].id // "null"')
      
      if [ "$owner_id" = "null" ]; then
        echo "    [sync-devices] ⚠️  Mesh user não encontrado: $meshUser"
        continue
      fi

      if upsert_device "$deviceId" "$owner_id" "$meshUser" "$friendlyName" "$lastSeen" "null" >/dev/null 2>&1; then
        echo "    [sync-devices] ✅ Device sincronizado"
      else
        echo "    [sync-devices] ⚠️  Erro ao sincronizar" >&2
      fi
    done
  done
}

# ====================================================================
# EXECUÇÃO PRINCIPAL
# ====================================================================

echo "[sync-devices] 🚀 Iniciando sincronização..."
echo ""

# Resolver admin canónico antes de qualquer operação
init_admin_mesh_user
echo ""

# 1. Sync RustDesk (cria órfãos)
sync_rustdesk_devices
echo ""

# 2. Matching temporal
process_temporal_matching
echo ""

# 3. Sync MeshCentral (compatibilidade)
sync_meshcentral_devices
echo ""

echo "[sync-devices] ✅ Sincronização completa!"