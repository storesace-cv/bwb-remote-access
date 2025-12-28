#!/bin/bash

# Fix User Management Edge Function Issues
# Usage: ./scripts/fix-user-management.sh

set -e

echo "=================================================="
echo "🔧 Fixing User Management Edge Function"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env.local ]; then
    source .env.local
else
    echo -e "${RED}❌ Error: .env.local not found${NC}"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not installed${NC}"
    echo "Install with: npm install -g supabase"
    exit 1
fi

echo "1️⃣  Checking current Edge Function status..."
echo "---------------------------------------------------"

FUNCTION_NAME="admin-list-auth-users"

# Check if function exists
if [ ! -d "supabase/functions/$FUNCTION_NAME" ]; then
    echo -e "${RED}❌ Function directory not found: supabase/functions/$FUNCTION_NAME${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Function directory exists${NC}"
echo ""

echo "2️⃣  Setting Edge Function secrets..."
echo "---------------------------------------------------"

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local${NC}"
    exit 1
fi

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" --project-ref "${NEXT_PUBLIC_SUPABASE_URL##*/}" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not set secret via CLI. You may need to set it manually in Supabase Dashboard${NC}"
}

echo "Setting ADMIN_AUTH_USER_ID..."
supabase secrets set ADMIN_AUTH_USER_ID="9ebfa3dd-392c-489d-882f-8a1762cb36e8" --project-ref "${NEXT_PUBLIC_SUPABASE_URL##*/}" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not set secret via CLI. You may need to set it manually in Supabase Dashboard${NC}"
}

echo ""
echo "3️⃣  Redeploying Edge Function..."
echo "---------------------------------------------------"

echo "Deploying $FUNCTION_NAME..."
supabase functions deploy "$FUNCTION_NAME" --project-ref "${NEXT_PUBLIC_SUPABASE_URL##*/}" || {
    echo -e "${RED}❌ Deployment failed${NC}"
    echo "Manual deployment:"
    echo "  1. Go to Supabase Dashboard > Edge Functions"
    echo "  2. Deploy the function from the UI"
    exit 1
}

echo -e "${GREEN}✅ Function deployed successfully${NC}"
echo ""

echo "4️⃣  Verifying deployment..."
echo "---------------------------------------------------"

sleep 3  # Wait for deployment to stabilize

echo "Fetching recent logs..."
supabase functions logs "$FUNCTION_NAME" --limit 5 --project-ref "${NEXT_PUBLIC_SUPABASE_URL##*/}" || {
    echo -e "${YELLOW}⚠️  Could not fetch logs${NC}"
}

echo ""
echo "5️⃣  Testing the function..."
echo "---------------------------------------------------"

FUNCTION_URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}"

# Test OPTIONS
echo "Testing CORS preflight..."
OPTIONS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,apikey" \
    -H "Origin: http://localhost:3000" \
    "$FUNCTION_URL")

if [ "$OPTIONS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CORS preflight successful (HTTP $OPTIONS_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️  CORS preflight returned HTTP $OPTIONS_CODE${NC}"
fi

# Test authentication (should return 401 without valid JWT)
echo "Testing authentication..."
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    "$FUNCTION_URL")

if [ "$AUTH_CODE" = "401" ]; then
    echo -e "${GREEN}✅ Authentication check working (HTTP $AUTH_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected auth response: HTTP $AUTH_CODE${NC}"
fi

echo ""
echo "=================================================="
echo "✅ Fix complete!"
echo "=================================================="
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Test the User Management page in your browser"
echo "2. If issues persist, check:"
echo "   - Supabase Dashboard > Edge Functions > admin-list-auth-users"
echo "   - Edge Function logs for detailed errors"
echo "   - Network tab in browser DevTools"
echo ""
echo "3. For additional diagnostics, run:"
echo "   ./scripts/diagnose-user-management.sh"
echo ""