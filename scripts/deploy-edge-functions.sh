#!/bin/bash
# scripts/deploy-edge-functions.sh
# Batch deployment of all Edge Functions with validation
# Usage: ./scripts/deploy-edge-functions.sh [--dry-run] [--function <name>]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
FUNCTIONS_DIR="supabase/functions"
LOG_DIR="logs/edge-functions"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/deploy-$TIMESTAMP.log"
DRY_RUN=false
SPECIFIC_FUNCTION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --function)
      SPECIFIC_FUNCTION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dry-run] [--function <name>]"
      exit 1
      ;;
  esac
done

# Create log directory
mkdir -p "$LOG_DIR"

# Logging functions
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE"
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

# Validate prerequisites
validate_prerequisites() {
  log_info "Validating prerequisites..."
  
  if ! command -v supabase &> /dev/null; then
    log_error "Supabase CLI not found"
    exit 2
  fi
  
  if ! supabase projects list &> /dev/null; then
    log_error "Not logged in to Supabase CLI"
    exit 2
  fi
  
  if [ -z "$PROJECT_REF" ]; then
    log_error "SUPABASE_PROJECT_REF not set"
    exit 2
  fi
  
  if [ ! -d "$FUNCTIONS_DIR" ]; then
    log_error "Functions directory not found: $FUNCTIONS_DIR"
    exit 2
  fi
  
  log_success "Prerequisites validated"
}

# Validate function code
validate_function() {
  local func_name=$1
  local func_dir="$FUNCTIONS_DIR/$func_name"
  
  log_info "Validating $func_name..."
  
  # Check if index.ts exists
  if [ ! -f "$func_dir/index.ts" ]; then
    log_error "$func_name: index.ts not found"
    return 1
  fi
  
  # Check for basic Deno serve import
  if ! grep -q "serve" "$func_dir/index.ts"; then
    log_warning "$func_name: No 'serve' import found (might be intentional)"
  fi
  
  # Check for CORS headers
  if ! grep -q "Access-Control-Allow-Origin" "$func_dir/index.ts"; then
    log_warning "$func_name: No CORS headers detected"
  fi
  
  log_success "$func_name: Validation passed"
  return 0
}

# Deploy single function
deploy_function() {
  local func_name=$1
  
  log_info "Deploying $func_name..."
  
  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY RUN: Would deploy $func_name"
    return 0
  fi
  
  # Deploy function
  if supabase functions deploy "$func_name" --project-ref "$PROJECT_REF" 2>&1 | tee -a "$LOG_FILE"; then
    log_success "$func_name: Deployed successfully"
    return 0
  else
    log_error "$func_name: Deployment failed"
    return 1
  fi
}

# Get list of functions to deploy
get_functions_to_deploy() {
  if [ -n "$SPECIFIC_FUNCTION" ]; then
    echo "$SPECIFIC_FUNCTION"
  else
    for dir in "$FUNCTIONS_DIR"/*/ ; do
      if [ -d "$dir" ]; then
        func_name=$(basename "$dir")
        if [[ ! "$func_name" =~ ^\. ]] && [ "$func_name" != ".temp" ]; then
          if [ -f "$dir/index.ts" ]; then
            echo "$func_name"
          fi
        fi
      fi
    done
  fi
}

# Main deployment
main() {
  log "========================================="
  log "Edge Function Deployment"
  log "Project Ref: $PROJECT_REF"
  if [ "$DRY_RUN" = true ]; then
    log "Mode: DRY RUN"
  fi
  if [ -n "$SPECIFIC_FUNCTION" ]; then
    log "Target: $SPECIFIC_FUNCTION"
  else
    log "Target: ALL functions"
  fi
  log "========================================="
  echo ""
  
  validate_prerequisites
  echo ""
  
  local functions=$(get_functions_to_deploy)
  local total_count=$(echo "$functions" | wc -l | tr -d ' ')
  local deployed_count=0
  local failed_count=0
  local failed_functions=()
  
  log_info "Found $total_count function(s) to deploy"
  echo ""
  
  for func in $functions; do
    if validate_function "$func"; then
      if deploy_function "$func"; then
        ((deployed_count++))
      else
        ((failed_count++))
        failed_functions+=("$func")
      fi
    else
      ((failed_count++))
      failed_functions+=("$func")
    fi
    echo ""
  done
  
  log "========================================="
  log "Deployment Summary"
  log "========================================="
  log "Total:    $total_count"
  log "Success:  $deployed_count"
  log "Failed:   $failed_count"
  
  if [ $failed_count -gt 0 ]; then
    echo ""
    log_error "Failed functions:"
    for func in "${failed_functions[@]}"; do
      log_error "  - $func"
    done
    echo ""
    log_error "Deployment completed with errors"
    exit 1
  else
    echo ""
    log_success "All functions deployed successfully! 🎉"
    
    if [ "$DRY_RUN" = false ]; then
      echo ""
      log_info "Running verification..."
      if ./scripts/verify-edge-functions.sh; then
        log_success "Verification passed"
      else
        log_warning "Verification found issues (but deployment succeeded)"
      fi
    fi
    
    exit 0
  fi
}

# Run main
main "$@"