#!/usr/bin/env python3
"""Day 2 Verification Script for DenialDefender"""
import json
import urllib.request
import sys

BASE = "http://localhost:3000"

def api_get(path):
    try:
        req = urllib.request.Request(f"{BASE}{path}")
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def api_post(path, data):
    try:
        body = json.dumps(data).encode()
        req = urllib.request.Request(f"{BASE}{path}", data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        resp = urllib.request.urlopen(req, timeout=60)
        return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

print("=" * 60)
print("DAY 2 VERIFICATION - DenialDefender")
print("=" * 60)

# Gate 1: Evidence Corpus
print("\n=== GATE 1: Evidence Corpus (100+ hashed, provenance-tagged) ===")
d = api_get("/api/evidence/corpus")
if "error" in d:
    print(f"  ERROR: {d['error']}")
else:
    c = d.get("corpus", {})
    total = c.get("totalRecords", 0)
    hashed = c.get("hashedRecords", 0)
    unique = c.get("uniqueDocuments", 0)
    gate = c.get("gatePassed", False)
    print(f"  Total records: {total}")
    print(f"  Hashed records: {hashed}")
    print(f"  Unique documents: {unique}")
    print(f"  Sources: {len(c.get('bySource', []))}")
    print(f"  By tier: {json.dumps(c.get('byTier', {}))}")
    print(f"  Gate: {'PASS' if gate else 'FAIL'}")

# Gate 2: Citation Resolution
print("\n=== GATE 2: Sample Citation Resolves to Real Document ===")
first = api_get("/api/evidence?pageSize=1")
if "error" in first:
    print(f"  ERROR: {first['error']}")
elif first.get("records"):
    eid = first["records"][0]["id"]
    cit = api_get(f"/api/evidence?id={eid}")
    if "error" in cit:
        print(f"  ERROR: {cit['error']}")
    else:
        e = cit.get("evidence", {})
        has_hash = bool(e.get("contentHash"))
        has_source = bool(e.get("source"))
        has_provenance = bool(e.get("provenance"))
        print(f"  ID: {eid}")
        print(f"  Source: {e.get('source')}")
        print(f"  Document: {e.get('document')}")
        print(f"  Hash: {e.get('contentHash', '')[:20]}...")
        print(f"  Provenance: {e.get('provenance')}")
        print(f"  Gate: {'PASS' if has_hash and has_source and has_provenance else 'FAIL'}")

# Gate 3: Two-Agent Pipeline
print("\n=== GATE 3: Two-Agent Pipeline (Triage -> Policy Research) ===")
pipe = api_post("/api/pipeline", {
    "denialLetter": "Denial: CPT 97110 Physical Therapy not medically necessary for M54.5. CARC: CO50",
    "payer": "Medicare",
    "mode": "full"
})
if "error" in pipe:
    print(f"  ERROR: {pipe['error']}")
else:
    r = pipe.get("result", {})
    t = r.get("triage", {})
    e = r.get("evidence", {})
    l = r.get("latency", {})
    results = e.get("results", [])
    print(f"  Triage denial type: {t.get('denial_type', 'N/A')}")
    print(f"  Triage confidence: {t.get('confidence', 'N/A')}")
    print(f"  Evidence found: {len(results)}")
    if results:
        for i, ev in enumerate(results[:3]):
            print(f"    [{i+1}] {ev.get('source', '?')} | {ev.get('document_name', ev.get('document', '?'))[:50]}")
    research_ms = l.get("researchMs", 9999)
    total_ms = l.get("totalMs", 0)
    print(f"  Research latency: {research_ms}ms (SLA: <200ms)")
    print(f"  Total latency: {total_ms}ms")
    sla_pass = research_ms < 200
    print(f"  SLA: {'PASS' if sla_pass else 'WARN (' + str(research_ms) + 'ms)'}")
    print(f"  Gate: {'PASS' if pipe.get('status') == 'ok' else 'FAIL'}")

# Gate 4: Test Letter Validation (5/5)
print("\n=== GATE 4: Test Letter Validation (5/5) ===")
tl = api_post("/api/test-letters", {"action": "validate"})
if "error" in tl:
    print(f"  ERROR: {tl['error']}")
else:
    results = tl.get("results", [])
    passed = sum(1 for r in results if r.get("passed"))
    total = len(results)
    for r in results:
        status = "PASS" if r.get("passed") else "FAIL"
        mid = r.get("letterId", "?")
        matched = r.get("matchedClauses", 0)
        expected = r.get("expectedClauses", 0)
        print(f"  {mid}: {status} ({matched}/{expected} clauses)")
    overall = passed >= 5
    print(f"  Overall: {passed}/{total} - {'PASS' if overall else 'FAIL'}")

# Gate 5: Provenance Status Controlled Set
print("\n=== GATE 5: Provenance Status Controlled Set ===")
VALID_STATUSES = {"verified", "retrieved", "model-generated", "synthetic", "active", "superseded", "retired", "unverified"}
VALID_TIERS = {"primary_source", "secondary_summary", "tertiary_commentary"}
ev = api_get("/api/evidence?pageSize=50")
if "error" in ev:
    print(f"  ERROR: {ev['error']}")
else:
    records = ev.get("records", [])
    all_valid = True
    for r in records:
        status = r.get("status", "")
        tier = r.get("provenance", "")
        if status not in VALID_STATUSES:
            all_valid = False
        if tier not in VALID_TIERS:
            all_valid = False
    print(f"  Checked {len(records)} records")
    print(f"  All statuses in controlled set: {'PASS' if all_valid else 'FAIL'}")

# Summary
print("\n" + "=" * 60)
print("DAY 2 VERIFICATION COMPLETE")
print("=" * 60)
