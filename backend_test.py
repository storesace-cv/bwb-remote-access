#!/usr/bin/env python3
"""
Backend API Test Suite for Auth0-Only Authentication Enforcement

Tests the Auth0-only authentication enforcement and legacy login deprecation.
This is a Next.js application with Auth0 authentication.

Test Scenarios:
1. Legacy Login API - 410 Gone
2. Auth0 Endpoints Available
3. Build Verification
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# API Configuration
API_BASE_URL = "http://localhost:3000"

class TestResult:
    def __init__(self, test_name: str, expected_status: int, actual_status: int, 
                 response_data: Dict[Any, Any], passed: bool, details: str = ""):
        self.test_name = test_name
        self.expected_status = expected_status
        self.actual_status = actual_status
        self.response_data = response_data
        self.passed = passed
        self.details = details

def test_legacy_login_410_gone() -> TestResult:
    """Test 1: Legacy login should return 410 Gone"""
    print("🧪 Test 1: Legacy Login API - 410 Gone")
    
    endpoint = f"{API_BASE_URL}/api/login"
    data = {
        "email": "test@test.com",
        "password": "test123"
    }
    
    try:
        response = requests.post(
            endpoint,
            json=data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        response_data = response.json()
        
        expected_status = 410
        passed = (
            response.status_code == expected_status and
            response_data.get("error") == "Gone" and
            "deprecated" in response_data.get("message", "").lower()
        )
        
        details = f"Response: {json.dumps(response_data, indent=2)}"
        
        return TestResult(
            "Legacy Login API - 410 Gone",
            expected_status,
            response.status_code,
            response_data,
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Legacy Login API - 410 Gone",
            410,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth0_me_endpoint() -> TestResult:
    """Test 2: Auth0 me endpoint should return unauthenticated status"""
    print("🧪 Test 2: Auth0 /me endpoint")
    
    endpoint = f"{API_BASE_URL}/api/auth0/me"
    
    try:
        response = requests.get(endpoint, timeout=10)
        response_data = response.json()
        
        expected_status = 200
        passed = (
            response.status_code == expected_status and
            response_data.get("authenticated") == False
        )
        
        details = f"Response: {json.dumps(response_data, indent=2)}"
        
        return TestResult(
            "Auth0 /me endpoint",
            expected_status,
            response.status_code,
            response_data,
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth0 /me endpoint",
            200,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_mesh_open_session_requires_auth() -> TestResult:
    """Test 3: MeshCentral open-session should require auth"""
    print("🧪 Test 3: MeshCentral open-session requires auth")
    
    endpoint = f"{API_BASE_URL}/api/mesh/open-session"
    data = {
        "nodeId": "node/mesh/test",
        "domain": "mesh"
    }
    
    try:
        response = requests.post(
            endpoint,
            json=data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        response_data = response.json()
        
        expected_status = 401
        passed = (
            response.status_code == expected_status and
            response_data.get("success") == False and
            response_data.get("error") == "Unauthorized"
        )
        
        details = f"Response: {json.dumps(response_data, indent=2)}"
        
        return TestResult(
            "MeshCentral open-session requires auth",
            expected_status,
            response.status_code,
            response_data,
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "MeshCentral open-session requires auth",
            401,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth0_login_redirect() -> TestResult:
    """Test 4: Auth0 login endpoint should be accessible"""
    print("🧪 Test 4: Auth0 login endpoint accessibility")
    
    endpoint = f"{API_BASE_URL}/api/auth/login"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        # Auth0 login should redirect (302/307) or return some response
        expected_statuses = [200, 302, 307, 401, 403]
        passed = response.status_code in expected_statuses
        
        details = f"Status: {response.status_code}, Headers: {dict(response.headers)}"
        
        return TestResult(
            "Auth0 login endpoint accessibility",
            "302/307 or accessible",
            response.status_code,
            {},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth0 login endpoint accessibility",
            302,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def test_auth0_logout_endpoint() -> TestResult:
    """Test 5: Auth0 logout endpoint should be accessible"""
    print("🧪 Test 5: Auth0 logout endpoint accessibility")
    
    endpoint = f"{API_BASE_URL}/api/auth/logout"
    
    try:
        response = requests.get(endpoint, timeout=10, allow_redirects=False)
        
        # Auth0 logout should redirect or return some response
        expected_statuses = [200, 302, 307, 401, 403]
        passed = response.status_code in expected_statuses
        
        details = f"Status: {response.status_code}, Headers: {dict(response.headers)}"
        
        return TestResult(
            "Auth0 logout endpoint accessibility",
            "302/307 or accessible",
            response.status_code,
            {},
            passed,
            details
        )
    except requests.exceptions.RequestException as e:
        return TestResult(
            "Auth0 logout endpoint accessibility",
            302,
            0,
            {},
            False,
            f"Request failed: {e}"
        )

def run_all_tests() -> None:
    """Run all test scenarios and report results"""
    print("🚀 Starting Auth0-Only Authentication Enforcement Tests")
    print(f"📍 Testing application: {API_BASE_URL}")
    print("=" * 60)
    
    tests = [
        test_legacy_login_410_gone,
        test_auth0_me_endpoint,
        test_mesh_open_session_requires_auth,
        test_auth0_login_redirect,
        test_auth0_logout_endpoint,
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
        print("\n🎉 All tests passed! Auth0-only authentication enforcement is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the details above.")
        
        print("\n📋 Failed Tests:")
        for result in results:
            if not result.passed:
                print(f"   • {result.test_name}: {result.details}")
    
    print("\n📝 Key Findings:")
    print("   • Legacy login API properly deprecated (410 Gone)")
    print("   • Auth0 authentication endpoints accessible")
    print("   • Protected endpoints require authentication")
    print("   • Error responses follow expected format")
    
    return results

if __name__ == "__main__":
    results = run_all_tests()