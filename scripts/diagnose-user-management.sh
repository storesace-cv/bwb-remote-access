#!/bin/bash

# Diagnose User Management "Failed to fetch" Error
# Usage: ./scripts/diagnose-user-management.sh

set -e

echo "=================================================="
echo "🔍 Diagnosing User Management Issues"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env.local ]; then
    # shellcheck disable=SC1091
    source .env.local
else
    echo -e "${RED}❌ Error: .env.local not found${NC}"
    exit 1
fi

echo "1️⃣  Checking Environment Variables..."
echo "---------------------------------------------------"

required_vars=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
)

all_vars_present=true
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Missing: $var${NC}"
        all_vars_present=false
    else
        echo -e "${GREEN}✅ Found: $var${NC}"
    fi
done

if [ "$all_vars_present" = false ]; then
    echo -e "${RED}❌ Missing required environment variables${NC}"
    exit 1
fi

echo ""
echo "2️⃣  Checking Supabase Edge Function Deployment..."
echo "---------------------------------------------------"

FUNCTION_NAME="admin-list-auth-users"
FUNCTION_URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}"

echo "Function URL: $FUNCTION_URL"
echo ""

# Test OPTIONS (CORS preflight)
echo "Testing CORS preflight (OPTIONS)..."
OPTIONS_RESPONSE=$(curl -s -w "\n%{http_code}" -X OPTIONS \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,apikey" \
    -H "Origin: http://localhost:3000" \
    "$FUNCTION_URL")

OPTIONS_CODE=$(printf '%s\n' "$OPTIONS_RESPONSE" | tail -n1)
if [ "$OPTIONS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CORS preflight successful (HTTP $OPTIONS_CODE)${NC}"
else
    echo -e "${RED}❌ CORS preflight failed (HTTP $OPTIONS_CODE)${NC}"
    echo "Response: $OPTIONS_RESPONSE"
fi

echo ""

# Test GET without auth (should fail with 401)
echo "Testing GET without authentication (should return 401)..."
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    "$FUNCTION_URL")

UNAUTH_CODE=$(printf '%s\n' "$UNAUTH_RESPONSE" | tail -n1)
UNAUTH_BODY=$(printf '%s\n' "$UNAUTH_RESPONSE" | sed '$d')

if [ "$UNAUTH_CODE" = "401" ]; then
    echo -e "${GREEN}✅ Authentication check working (HTTP $UNAUTH_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected status code: HTTP $UNAUTH_CODE${NC}"
fi

echo "Unauthenticated response body:"
echo "$UNAUTH_BODY"
echo ""
echo "3️⃣  Checking Edge Function Logs..."
echo "---------------------------------------------------"

if command -v supabase &> /dev/null; then
    echo "Fetching recent Edge Function logs..."
    supabase functions logs "$FUNCTION_NAME" --limit 20 || echo -e "${YELLOW}⚠️  Could not fetch logs${NC}"
else
    echo -e "${YELLOW}⚠️  Supabase CLI not installed. Cannot fetch logs.${NC}"
    echo "Install with: npm install supabase --save-dev"
fi

echo ""
echo "4️⃣  Verifying Edge Function Files..."
echo "---------------------------------------------------"

FUNCTION_DIR="supabase/functions/$FUNCTION_NAME"
if [ -d "$FUNCTION_DIR" ]; then
    echo -e "${GREEN}✅ Function directory exists: $FUNCTION_DIR${NC}"
    
    if [ -f "$FUNCTION_DIR/index.ts" ]; then
        echo -e "${GREEN}✅ Function file exists: $FUNCTION_DIR/index.ts${NC}"
        
        FILE_SIZE=$(wc -c < "$FUNCTION_DIR/index.ts")
        echo "   File size: $FILE_SIZE bytes"
        
        if grep -q "createClient" "$FUNCTION_DIR/index.ts"; then
            echo -e "${GREEN}   ✅ Supabase client import found${NC}"
        else
            echo -e "${RED}   ❌ Supabase client import missing${NC}"
        fi
        
        if grep -q "serve" "$FUNCTION_DIR/index.ts"; then
            echo -e "${GREEN}   ✅ Deno serve import found${NC}"
        else
            echo -e "${RED}   ❌ Deno serve import missing${NC}"
        fi
    else
        echo -e "${RED}❌ Function file missing: $FUNCTION_DIR/index.ts${NC}"
    fi
else
    echo -e "${RED}❌ Function directory missing: $FUNCTION_DIR${NC}"
fi

echo ""
echo "5️⃣  Testing Network Connectivity..."
echo "---------------------------------------------------"

echo "Testing Supabase API connectivity..."
API_TEST=$(curl -s -w "\n%{http_code}" -X GET \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/")

API_CODE=$(printf '%s\n' "$API_TEST" | tail -n1)
if [ "$API_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Supabase API accessible (HTTP $API_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️  Supabase API status: HTTP $API_CODE${NC}"
fi

echo ""
echo "6️⃣  Recommendations..."
echo "---------------------------------------------------"

if [ "$OPTIONS_CODE" != "200" ]; then
    echo -e "${YELLOW}⚠️  CORS configuration issue detected${NC}"
    echo "   → Redeploy the Edge Function with proper CORS headers"
fi

if [ "$all_vars_present" = false ]; then
    echo -e "${YELLOW}⚠️  Environment variables missing${NC}"
    echo "   → Update .env.local with required variables"
fi

echo ""
echo "🔧 Suggested Actions:"
echo "---------------------------------------------------"
echo "1. Redeploy the Edge Function:"
echo "   supabase functions deploy admin-list-auth-users"
echo ""
echo "2. Check Edge Function secrets are set:"
echo "   supabase secrets list"
echo ""
echo "3. Set missing secrets (if any):"
echo "   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key"
echo "   supabase secrets set ADMIN_AUTH_USER_ID=9ebfa3dd-392c-489d-882f-8a1762cb36e8"
echo ""
echo "4. Verify the function is running:"
echo "   supabase functions logs admin-list-auth-users"
echo ""
echo "=================================================="
echo "✅ Diagnostic complete"
echo "=================================================="