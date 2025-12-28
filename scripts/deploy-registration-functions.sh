#!/bin/bash

# Deploy Registration and Admin Edge Functions
# Usage: ./scripts/deploy-registration-functions.sh

set -e

echo "=================================================="
echo "🚀 Deploying Supabase Edge Functions"
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

# Check required environment variables
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${RED}❌ NEXT_PUBLIC_SUPABASE_URL not set in .env.local${NC}"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}❌ SUPABASE_SERVICE_ROLE_KEY not set in .env.local${NC}"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.local${NC}"
    exit 1
fi

# Extract project ref from URL
PROJECT_REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -n 's/.*https:\/\/\([^.]*\).*/\1/p')

if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}❌ Could not extract project ref from SUPABASE_URL${NC}"
    exit 1
fi

echo -e "${BLUE}Project Ref:${NC} $PROJECT_REF"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Supabase CLI not installed${NC}"
    echo "Installing Supabase CLI globally..."
    npm install -g supabase || {
        echo -e "${RED}❌ Failed to install Supabase CLI${NC}"
        echo "Try: sudo npm install -g supabase"
        exit 1
    }
fi

echo "1️⃣  Verifying Edge Function files..."
echo "---------------------------------------------------"

# List of admin Edge Functions to deploy
ADMIN_FUNCTIONS=(
    "admin-list-auth-users"
    "admin-list-mesh-users"
    "admin-create-auth-user"
    "admin-update-auth-user"
    "admin-delete-auth-user"
    "admin-update-device"
    "admin-delete-device"
)

# Check which functions exist
EXISTING_FUNCTIONS=()
MISSING_FUNCTIONS=()

for func in "${ADMIN_FUNCTIONS[@]}"; do
    if [ -d "supabase/functions/$func" ]; then
        echo -e "${GREEN}✅ Found: supabase/functions/$func${NC}"
        EXISTING_FUNCTIONS+=("$func")
    else
        echo -e "${YELLOW}⚠️  Missing: supabase/functions/$func${NC}"
        MISSING_FUNCTIONS+=("$func")
    fi
done

echo ""

if [ ${#EXISTING_FUNCTIONS[@]} -eq 0 ]; then
    echo -e "${RED}❌ No Edge Functions found to deploy${NC}"
    exit 1
fi

echo "2️⃣  Setting Edge Function secrets..."
echo "---------------------------------------------------"

# Set secrets
echo "Setting SUPABASE_URL..."
supabase secrets set SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" --project-ref "$PROJECT_REF" || {
    echo -e "${YELLOW}⚠️  Could not set SUPABASE_URL${NC}"
}

echo "Setting SUPABASE_ANON_KEY..."
supabase secrets set SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" --project-ref "$PROJECT_REF" || {
    echo -e "${YELLOW}⚠️  Could not set SUPABASE_ANON_KEY${NC}"
}

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" --project-ref "$PROJECT_REF" || {
    echo -e "${YELLOW}⚠️  Could not set SUPABASE_SERVICE_ROLE_KEY${NC}"
}

echo "Setting ADMIN_AUTH_USER_ID..."
supabase secrets set ADMIN_AUTH_USER_ID="9ebfa3dd-392c-489d-882f-8a1762cb36e8" --project-ref "$PROJECT_REF" || {
    echo -e "${YELLOW}⚠️  Could not set ADMIN_AUTH_USER_ID${NC}"
}

echo -e "${GREEN}✅ Secrets configured${NC}"
echo ""

echo "3️⃣  Deploying Edge Functions..."
echo "---------------------------------------------------"

DEPLOYED_COUNT=0
FAILED_COUNT=0

for func in "${EXISTING_FUNCTIONS[@]}"; do
    echo ""
    echo -e "${BLUE}Deploying: $func${NC}"
    
    if supabase functions deploy "$func" --project-ref "$PROJECT_REF"; then
        echo -e "${GREEN}✅ $func deployed successfully${NC}"
        ((DEPLOYED_COUNT++))
    else
        echo -e "${RED}❌ Failed to deploy $func${NC}"
        ((FAILED_COUNT++))
    fi
done

