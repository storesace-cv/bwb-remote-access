#!/bin/bash
# scripts/verify-edge-functions.sh
# Verifies that all local Edge Functions are deployed to Supabase
# Exit codes: 0 = all deployed, 1 = missing functions, 2 = configuration error

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
FUNCTIONS_DIR="supabase/functions"
LOG_DIR="logs/edge-functions"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/verify-$TIMESTAMP.log"

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

# Validate prerequisites
validate_prerequisites() {
  log "Validating prerequisites..."
  
  # Check if supabase CLI is installed
  if ! command -v supabase &> /dev/null; then
    log_error "Supabase CLI not found. Install with: npm install -g supabase"
    exit 2
  fi
  
  # Check if logged in
  if ! supabase projects list &> /dev/null; then
    log_error "Not logged in to Supabase CLI. Run: supabase login"
    exit 2
  fi
  
  # Check if project ref is set
  if [ -z "$PROJECT_REF" ]; then
    log_error "SUPABASE_PROJECT_REF environment variable not set"
    log_error "Get your project ref from: https://supabase.com/dashboard/project/_/settings/general"
    exit 2
  fi
  
  # Check if functions directory exists
  if [ ! -d "$FUNCTIONS_DIR" ]; then
    log_error "Functions directory not found: $FUNCTIONS_DIR"
    exit 2
  fi
  
  log_success "Prerequisites validated"
}

# Get list of local Edge Functions
get_local_functions() {
  log "Scanning local Edge Functions..."
  
  local functions=()
  for dir in "$FUNCTIONS_DIR"/*/ ; do
    if [ -d "$dir" ]; then
      func_name=$(basename "$dir")
      # Skip hidden directories and .temp
      if [[ ! "$func_name" =~ ^\. ]] && [ "$func_name" != ".temp" ]; then
        # Check if index.ts exists
        if [ -f "$dir/index.ts" ]; then
          functions+=("$func_name")
        fi
      fi
    fi
  done
  
  echo "${functions[@]}"
}

# Get list of deployed Edge Functions
get_deployed_functions() {
  log "Fetching deployed Edge Functions from Supabase..."
  
  # Use supabase CLI to list functions
  # Format: function_name version status
  local deployed=$(supabase functions list --project-ref "$PROJECT_REF" 2>/dev/null | tail -n +2 | awk '{print $1}')
  
  if [ -z "$deployed" ]; then
    log_warning "No deployed functions found or unable to fetch list"
    echo ""
  else
    echo "$deployed"
  fi
}

# Compare local vs deployed functions
compare_functions() {
  local local_funcs=($1)
  local deployed_funcs=$2
  
  local missing_functions=()
  local deployed_count=0
  local total_count=${#local_funcs[@]}
  
  log "Comparing local vs deployed functions..."
  log "Total local functions: $total_count"
  
  for func in "${local_funcs[@]}"; do
    if echo "$deployed_funcs" | grep -q "^$func$"; then
      log_success "✓ $func (deployed)"
      ((deployed_count++))
    else
      log_error "✗ $func (NOT DEPLOYED)"
      missing_functions+=("$func")
    fi
  done
  
  echo ""
  log "Summary:"
  log "  Deployed: $deployed_count/$total_count"
  log "  Missing:  ${#missing_functions[@]}"
  
  if [ ${#missing_functions[@]} -gt 0 ]; then
    echo ""
    log_error "Missing Edge Functions (${#missing_functions[@]}):"
    for func in "${missing_functions[@]}"; do
      log_error "  - $func"
    done
    echo ""
    log "To deploy missing functions, run:"
    for func in "${missing_functions[@]}"; do
      log "  supabase functions deploy $func --project-ref $PROJECT_REF"
    done
    return 1
  else
    echo ""
    log_success "All Edge Functions are deployed! 🎉"
    return 0
  fi
}

# Main execution
main() {
  log "========================================="
  log "Edge Function Verification"
  log "Project Ref: $PROJECT_REF"
  log "========================================="
  echo ""
  
  validate_prerequisites
  echo ""
  
  local_functions=$(get_local_functions)
  echo ""
  
  deployed_functions=$(get_deployed_functions)
  echo ""
  
  if compare_functions "$local_functions" "$deployed_functions"; then
    log_success "Verification complete: All functions deployed"
    exit 0
  else
    log_error "Verification failed: Missing functions detected"
    exit 1
  fi
}

# Run main
main "$@"