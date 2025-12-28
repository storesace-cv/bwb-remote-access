#!/usr/bin/env bash
#
# Diagnóstico completo da infraestrutura de sync MeshCentral → Supabase
#
# Este script testa cada componente isoladamente para identificar o problema real.
#
# Uso: bash scripts/diagnose-mesh-sync.sh
#
set -euo pipefail

MESH_DB="${MESH_DB:-/opt/meshcentral/meshcentral-data/meshcentral.db}"
ENV_FILE="${ENV_FILE:-/opt/rustdesk-frontend/.env.local}"
TMP_DB="/tmp/meshcentral.db.snapshot.diagnostic"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════"
echo "  MeshCentral → Supabase Sync - Diagnóstico Completo"
echo "════════════════════════════════════════════════════════════"
echo ""

# ──────────────────────────────────────────────────────────────
# 1. Verificar pré-requisitos (binários)
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[1/10] Verificando binários necessários...${NC}"

MISSING_BINARIES=()

for cmd in bash node curl jq; do
  if command -v "$cmd" >/dev/null 2>&1; then
    VERSION=$("$cmd" --version 2>&1 | head -1 || echo "unknown")
    echo -e "  ${GREEN}✓${NC} $cmd instalado: $VERSION"
  else
    echo -e "  ${RED}✗${NC} $cmd NÃO instalado"
    MISSING_BINARIES+=("$cmd")
  fi
done

