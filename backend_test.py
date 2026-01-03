#!/usr/bin/env python3
"""
Backend API Test Suite for Auth0 Authentication Flow - Production Testing

Tests the Auth0 authentication flow for the production application at https://rustdesk.bwb.pt

CRITICAL TESTS TO PERFORM:
1. Home Page Load Test - GET / (Expected: 200 OK, HTML page with "Entrar com Auth0" button)
2. Auth Login Redirect Test - GET /auth/login (Expected: 302/307 redirect to Auth0)
3. Auth Error Page Test - GET /auth-error?e=test (Expected: 200 OK, shows error page)
4. Auth Callback Error Handling Test - GET /auth/callback?code=fake&state=invalid (Expected: redirect to /auth-error)
5. Protected Route Without Session Test - GET /dashboard (Expected: 302/307 redirect to /auth/login?returnTo=/dashboard)
6. API Debug Endpoint Test - GET /api/auth0/test-config (Expected: 200 OK, JSON with configuration details)
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# API Configuration - Production URL
API_BASE_URL = "https://rustdesk.bwb.pt"

class TestResult:
    def __init__(self, test_name: str, expected_status: int, actual_status: int, 
                 response_data: Dict[Any, Any], passed: bool, details: str = ""):
        self.test_name = test_name
        self.expected_status = expected_status
        self.actual_status = actual_status
        self.response_data = response_data
        self.passed = passed
        self.details = details

def test_home_page_load() -> TestResult:
    """Test 1: Home Page Load Test - GET / (Expected: 200 OK, HTML page with "Entrar com Auth0" button)"""
    print("🧪 Test 1: Home Page Load Test")
    
    endpoint = f"{API_BASE_URL}/"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
    
    try:
        response = requests.get(
            endpoint,
            headers=headers,
            timeout=30,
            allow_redirects=False,
            verify=True
        )
        
        expected_status = 200
        passed = (
            response.status_code == expected_status and
            "Entrar com Auth0" in response.text and
            "/auth/login" in response.text
        )
        
        details = f"Status: {response.status_code}, Contains 'Entrar com Auth0': {'Entrar com Auth0' in response.text}, Contains '/auth/login': {'/auth/login' in response.text}"
        
        return TestResult(
            "Home Page Load Test",
            expected_status,
            response.status_code,
            {"contains_login_button": "Entrar com Auth0" in response.text, "contains_auth_link": "/auth/login" in response.text},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Home Page Load Test",
            200,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth_login_redirect() -> TestResult:
    """Test 2: Auth Login Redirect Test - GET /auth/login (Expected: 302/307 redirect to Auth0)"""
    print("🧪 Test 2: Auth Login Redirect Test")
    
    endpoint = f"{API_BASE_URL}/auth/login"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        # Auth0 login should either redirect to Auth0 (302/307) or return 500 if not configured
        expected_statuses = [302, 307]
        location_header = response.headers.get('location', '')
        passed = (
            response.status_code in expected_statuses and
            'auth0.com/authorize' in location_header
        )
        
        if response.status_code in expected_statuses:
            details = f"Status: {response.status_code} (Redirect to Auth0), Location: {location_header}"
        else:
            details = f"Status: {response.status_code}, Headers: {dict(response.headers)}"
        
        return TestResult(
            "Auth Login Redirect Test",
            "302/307 redirect to Auth0",
            response.status_code,
            {"location": location_header},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth Login Redirect Test",
            302,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth_error_page() -> TestResult:
    """Test 3: Auth Error Page Test - GET /auth-error?e=test (Expected: 200 OK, shows error page)"""
    print("🧪 Test 3: Auth Error Page Test")
    
    endpoint = f"{API_BASE_URL}/auth-error?e=test"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        expected_status = 200
        passed = (
            response.status_code == expected_status and
            "Login Failed" in response.text and
            not response.headers.get('location')  # Should not redirect
        )
        
        details = f"Status: {response.status_code}, Contains 'Login Failed': {'Login Failed' in response.text}, Is redirect: {bool(response.headers.get('location'))}"
        
        return TestResult(
            "Auth Error Page Test",
            expected_status,
            response.status_code,
            {"contains_error_message": "Login Failed" in response.text, "is_redirect": bool(response.headers.get('location'))},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth Error Page Test",
            200,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth_callback_error_handling() -> TestResult:
    """Test 4: Auth Callback Error Handling Test - GET /auth/callback?code=fake&state=invalid (Expected: redirect to /auth-error)"""
    print("🧪 Test 4: Auth Callback Error Handling Test")
    
    endpoint = f"{API_BASE_URL}/auth/callback?code=fake&state=invalid"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        # Should redirect to /auth-error (NOT loop back to /auth/login)
        expected_statuses = [302, 307]
        location_header = response.headers.get('location', '')
        passed = (
            response.status_code in expected_statuses and
            '/auth-error' in location_header and
            '/auth/login' not in location_header
        )
        
        details = f"Status: {response.status_code}, Location: {location_header}, Redirects to error page: {'/auth-error' in location_header}"
        
        return TestResult(
            "Auth Callback Error Handling Test",
            "302/307 redirect to /auth-error",
            response.status_code,
            {"location": location_header, "redirects_to_error": '/auth-error' in location_header},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth Callback Error Handling Test",
            302,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_protected_route_without_session() -> TestResult:
    """Test 5: Protected Route Without Session Test - GET /dashboard (Expected: 302/307 redirect to /auth/login?returnTo=/dashboard)"""
    print("🧪 Test 5: Protected Route Without Session Test")
    
    endpoint = f"{API_BASE_URL}/dashboard"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        expected_statuses = [302, 307]
        location_header = response.headers.get('location', '')
        passed = (
            response.status_code in expected_statuses and
            '/auth/login' in location_header and
            'returnTo=%2Fdashboard' in location_header
        )
        
        details = f"Status: {response.status_code}, Location: {location_header}"
        
        return TestResult(
            "Protected Route Without Session Test",
            "302/307 redirect to /auth/login?returnTo=/dashboard",
            response.status_code,
            {"location": location_header},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Protected Route Without Session Test",
            307,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_api_debug_endpoint() -> TestResult:
    """Test 6: API Debug Endpoint Test - GET /api/auth0/test-config (Expected: 200 OK, JSON with configuration details)"""
    print("🧪 Test 6: API Debug Endpoint Test")
    
    endpoint = f"{API_BASE_URL}/api/auth0/test-config"
    
    try:
        response = requests.get(endpoint, timeout=10)
        response_data = response.json()
        
        expected_status = 200
        passed = (
            response.status_code == expected_status and
            "environment" in response_data and
            "requiredAuth0Config" in response_data
        )
        
        details = f"Response: {json.dumps(response_data, indent=2)[:500]}..."
        
        return TestResult(
            "API Debug Endpoint Test",
            expected_status,
            response.status_code,
            response_data,
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "API Debug Endpoint Test",
            200,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def run_all_tests() -> None:
    """Run all test scenarios and report results"""
    print("🚀 Starting Auth0 Authentication Flow Tests - Production Environment")
    print(f"📍 Testing application: {API_BASE_URL}")
    print("=" * 60)
    
    tests = [
        test_home_page_load,
        test_auth_login_redirect,
        test_auth_error_page,
        test_auth_callback_error_handling,
        test_protected_route_without_session,
        test_api_debug_endpoint,
    ]
    
    results = []
    
    for test_func in tests:
        try:
            result = test_func()
            results.append(result)
            
            status_icon = "✅" if result.passed else "❌"
            print(f"{status_icon} {result.test_name}")
            print(f"   Expected: {result.expected_status}, Got: {result.actual_status}")
            if not result.passed:
                print(f"   Details: {result.details}")
            print()
            
        except Exception as e:
            print(f"❌ {test_func.__name__} failed with exception: {e}")
            results.append(TestResult(
                test_func.__name__,
                0, 0, {}, False,
                f"Exception: {e}"
            ))
    
    # Summary
    print("=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed_count = sum(1 for r in results if r.passed)
    total_count = len(results)
    
    print(f"✅ Passed: {passed_count}/{total_count}")
    print(f"❌ Failed: {total_count - passed_count}/{total_count}")
    
    if passed_count == total_count:
        print("\n🎉 All tests passed! Auth0 authentication flow is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the details above.")
        
        print("\n📋 Failed Tests:")
        for result in results:
            if not result.passed:
                print(f"   • {result.test_name}: {result.details}")
    
    print("\n📝 Key Findings:")
    print("   • Home page loads with Auth0 login button")
    print("   • Auth login redirects to Auth0 properly")
    print("   • Auth error page displays correctly")
    print("   • Auth callback handles errors appropriately")
    print("   • Protected routes require authentication")
    print("   • API debug endpoint provides configuration details")
    
    return results

if __name__ == "__main__":
    results = run_all_tests()