echo ""
echo "---------------------------------------------------"
echo -e "${GREEN}✅ Deployed: $DEPLOYED_COUNT functions${NC}"
if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Failed: $FAILED_COUNT functions${NC}"
fi
echo ""

echo "4️⃣  Verifying deployments..."
echo "---------------------------------------------------"

sleep 3  # Wait for deployments to stabilize

for func in "${EXISTING_FUNCTIONS[@]}"; do
    FUNCTION_URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${func}"
    
    echo "Testing: $func"
    
    # Test OPTIONS for CORS
    OPTIONS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: authorization,apikey" \
        -H "Origin: http://localhost:3000" \
        "$FUNCTION_URL" 2>/dev/null || echo "000")
    
    if [ "$OPTIONS_CODE" = "200" ]; then
        echo -e "  ${GREEN}✅ CORS: OK (HTTP $OPTIONS_CODE)${NC}"
    else
        echo -e "  ${YELLOW}⚠️  CORS: HTTP $OPTIONS_CODE${NC}"
    fi
    
    # Test GET (should return 401 without auth)
    AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
        -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
        "$FUNCTION_URL" 2>/dev/null || echo "000")
    
    if [ "$AUTH_CODE" = "401" ]; then
        echo -e "  ${GREEN}✅ Auth: OK (HTTP $AUTH_CODE)${NC}"
    elif [ "$AUTH_CODE" = "404" ]; then
        echo -e "  ${RED}❌ Not deployed (HTTP $AUTH_CODE)${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Auth: HTTP $AUTH_CODE${NC}"
    fi
    
    echo ""
done

echo "5️⃣  Testing admin-list-auth-users specifically..."
echo "---------------------------------------------------"

ADMIN_LIST_URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-list-auth-users"

echo "URL: $ADMIN_LIST_URL"
echo ""

# Test with OPTIONS
echo "Testing CORS preflight..."
CORS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X OPTIONS \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,apikey" \
    -H "Origin: http://localhost:3000" \
    "$ADMIN_LIST_URL")

CORS_CODE=$(echo "$CORS_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)

if [ "$CORS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CORS preflight successful${NC}"
else
    echo -e "${RED}❌ CORS preflight failed (HTTP $CORS_CODE)${NC}"
    echo "$CORS_RESPONSE" | grep -v "HTTP_CODE:"
fi

echo ""

# Test with GET (no auth - should return 401)
echo "Testing authentication requirement..."
AUTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    "$ADMIN_LIST_URL")

AUTH_CODE=$(echo "$AUTH_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)

if [ "$AUTH_CODE" = "401" ]; then
    echo -e "${GREEN}✅ Authentication check working (HTTP $AUTH_CODE)${NC}"
    echo "Response body:"
    echo "$AUTH_RESPONSE" | grep -v "HTTP_CODE:"
elif [ "$AUTH_CODE" = "404" ]; then
    echo -e "${RED}❌ Function not found (HTTP $AUTH_CODE)${NC}"
    echo "The function was not deployed successfully."
    echo ""
    echo "Manual deployment required:"
    echo "  cd supabase/functions/admin-list-auth-users"
    echo "  supabase functions deploy admin-list-auth-users --project-ref $PROJECT_REF"
else
    echo -e "${YELLOW}⚠️  Unexpected response (HTTP $AUTH_CODE)${NC}"
    echo "Response body:"
    echo "$AUTH_RESPONSE" | grep -v "HTTP_CODE:"
fi

echo ""
echo "=================================================="
echo "✅ Deployment complete!"
echo "=================================================="
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  - Deployed functions: $DEPLOYED_COUNT"
echo "  - Failed deployments: $FAILED_COUNT"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Test User Management in your browser:"
echo "   https://kqwaibgvmzcqeoctukoy.supabase.co/dashboard/users"
echo ""
echo "2. Monitor Edge Function logs:"
echo "   supabase functions logs admin-list-auth-users --project-ref $PROJECT_REF"
echo ""
echo "3. If issues persist, check:"
echo "   - Supabase Dashboard > Edge Functions"
echo "   - Verify all secrets are set correctly"
echo "   - Check function logs for errors"
echo ""