if [ ${#MISSING_BINARIES[@]} -gt 0 ]; then
  echo -e "${RED}ERRO: Binários em falta: ${MISSING_BINARIES[*]}${NC}"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 2. Verificar ficheiro .env.local
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[2/10] Verificando .env.local...${NC}"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "  ${RED}✗${NC} Ficheiro não encontrado: $ENV_FILE"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Ficheiro existe: $ENV_FILE"

# Carregar variáveis
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

# Extrair SUPABASE_URL
if [ -z "${SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
fi

# Validar variáveis críticas
if [ -z "${SUPABASE_URL:-}" ]; then
  echo -e "  ${RED}✗${NC} SUPABASE_URL não definido"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} SUPABASE_URL: ${SUPABASE_URL:0:40}..."

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo -e "  ${RED}✗${NC} SUPABASE_SERVICE_ROLE_KEY não definido"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:20}... (${#SUPABASE_SERVICE_ROLE_KEY} chars)"

REST_URL="${SUPABASE_URL%/}/rest/v1"
API_KEY="${SUPABASE_ANON_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"
echo ""

# ──────────────────────────────────────────────────────────────
# 3. Testar conectividade Supabase
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[3/10] Testando conectividade Supabase...${NC}"

# CRITICAL FIX: Use apikey header only (Opção A - standard Supabase pattern)
CURL_RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "${REST_URL}/mesh_users?limit=1" 2>&1 || echo -e "\n000")

HTTP_CODE=$(echo "$CURL_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$CURL_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}✓${NC} Conectividade OK (HTTP $HTTP_CODE)"
  echo "  Resposta: ${RESPONSE_BODY:0:80}..."
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "  ${RED}✗${NC} Erro de rede ao conectar a Supabase"
  echo "  Detalhes: $RESPONSE_BODY"
  exit 1
else
  echo -e "  ${RED}✗${NC} HTTP $HTTP_CODE (erro de conectividade/permissões)"
  echo "  Resposta: $RESPONSE_BODY"
  echo ""
  echo "  Possíveis causas:"
  echo "    - SUPABASE_SERVICE_ROLE_KEY incorrecta"
  echo "    - Supabase project URL incorrecta"
  echo "    - Firewall a bloquear conexão"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 4. Verificar base de dados MeshCentral
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[4/10] Verificando base de dados MeshCentral...${NC}"

if [ ! -f "$MESH_DB" ]; then
  echo -e "  ${RED}✗${NC} Base de dados não encontrada: $MESH_DB"
  exit 1
fi

DB_SIZE=$(stat -f%z "$MESH_DB" 2>/dev/null || stat -c%s "$MESH_DB" 2>/dev/null || echo "unknown")
echo -e "  ${GREEN}✓${NC} Ficheiro existe: $MESH_DB"
echo "  Tamanho: $DB_SIZE bytes"

# Verificar permissões de leitura
if [ ! -r "$MESH_DB" ]; then
  echo -e "  ${RED}✗${NC} Sem permissões de leitura para $MESH_DB"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Permissões de leitura: OK"
echo ""

# ──────────────────────────────────────────────────────────────
# 5. Criar snapshot da DB
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[5/10] Criando snapshot da base de dados...${NC}"

cp "$MESH_DB" "$TMP_DB" 2>&1 || {
  echo -e "  ${RED}✗${NC} Erro ao criar snapshot"
  exit 1
}

SNAPSHOT_SIZE=$(stat -f%z "$TMP_DB" 2>/dev/null || stat -c%s "$TMP_DB" 2>/dev/null || echo "unknown")
echo -e "  ${GREEN}✓${NC} Snapshot criado: $TMP_DB"
echo "  Tamanho: $SNAPSHOT_SIZE bytes"
echo ""

# ──────────────────────────────────────────────────────────────
# 6. Analisar conteúdo da DB (primeiras 10 linhas)
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[6/10] Analisando conteúdo da base de dados...${NC}"

TOTAL_LINES=$(wc -l < "$TMP_DB" || echo "0")
echo "  Total de linhas: $TOTAL_LINES"

if [ "$TOTAL_LINES" -eq 0 ]; then
  echo -e "  ${RED}✗${NC} Base de dados vazia!"
  exit 1
fi

USER_LINES=$(grep -c '^{"_id":"user/' "$TMP_DB" 2>/dev/null || echo "0")
DOMAIN_LINES=$(grep -c '^{"_id":"domain/' "$TMP_DB" 2>/dev/null || echo "0")

echo "  Linhas com user/: $USER_LINES"
echo "  Linhas com domain/: $DOMAIN_LINES"

if [ "$USER_LINES" -eq 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} Nenhuma linha com 'user/' encontrada!"
  echo "  Primeiras 5 linhas da DB:"
  head -5 "$TMP_DB" | while read -r line; do
    echo "    ${line:0:100}..."
  done
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 7. Testar parsing Node.js com debug verbose
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[7/10] Testando pipeline Node.js com debug verbose...${NC}"

# Capture stdout and stderr separately
NODE_STDERR_FILE=$(mktemp)
NODE_STDOUT_FILE=$(mktemp)

MESH_DB_SNAPSHOT="$TMP_DB" node 2>"$NODE_STDERR_FILE" >"$NODE_STDOUT_FILE" <<'NODE_SCRIPT'
const fs = require("fs");
const readline = require("readline");

const dbPath = process.env.MESH_DB_SNAPSHOT;
console.error(`[DEBUG] dbPath = ${dbPath}`);

if (!dbPath) {
  console.error("[ERROR] MESH_DB_SNAPSHOT not set");
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error(`[ERROR] File does not exist: ${dbPath}`);
  process.exit(1);
}

const stats = fs.statSync(dbPath);
console.error(`[DEBUG] File size: ${stats.size} bytes`);

const input = fs.createReadStream(dbPath, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

const lastById = new Map();
const domainsByKey = new Map();
let lineCount = 0;
let userCount = 0;
let domainCount = 0;

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    console.error(`[WARN] Failed to parse line ${lineCount}: ${e.message}`);
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
      username: tail.slice(1)
    };
  }
  const firstSlash = tail.indexOf("/");
  if (firstSlash === -1) {
    return {
      domainKey: "",
      username: tail
    };
  }
  return {
    domainKey: tail.slice(0, firstSlash),
    username: tail.slice(firstSlash + 1)
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
        domain: domainField
      });
    }
  }

  console.error(`[DEBUG] Processed ${lineCount} lines`);
  console.error(`[DEBUG] Found ${userCount} user records`);
  console.error(`[DEBUG] Found ${domainCount} domain records`);
  console.error(`[DEBUG] lastById.size = ${lastById.size}`);

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
      mesh_username: username
    };

    const domainInfo = domainsByKey.get(domainKey) || null;
    meshUser.domain_dns = domainInfo && domainInfo.dns ? domainInfo.dns : null;
    meshUser.domain =
      typeof rec.domain === "string" && rec.domain.length > 0
        ? rec.domain
        : domainInfo && typeof domainInfo.domain === "string"
        ? domainInfo.domain
        : "";

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

    users.push(meshUser);
  }

  console.error(`[DEBUG] Generated ${users.length} user objects`);

  if (users.length === 0) {
    console.error("[ERROR] No users generated from DB!");
    process.exit(1);
  }

  // Output JSON to stdout (para captura)
  process.stdout.write(JSON.stringify(users));
})().catch((err) => {
  console.error("[ERROR] Node pipeline failed:", err);
  process.exit(1);
});
NODE_SCRIPT

