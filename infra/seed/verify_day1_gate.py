#!/usr/bin/env python3
"""
DenialDefender Day 1 Gate Verification
======================================
Verifies the Day 1 gate: empty case round-trips through the system.

Checks:
1. Empty case can be created via API
2. Case appears in database
3. Placeholder trace event can be added
4. Trace event appears in database
5. Case appears in cases list

Usage: python infra/seed/verify_day1_gate.py [--api-url URL]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError

def log_ok(msg: str):
    print(f"  [OK] {msg}")

def log_fail(msg: str):
    print(f"  [FAIL] {msg}")

def log_info(msg: str):
    print(f"  [INFO] {msg}")

def api_request(url: str, method: str = "GET", data: dict = None) -> dict:
    """Make an API request and return parsed JSON response."""
    body = json.dumps(data).encode("utf-8") if data else None
    req = Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        raise RuntimeError(f"API request failed: {e}")

def verify_day1_gate(api_url: str) -> bool:
    """Run the Day 1 gate verification."""
    all_passed = True
    
    print()
    print("=" * 63)
    print("  DenialDefender Day 1 Gate Verification")
    print(f"  API: {api_url}")
    print(f"  Time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 63)
    print()
    
    # Test 1: Create empty case
    print("-- Test 1: Create Empty Case --")
    case_id = None
    try:
        case_data = {
            "patient_id": "HASHED_PATIENT_GATE_TEST",
            "persona": "medical_billing_specialist",
            "deadline": "2026-09-15T00:00:00Z"
        }
        result = api_request(f"{api_url}/api/cases", method="POST", data=case_data)
        # API returns { case: {...} }
        case_obj = result.get("case", result)
        case_id = case_obj.get("id")
        
        if case_id:
            log_ok(f"Empty case created: {case_id}")
            log_info(f"State: {case_obj.get('state')}")
            log_info(f"Patient: {case_obj.get('patient_id')}")
        else:
            log_fail(f"Case creation returned no ID. Response: {result}")
            all_passed = False
    except Exception as e:
        log_fail(f"Case creation failed: {e}")
        all_passed = False
    
    if not case_id:
        print()
        log_fail("Cannot continue without case ID -- aborting")
        return False
    
    # Test 2: Retrieve case
    print()
    print("-- Test 2: Retrieve Case --")
    try:
        result = api_request(f"{api_url}/api/cases/{case_id}")
        case_obj = result.get("case", result)
        if case_obj.get("id") == case_id:
            log_ok(f"Case retrieved successfully")
            log_info(f"State: {case_obj.get('state')}")
        else:
            log_fail(f"Retrieved case ID mismatch. Response: {result}")
            all_passed = False
    except Exception as e:
        log_fail(f"Case retrieval failed: {e}")
        all_passed = False
    
    # Test 3: Add placeholder trace event
    print()
    print("-- Test 3: Add Placeholder Trace Event --")
    try:
        trace_data = {
            "agent_name": "system",
            "step": "case_created",
            "status": "completed",
            "details": json.dumps({"message": "Empty case created -- Day 1 gate verification"}),
            "references": json.dumps([])
        }
        result = api_request(f"{api_url}/api/cases/{case_id}/trace", method="POST", data=trace_data)
        trace_obj = result.get("trace", result)
        if trace_obj.get("id"):
            log_ok(f"Trace event added: {trace_obj.get('id')}")
        else:
            log_fail(f"Trace event creation returned no ID. Response: {result}")
            all_passed = False
    except Exception as e:
        log_fail(f"Trace event creation failed: {e}")
        all_passed = False
    
    # Test 4: Verify trace events
    print()
    print("-- Test 4: Verify Trace Events --")
    try:
        result = api_request(f"{api_url}/api/cases/{case_id}/trace")
        events = result.get("traces", result.get("events", result if isinstance(result, list) else []))
        if len(events) > 0:
            log_ok(f"Found {len(events)} trace event(s)")
            for evt in events[:5]:
                log_info(f"  [{evt.get('agent_name', evt.get('agentName'))}] {evt.get('step')}: {evt.get('status')}")
        else:
            log_fail("No trace events found")
            all_passed = False
    except Exception as e:
        log_fail(f"Trace event retrieval failed: {e}")
        all_passed = False
    
    # Test 5: List cases (case appears in list)
    print()
    print("-- Test 5: Case Appears in List --")
    try:
        result = api_request(f"{api_url}/api/cases")
        cases = result.get("cases", result if isinstance(result, list) else [])
        found = any(c.get("id") == case_id for c in cases)
        if found:
            log_ok(f"Case {case_id[:8]}... appears in cases list ({len(cases)} total)")
        else:
            log_fail(f"Case {case_id} not found in cases list")
            all_passed = False
    except Exception as e:
        log_fail(f"Cases list retrieval failed: {e}")
        all_passed = False
    
    # Summary
    print()
    print("=" * 63)
    if all_passed:
        print("  DAY 1 GATE PASSED -- Empty case round-trips successfully")
    else:
        print("  DAY 1 GATE FAILED -- See errors above")
    print("=" * 63)
    print()
    
    return all_passed

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify Day 1 gate")
    parser.add_argument("--api-url", default="http://localhost:3000", help="API base URL")
    args = parser.parse_args()
    
    success = verify_day1_gate(args.api_url)
    sys.exit(0 if success else 1)
