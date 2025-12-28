#!/usr/bin/env bash
#
# diagnose-provision-claim.sh
#
# Diagnóstico end-to-end do fluxo /api/provision/claim (VALIDATE CODE na app Android).
#
# - Recolhe:
#   * Versão do sistema, hostname, data/hora
#   * Serviços relevantes (systemd)
#   * Configuração NGINX para rustdesk.bwb.pt
#   * Últimas entradas de access/error log relacionadas com /api/provision/claim
#   * Teste HTTP real ao endpoint /api/provision/claim com o código fornecido
#
# Saída:
#   Um único ficheiro de log em logs/diagnostics/ com todos os resultados.
#
# Uso:
#   bash scripts/diagnose-provision-claim.sh 3126
#   # se não passar código, usa 3126 como default (útil para reproduzir o caso do screenshot)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CODE="${1:-3126}"

LOG_ROOT="${REPO_ROOT}/logs/diagnostics"
mkdir -p "${LOG_ROOT}"

TS="$(date -u +"%Y%m%d-%H%M%S")"
LOG_FILE="${LOG_ROOT}/provision-claim-${TS}.log"

# Helper para escrever no log e no stdout
log() {
  local msg="$1"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

log "============================================================"
log "Provision Claim Diagnostic - /api/provision/claim"
log "Timestamp (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "Host: $(hostname -f 2>/dev/null || hostname)"
log "Repository root: ${REPO_ROOT}"
log "Code under test: ${CODE}"
log "============================================================"
log ""

# 1) Informação básica do sistema
log "### 1. System Information"
{
  echo "uname -a:"
  uname -a 2>&1
  echo
  echo "lsb_release -a (if available):"
  if command -v lsb_release >/dev/null 2>&1; then
    lsb_release -a 2>&1
  else
    echo "lsb_release not installed"
  fi
  echo
  echo "Current user: $(whoami)"
  echo "Current working directory: $(pwd)"
} >> "${LOG_FILE}" 2>&1
log ""

# 2) Serviços systemd relevantes
log "### 2. systemd services matching rustdesk/frontend/api/node/next"
{
  systemctl list-units --type=service | grep -iE "rustdesk|frontend|api|node|next" || echo "No matching services found."
} >> "${LOG_FILE}" 2>&1
log ""

# Tentamos inferir o nome canónico do serviço frontend
FRONTEND_SERVICE=""
if systemctl list-units --type=service | grep -q "rustdesk-frontend.service"; then
  FRONTEND_SERVICE="rustdesk-frontend.service"
elif systemctl list-units --type=service | grep -q "rustdeskweb.service"; then
  FRONTEND_SERVICE="rustdeskweb.service"
fi

if [[ -n "${FRONTEND_SERVICE}" ]]; then
  log "### 2.1 systemd status for ${FRONTEND_SERVICE}"
  {
    systemctl status "${FRONTEND_SERVICE}" --no-pager 2>&1 || true
  } >> "${LOG_FILE}" 2>&1
  log ""

  log "### 2.2 Last 300 journal entries for ${FRONTEND_SERVICE}"
  {
    sudo journalctl -u "${FRONTEND_SERVICE}" -n 300 --no-pager 2>&1 || true
  } >> "${LOG_FILE}" 2>&1
  log ""
else
  log "### 2.1 No specific frontend service detected (rustdesk-frontend.service / rustdeskweb.service not found)"
  log ""
fi

# 3) Configuração NGINX e vhost rustdesk.bwb.pt
log "### 3. NGINX configuration for rustdesk.bwb.pt"
{
  echo "nginx -T | grep -n 'server_name rustdesk.bwb.pt'"
  echo "------------------------------------------------------------"
  if command -v nginx >/dev/null 2>&1; then
    sudo nginx -T 2>/dev/null | grep -n "server_name rustdesk.bwb.pt" || echo "server_name rustdesk.bwb.pt not found in nginx -T output"
  else
    echo "nginx binary not found on PATH."
  fi
} >> "${LOG_FILE}" 2>&1
log ""

# 4) Últimas entradas de logs NGINX relacionadas com /api/provision/claim
log "### 4. NGINX access/error logs around /api/provision/claim"
{
  ACCESS_LOG="/var/log/nginx/access.log"
  ERROR_LOG="/var/log/nginx/error.log"

  echo "Access log path: ${ACCESS_LOG}"
  if [[ -f "${ACCESS_LOG}" ]]; then
    echo
    echo "Last 50 lines containing '/api/provision/claim' in access.log:"
    echo "------------------------------------------------------------"
    sudo grep "/api/provision/claim" "${ACCESS_LOG}" | tail -n 50 || echo "No matching lines for /api/provision/claim."
    echo
    echo "Last 200 lines from access.log:"
    echo "------------------------------------------------------------"
    sudo tail -n 200 "${ACCESS_LOG}" || true
  else
    echo "access.log not found at ${ACCESS_LOG}"
  fi

  echo
  echo "Error log path: ${ERROR_LOG}"
  if [[ -f "${ERROR_LOG}" ]]; then
    echo
    echo "Last 50 lines containing '/api/provision/claim' in error.log:"
    echo "------------------------------------------------------------"
    sudo grep "/api/provision/claim" "${ERROR_LOG}" | tail -n 50 || echo "No matching lines for /api/provision/claim."
    echo
    echo "Last 200 lines from error.log:"
    echo "------------------------------------------------------------"
    sudo tail -n 200 "${ERROR_LOG}" || true
  else
    echo "error.log not found at ${ERROR_LOG}"
  fi
} >> "${LOG_FILE}" 2>&1
log ""

# 5) Teste HTTP directo ao endpoint /api/provision/claim
log "### 5. HTTP test to https://rustdesk.bwb.pt/api/provision/claim"
TMP_CURL_OUT="$(mktemp)"
{
  echo "curl command:"
  echo "------------------------------------------------------------"
  echo "curl -vk 'https://rustdesk.bwb.pt/api/provision/claim' \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"code\":\"${CODE}\",\"device_hint\":null,\"nonce\":null}'"
  echo
  echo "curl output (headers + body):"
  echo "------------------------------------------------------------"
} >> "${LOG_FILE}"

# Executar curl
if command -v curl >/dev/null 2>&1; then
  # Guardar saída completa (stderr+stdout) e também status simplificado
  {
    curl -vk 'https://rustdesk.bwb.pt/api/provision/claim' \
      -H 'Content-Type: application/json' \
      -d "{\"code\":\"${CODE}\",\"device_hint\":null,\"nonce\":null}" 2>&1 | tee "${TMP_CURL_OUT}"
  } >> "${LOG_FILE}" 2>&1 || true

  # Extrair HTTP status line principal (se possível)
  HTTP_STATUS_LINE="$(grep -m1 '^< HTTP/' "${TMP_CURL_OUT}" || true)"
  echo >> "${LOG_FILE}"
  echo "Detected HTTP status line from curl:" >> "${LOG_FILE}"
  echo "------------------------------------------------------------" >> "${LOG_FILE}"
  echo "${HTTP_STATUS_LINE:-N/A}" >> "${LOG_FILE}"
else
  echo "curl is not installed." >> "${LOG_FILE}"
fi
rm -f "${TMP_CURL_OUT}" || true
log ""

# 6) Resumo final
log "============================================================"
log "Diagnostic finished."
log "Log file generated at:"
log "  ${LOG_FILE}"
log "You can now download or inspect this file and share it for analysis."
log "============================================================"