NODE_EXIT=$?

echo "  Exit code: $NODE_EXIT"

if [ $NODE_EXIT -ne 0 ]; then
  echo -e "  ${RED}✗${NC} Node.js pipeline falhou"
  echo "  Debug output (stderr):"
  cat "$NODE_STDERR_FILE" | sed 's/^/    /'
  rm -f "$NODE_STDERR_FILE" "$NODE_STDOUT_FILE"
  exit 1
fi

# Read stderr and stdout
NODE_STDERR=$(cat "$NODE_STDERR_FILE")
NODE_JSON=$(cat "$NODE_STDOUT_FILE")

echo "  Debug output (stderr):"
echo "$NODE_STDERR" | sed 's/^/    /'

# CRITICAL FIX: Properly validate JSON output
if [ -z "$NODE_JSON" ]; then
  echo -e "  ${RED}✗${NC} JSON output vazio (stdout vazio)!"
  rm -f "$NODE_STDERR_FILE" "$NODE_STDOUT_FILE"
  exit 1
fi

# Validate JSON structure
if ! echo "$NODE_JSON" | jq empty 2>/dev/null; then
  echo -e "  ${RED}✗${NC} JSON output inválido!"
  echo "  Output recebido: ${NODE_JSON:0:200}..."
  rm -f "$NODE_STDERR_FILE" "$NODE_STDOUT_FILE"
  exit 1
fi

USER_COUNT=$(echo "$NODE_JSON" | jq 'length' 2>/dev/null || echo "0")
echo -e "  ${GREEN}✓${NC} JSON gerado com sucesso"
echo "  Utilizadores no JSON: $USER_COUNT"

# Cleanup temp files
rm -f "$NODE_STDERR_FILE" "$NODE_STDOUT_FILE"
echo ""

# ──────────────────────────────────────────────────────────────
# 8. Validar JSON gerado
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[8/10] Validando estrutura do JSON...${NC}"

FIRST_USER=$(echo "$NODE_JSON" | jq '.[0]' 2>/dev/null || echo "{}")

if [ "$FIRST_USER" = "{}" ]; then
  echo -e "  ${RED}✗${NC} Não foi possível extrair primeiro utilizador"
  exit 1
fi

echo "  Primeiro utilizador:"
echo "$FIRST_USER" | jq '.' | sed 's/^/    /'

# Validar campos obrigatórios
REQUIRED_FIELDS=("external_user_id" "domain_key" "mesh_username" "role" "source")
for field in "${REQUIRED_FIELDS[@]}"; do
  VALUE=$(echo "$FIRST_USER" | jq -r ".$field" 2>/dev/null || echo "null")
  if [ "$VALUE" = "null" ] || [ -z "$VALUE" ]; then
    echo -e "  ${RED}✗${NC} Campo obrigatório ausente: $field"
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} Campo $field: $VALUE"
done
echo ""

# ──────────────────────────────────────────────────────────────
# 9. Testar operação de PATCH (marcar como disabled)
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[9/10] Testando operação PATCH no Supabase...${NC}"

# CRITICAL FIX: Use correct headers (apikey only for service_role)
PATCH_RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X PATCH \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"disabled": true}' \
  "${REST_URL}/mesh_users?source=eq.meshcentral&limit=1" 2>&1 || echo -e "\n000")

PATCH_HTTP_CODE=$(echo "$PATCH_RESPONSE" | tail -1)
PATCH_BODY=$(echo "$PATCH_RESPONSE" | sed '$d')

if [ "$PATCH_HTTP_CODE" = "204" ] || [ "$PATCH_HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}✓${NC} PATCH bem sucedido (HTTP $PATCH_HTTP_CODE)"
elif [ "$PATCH_HTTP_CODE" = "000" ]; then
  echo -e "  ${RED}✗${NC} Erro de rede ao fazer PATCH"
  echo "  Detalhes: $PATCH_BODY"
  exit 1
else
  echo -e "  ${RED}✗${NC} PATCH falhou (HTTP $PATCH_HTTP_CODE)"
  echo "  Resposta: $PATCH_BODY"
  echo ""
  echo "  Possíveis causas:"
  echo "    - SUPABASE_SERVICE_ROLE_KEY incorrecta"
  echo "    - RLS policies a bloquear operação"
  echo "    - Coluna 'source' não existe na tabela mesh_users"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 10. Testar operação de POST (upsert)
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}[10/10] Testando operação POST (upsert)...${NC}"

# Usar apenas o primeiro user do JSON para teste
TEST_USER=$(echo "$NODE_JSON" | jq '[.[0]]' 2>/dev/null)

# CRITICAL FIX: Use correct headers (apikey only for service_role)
POST_RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  -d "$TEST_USER" \
  "${REST_URL}/mesh_users?on_conflict=external_user_id" 2>&1 || echo -e "\n000")

POST_HTTP_CODE=$(echo "$POST_RESPONSE" | tail -1)
POST_BODY=$(echo "$POST_RESPONSE" | sed '$d')

if [ "$POST_HTTP_CODE" = "201" ] || [ "$POST_HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}✓${NC} POST bem sucedido (HTTP $POST_HTTP_CODE)"
elif [ "$POST_HTTP_CODE" = "000" ]; then
  echo -e "  ${RED}✗${NC} Erro de rede ao fazer POST"
  echo "  Detalhes: $POST_BODY"
  exit 1
else
  echo -e "  ${RED}✗${NC} POST falhou (HTTP $POST_HTTP_CODE)"
  echo "  Resposta: $POST_BODY"
  echo ""
  echo "  Possíveis causas:"
  echo "    - SUPABASE_SERVICE_ROLE_KEY incorrecta"
  echo "    - RLS policies a bloquear operação"
  echo "    - Constraint violation (external_user_id já existe)"
  echo "    - Schema mismatch (colunas em falta na tabela)"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────────
# RESUMO FINAL
# ──────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Diagnóstico completo: TODOS OS TESTES PASSARAM${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "A infraestrutura de sync está funcional. Se o serviço systemd"
echo "ainda falha, o problema está na execução do script ou nas"
echo "permissões do utilizador do serviço."
echo ""
echo "Próximos passos:"
echo "  1. Verificar logs do systemd: journalctl -u meshcentral-supabase-sync.service -n 50"
echo "  2. Executar o script manualmente: bash /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh"
echo "  3. Verificar permissões: ls -la /opt/rustdesk-frontend/.env.local"
echo ""

# Cleanup
rm -f "$TMP_DB"