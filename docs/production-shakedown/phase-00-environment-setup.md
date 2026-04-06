# Phase 00: Environment Setup & Second-Org Provisioning

**Prefix:** `ENV`
**Depends on:** nothing (foundation phase)
**Estimated duration:** 30 min
**Agents required:** 1 (sequential, writes authoritative Org B state)

## Purpose

1. Verify production infrastructure is healthy.
2. Confirm baseline Org A state (created 2026-04-05).
3. Provision **Org B** — a second org + campaign + 5 users used for cross-tenant isolation tests in phase 03.
4. Seed minimal baseline voter/tag/list data in both orgs so downstream phases have something to exercise.
5. Publish Org B IDs + passwords to `results/phase-00-results.md` so other agents can consume them.

This phase is **stateful** — it creates data in prod that persists across subsequent phases. Phase 16 tears it down.

## Prerequisites

- Network reachability: `run.civpulse.org`, `auth.civpulse.org`, `thor.tailb56d83.ts.net:5432`
- Postgres superuser access (`psql -h thor.tailb56d83.ts.net -U postgres`)
- `kubectl` context pointing at prod cluster with `civpulse-prod` namespace
- `BYPASSRLS` already granted on `civpulse_run_prod` (done 2026-04-05, per issue #21)

---

## Section 1: Deployment Health

### ENV-HEALTH-01 | API liveness

**Purpose:** Confirm the API container is running and reachable.

**Steps:**
```bash
curl -fsS https://run.civpulse.org/health/live -o /tmp/live.json
cat /tmp/live.json | jq .
```

**Expected:**
- HTTP 200
- Response body: `{"status": "ok", "git_sha": "...", "build_timestamp": "..."}`
- `git_sha` begins with the currently-deployed short sha (check `kubectl -n civpulse-prod get deploy run-api -o jsonpath='{.spec.template.spec.containers[0].image}'`)

**Pass criteria:** HTTP 200 + status ok + git_sha matches deployed image.

---

### ENV-HEALTH-02 | API readiness (DB connectivity)

**Steps:**
```bash
curl -fsS https://run.civpulse.org/health/ready | jq .
```

**Expected:**
- HTTP 200
- `{"status": "ok", "database": "connected", "git_sha": "...", "build_timestamp": "..."}`

**Pass criteria:** `database == "connected"`.

**If FAIL:** check `kubectl -n civpulse-prod logs deploy/run-api -c run-api --tail=50` for DB connection errors.

---

### ENV-HEALTH-03 | ZITADEL OIDC discovery

**Steps:**
```bash
curl -fsS https://auth.civpulse.org/.well-known/openid-configuration | jq '{issuer, authorization_endpoint, token_endpoint, jwks_uri}'
```

**Expected:**
- HTTP 200
- `issuer == "https://auth.civpulse.org"`
- `token_endpoint == "https://auth.civpulse.org/oauth/v2/token"`
- `jwks_uri` is set

**Pass criteria:** All 4 fields present and non-empty.

---

### ENV-HEALTH-04 | Frontend bundle loads

**Steps:**
```bash
curl -fsS -o /tmp/index.html https://run.civpulse.org/
curl -fsS -w "%{http_code}\n" -o /dev/null https://run.civpulse.org/
```

**Expected:**
- HTTP 200
- `/tmp/index.html` contains `<div id="root">` or `<div id="app">` anchor
- References a JS bundle: `grep -oE "/assets/index-[A-Za-z0-9]+\.js" /tmp/index.html | head -1`

**Pass criteria:** HTTP 200 and bundle reference present.

---

### ENV-HEALTH-05 | OpenAPI schema reachable

**Steps:**
```bash
curl -fsS https://run.civpulse.org/openapi.json -o /tmp/openapi.json
jq '.info.version, (.paths | length)' /tmp/openapi.json
```

**Expected:**
- HTTP 200
- `.info.version` is a string (e.g., `"1.0.0"`)
- `.paths | length` ≥ 100 (sanity check — API surface is populated)

**Pass criteria:** Schema parses as JSON + ≥100 paths.

---

### ENV-HEALTH-06 | Unauthenticated API boundary returns 401, not 500

**Steps:**
```bash
for endpoint in \
  /api/v1/campaigns \
  /api/v1/me/orgs \
  /api/v1/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters \
  /api/v1/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/dashboard/overview
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://run.civpulse.org$endpoint")
  echo "$endpoint -> $code"
done
```

**Expected:** All four endpoints return `401` (not 500, not 200, not 403).

**Pass criteria:** All HTTP 401.

**Failure meaning:** A 500 means the auth middleware is broken. A 200 means an endpoint is missing auth (critical security bug — report as P0).

---

## Section 2: Baseline State Verification (Org A)

### ENV-BASE-01 | Verify Org A exists in ZITADEL

**Steps:**
```bash
# Use service account token to query ZITADEL
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<'PY'
import os, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
with httpx.Client(timeout=15, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization':f'Bearer {tok}', 'Content-Type':'application/json'}
    # /orgs/me returns the service account's home org
    r = c.get(f'{BASE}/management/v1/orgs/me', headers=H)
    org = r.json().get('org', {})
    print(f"id={org.get('id')} name={org.get('name')} state={org.get('state')}")
PY
```

**Expected:** `id=362268991072305186 name=CivPulse Platform state=ORG_STATE_ACTIVE`

**Pass criteria:** org ID matches exactly.

---

### ENV-BASE-02 | Verify Org A DB rows exist

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, name, zitadel_org_id FROM organizations WHERE zitadel_org_id = '362268991072305186';
SELECT id, name, type, status FROM campaigns WHERE id = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
"
```

**Expected:**
- 1 organization row: `name=CivPulse Platform`, `zitadel_org_id=362268991072305186`
- 1 campaign row: `name=QA Test Campaign`, `type=LOCAL`, `status=ACTIVE`

**Pass criteria:** Both rows present with exact values.

---

### ENV-BASE-03 | Verify 5 Org A test users active in ZITADEL

**Steps:**
```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<'PY'
import os, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
USERS = ['367278364538437701','367278367172460613','367278369538048069','367278371970744389','367278374319554629']
ROLES = ['owner','admin','manager','volunteer','viewer']
with httpx.Client(timeout=15, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization':f'Bearer {tok}', 'Content-Type':'application/json'}
    for role, uid in zip(ROLES, USERS):
        r = c.get(f'{BASE}/v2beta/users/{uid}', headers=H)
        u = r.json().get('user', {})
        h = u.get('human') or {}
        email = (h.get('email') or {}).get('email','')
        state = u.get('state','')
        print(f"  {role:10s} state={state} email={email}")
PY
```

**Expected:** All 5 users `state=USER_STATE_ACTIVE` with matching emails (`qa-owner@civpulse.org`, etc.).

**Pass criteria:** 5/5 active with correct emails.

---

### ENV-BASE-04 | Browser login test with qa-viewer (fastest role)

**Steps:** Use Playwright or an AI browser tool to log in and land on the authenticated home page.

```bash
cd web && EMAIL='qa-viewer@civpulse.org' PASSWORD='QzkzepNgk6It$!7$!MYF' ROLE='env-baseline' node smoke-test-harness.mjs > /tmp/env-baseline.json 2>&1
jq '.loginSuccess, .landingUrl' screenshots/smoke-env-baseline/result.json
```

**Expected:**
- `loginSuccess: true`
- `landingUrl: "https://run.civpulse.org/"`

**Pass criteria:** Both values match.

---

## Section 3: Provision Org B (for cross-tenant tests)

Org B is a second org in ZITADEL + backend, used to prove tenant isolation. Created with 5 users mirroring Org A's role set.

### ENV-PROV-01 | Create ZITADEL Org B

**Goal:** Create a new ZITADEL org named "QA Tenant B".

**Method:** Call ZITADEL management API to create org.

**Steps:**
```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python > /tmp/org-b-zitadel.json <<'PY'
import os, json, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
with httpx.Client(timeout=20, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization':f'Bearer {tok}', 'Content-Type':'application/json'}
    # Check if org already exists
    r = c.post(f'{BASE}/admin/v1/orgs/_search', headers=H, json={'queries':[{'nameQuery':{'name':'QA Tenant B','method':'TEXT_QUERY_METHOD_EQUALS'}}]})
    existing = r.json().get('result') or []
    if existing:
        org_id = existing[0]['id']
        print(json.dumps({'action':'already_exists','org_id':org_id,'name':existing[0].get('name')}))
    else:
        r = c.post(f'{BASE}/admin/v1/orgs', headers=H, json={'name':'QA Tenant B'})
        if r.status_code >= 300:
            print(json.dumps({'action':'error','status':r.status_code,'body':r.text[:500]}))
        else:
            data = r.json()
            print(json.dumps({'action':'created','org_id':data.get('orgId'),'name':'QA Tenant B'}))
PY
cat /tmp/org-b-zitadel.json
```

**Expected:** JSON with `action: "created"` (or `already_exists` on re-run) and an `org_id` (e.g., 20-digit snowflake).

**Record:** Save `org_id` as `${ORG_B_ZITADEL_ID}` in the results table.

**Pass criteria:** org_id returned.

---

### ENV-PROV-02 | Grant CivicPulse project to Org B (project grant)

**Why:** The CivicPulse project lives in Org A. Users in Org B need a project grant to receive role assignments.

**Steps:**
```bash
ORG_B_ZITADEL_ID="<paste from ENV-PROV-01>"
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<PY
import os, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
ORG_B = '$ORG_B_ZITADEL_ID'
PROJECT_ID = os.environ['ZITADEL_PROJECT_ID']
ALL_ROLES = ['owner','admin','manager','volunteer','viewer']
with httpx.Client(timeout=20, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization':f'Bearer {tok}', 'Content-Type':'application/json'}
    # Check for existing grant
    r = c.post(f'{BASE}/management/v1/projects/{PROJECT_ID}/grants/_search', headers=H, json={'queries':[{'grantedOrgIdQuery':{'grantedOrgId':ORG_B}}]})
    existing = r.json().get('result') or []
    if existing:
        print(f"EXISTS grant_id={existing[0]['grantId']} roles={existing[0].get('grantedRoleKeys')}")
    else:
        r = c.post(f'{BASE}/management/v1/projects/{PROJECT_ID}/grants', headers=H, json={'grantedOrgId': ORG_B, 'roleKeys': ALL_ROLES})
        print(f"CREATED status={r.status_code} body={r.text[:200]}")
PY
```

**Expected:** Grant ID returned (snowflake) with all 5 role keys allowed.

**Pass criteria:** Grant exists with role keys `[owner,admin,manager,volunteer,viewer]`.

---

### ENV-PROV-03 | Create 5 users in Org B

**Why:** Each user has a unique role for cross-tenant test coverage.

**Steps:**
```bash
ORG_B_ZITADEL_ID="<paste>"
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<PY
import os, json, secrets, string, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
ORG_B = '$ORG_B_ZITADEL_ID'
PROJECT_ID = os.environ['ZITADEL_PROJECT_ID']

def gen_pw():
    import secrets, string
    a = string.ascii_letters + string.digits + '!@#$%^&*'
    while True:
        pw = ''.join(secrets.choice(a) for _ in range(20))
        if any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw) and any(c in '!@#\$%^&*' for c in pw):
            return pw

USERS = [
    ('owner',     'QA-B', 'Owner',     'qa-b-owner@civpulse.org'),
    ('admin',     'QA-B', 'Admin',     'qa-b-admin@civpulse.org'),
    ('manager',   'QA-B', 'Manager',   'qa-b-manager@civpulse.org'),
    ('volunteer', 'QA-B', 'Volunteer', 'qa-b-volunteer@civpulse.org'),
    ('viewer',    'QA-B', 'Viewer',    'qa-b-viewer@civpulse.org'),
]

results = []
with httpx.Client(timeout=30, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization':f'Bearer {tok}', 'Content-Type':'application/json', 'x-zitadel-orgid': ORG_B}
    for role, given, family, email in USERS:
        # Search first
        q = {'queries':[{'emailQuery':{'emailAddress':email}}]}
        r = c.post(f'{BASE}/v2beta/users', headers=H, json=q)
        existing = r.json().get('result') or []
        if existing:
            uid = existing[0]['userId']
            results.append({'role':role,'email':email,'user_id':uid,'password':None,'action':'exists'})
            continue
        pw = gen_pw()
        body = {
            'username': email,
            'organization': {'orgId': ORG_B},
            'profile': {'givenName': given, 'familyName': family, 'displayName': f'{given} {family}'},
            'email': {'email': email, 'isVerified': True},
            'password': {'password': pw, 'changeRequired': False},
        }
        r = c.post(f'{BASE}/v2beta/users/human', headers=H, json=body)
        if r.status_code >= 300:
            results.append({'role':role,'email':email,'error':r.text[:300]})
            continue
        uid = r.json()['userId']
        # Grant project role
        r2 = c.post(f'{BASE}/management/v1/users/{uid}/grants', headers=H, json={'projectId': PROJECT_ID, 'roleKeys': [role]})
        results.append({'role':role,'email':email,'user_id':uid,'password':pw,'action':'created','grant_status':r2.status_code})

print(json.dumps(results, indent=2))
PY
```

**Expected:** 5 users with `action: "created"`, each with a `user_id` (snowflake) and a `password` (20-char).

**Record:** Save the full JSON output to `results/phase-00-results.md` under section "Org B Credentials". These passwords will be referenced throughout subsequent phases.

**Pass criteria:** 5 users created, each with role grant returning 200/201.

---

### ENV-PROV-04 | Seed Org B DB rows (organizations + campaigns)

**Steps:**
```bash
ORG_B_ZITADEL_ID="<paste>"
ORG_B_OWNER_USER_ID="<paste from ENV-PROV-03 owner user_id>"

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns NO FORCE ROW LEVEL SECURITY;

-- system-bootstrap user already exists from Org A setup; reuse it as created_by
INSERT INTO organizations (id, name, zitadel_org_id, created_by, created_at, updated_at)
VALUES (gen_random_uuid(), 'QA Tenant B', '$ORG_B_ZITADEL_ID', 'system-bootstrap', now(), now())
RETURNING id, name, zitadel_org_id;

INSERT INTO campaigns (id, zitadel_org_id, organization_id, name, type, status, jurisdiction_name, slug, created_by, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '$ORG_B_ZITADEL_ID',
  (SELECT id FROM organizations WHERE zitadel_org_id='$ORG_B_ZITADEL_ID'),
  'Tenant B Test Campaign',
  'LOCAL', 'ACTIVE',
  'Test Jurisdiction, GA',
  'tenant-b-test-campaign',
  'system-bootstrap',
  now(), now()
)
RETURNING id, name, slug, zitadel_org_id;

ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Expected:** Two RETURNING rows printed — one org, one campaign. Note the UUIDs.

**Record:** Save `${ORG_B_DB_ID}` (organization UUID) and `${ORG_B_CAMPAIGN_ID}` (campaign UUID).

**Pass criteria:** Both INSERTs return exactly 1 row.

---

### ENV-PROV-05 | First login for each Org B user (auto-provision memberships)

**Why:** `ensure_user_synced` creates `users`, `organization_members`, and `campaign_members` rows on first authenticated API call. We trigger it by logging in each user.

**Steps:** For each Org B user (owner, admin, manager, volunteer, viewer), perform a login via the smoke harness. This is quick since we just need the login to complete successfully.

```bash
# From records in ENV-PROV-03, extract each user's email + password and run:
for role in owner admin manager volunteer viewer; do
  email="qa-b-${role}@civpulse.org"
  password="<lookup from ENV-PROV-03 results>"
  echo "=== login as $role ==="
  cd web && EMAIL="$email" PASSWORD="$password" ROLE="org-b-$role-setup" node smoke-test-harness.mjs > "/tmp/login-$role.json" 2>&1
  jq '.loginSuccess, .landingUrl' "screenshots/smoke-org-b-$role-setup/result.json"
  cd ..
done
```

**Expected:** All 5 logins return `loginSuccess: true` and land on `https://run.civpulse.org/`.

**Pass criteria:** 5/5 logins succeed.

---

### ENV-PROV-06 | Verify Org B memberships created in DB

**Steps:**
```bash
ORG_B_DB_ID="<paste>"
ORG_B_CAMPAIGN_ID="<paste>"
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT om.role, u.email
FROM organization_members om
JOIN users u ON u.id = om.user_id
WHERE om.organization_id = '$ORG_B_DB_ID'
ORDER BY om.role;

SELECT cm.role, u.email
FROM campaign_members cm
JOIN users u ON u.id = cm.user_id
WHERE cm.campaign_id = '$ORG_B_CAMPAIGN_ID'
ORDER BY cm.role;
SQL
```

**Expected:**
- `organization_members`: 2 rows — `org_admin qa-b-admin@civpulse.org`, `org_owner qa-b-owner@civpulse.org`
  (manager/volunteer/viewer don't get org_member rows per `_JWT_ROLE_TO_ORG_ROLE` in app/api/deps.py:27)
- `campaign_members`: 5 rows — one per role: owner, admin, manager, volunteer, viewer

**Pass criteria:** 2 org_members + 5 campaign_members match expected roles.

---

## Section 4: Seed Baseline Data (both orgs)

Subsequent phases need a minimum dataset to exercise. This creates:
- 10 voters per campaign (with varied demographics)
- 1 voter tag per campaign
- 1 voter list per campaign
- 1 turf per campaign (geographic polygon)
- 1 walk list per campaign
- 1 call list per campaign
- 1 survey script per campaign
- 3 volunteer profiles per campaign

### ENV-SEED-01 | Seed voters in Org A campaign

**Steps:** Use the API (not direct DB) to exercise real write paths.

```bash
# Get a JWT for qa-owner (Org A)
# ... (see README § "Obtaining a JWT")
export TOKEN_A="<qa-owner@civpulse.org token>"
export CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248

for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
    -H "Authorization: Bearer $TOKEN_A" \
    -H "Content-Type: application/json" \
    -d "{
      \"first_name\": \"TestA$i\",
      \"last_name\": \"Voter\",
      \"birth_date\": \"1980-01-0$((i % 9 + 1))\",
      \"party\": \"$(if [ $((i % 3)) -eq 0 ]; then echo Democrat; elif [ $((i % 3)) -eq 1 ]; then echo Republican; else echo Independent; fi)\",
      \"address_line_1\": \"$((100 + i)) Test St\",
      \"city\": \"Macon\",
      \"state\": \"GA\",
      \"zip_code\": \"31201\"
    }" | jq '.id, .first_name'
done
```

**Expected:** 10 voter rows created, each returning a UUID id + first_name matching `TestA1`...`TestA10`.

**Pass criteria:** 10/10 creation calls return HTTP 201.

---

### ENV-SEED-02 | Seed voters in Org B campaign

**Steps:** Same pattern as ENV-SEED-01 but use `$TOKEN_B` (qa-b-owner) and `$CAMPAIGN_B`, with first_name prefix `TestB`.

**Expected:** 10 voter rows in Org B's campaign with first_name `TestB1`...`TestB10`.

**Pass criteria:** 10/10 creation calls return HTTP 201.

---

### ENV-SEED-03 | Create 1 voter tag per campaign

**Steps:**
```bash
# Org A
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voter-tags" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"name": "HighPropensity", "color": "blue"}' | jq .

# Org B
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/voter-tags" \
  -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" \
  -d '{"name": "HighPropensity", "color": "blue"}' | jq .
```

**Expected:** 1 tag per campaign, each returning a UUID id.

**Pass criteria:** Both return HTTP 201.

---

### ENV-SEED-04 | Create 1 voter list per campaign (static list with 5 voters)

**Steps:** Create list, then add voters via the list membership endpoint.

```bash
# For each org, create a list; populate with 5 voters (pick from ENV-SEED-01/02 voter IDs).
# Use: POST /api/v1/campaigns/{id}/voter-lists  (body: name, description, is_dynamic=false)
# Then: POST /api/v1/campaigns/{id}/voter-lists/{list_id}/members  (body: voter_ids=[...])
```

Script:
```bash
VOTER_IDS_A=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?page_size=5" | jq -r '.items[].id' | head -5)
LIST_ID_A=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voter-lists" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"name":"QA Seed List","description":"Phase 00 baseline","is_dynamic":false}' | jq -r .id)
echo "List ID: $LIST_ID_A"
```

Then POST members.

**Expected:** 1 list per campaign with 5 voter members.

**Pass criteria:** List + members endpoints all return HTTP 2xx.

---

### ENV-SEED-05 | Create 1 turf per campaign (small polygon)

**Steps:**
```bash
# Simple triangular polygon over Macon, GA
GEOJSON='{
  "type": "Polygon",
  "coordinates": [[[-83.640,32.840],[-83.630,32.840],[-83.635,32.850],[-83.640,32.840]]]
}'

# Org A
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"QA Turf A\",\"geometry\":$GEOJSON}" | jq .
```

**Expected:** 1 turf per campaign with a geometry field.

**Pass criteria:** Both POSTs return HTTP 201 with a turf id.

---

### ENV-SEED-06 | Create 1 walk list, 1 call list, 1 survey script per campaign

Follow each endpoint's schema:
- Walk list: `POST /api/v1/campaigns/{id}/walk-lists` with `{name, turf_id, voter_list_id?}`
- Call list: `POST /api/v1/campaigns/{id}/call-lists` with `{name, voter_list_id}`
- Survey: `POST /api/v1/campaigns/{id}/surveys` with `{name, description, is_active: true}`

**Expected:** 1 of each per campaign (6 rows total across both orgs).

**Pass criteria:** All 6 creation calls return HTTP 201.

---

### ENV-SEED-07 | Seed 3 volunteer profiles per campaign

**Steps:**
```bash
for i in 1 2 3; do
  curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers" \
    -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
    -d "{\"first_name\":\"Vol$i\",\"last_name\":\"Test\",\"email\":\"vol$i.a@civpulse.test\"}" | jq .id
done
# Repeat for Org B with emails vol1.b@, vol2.b@, vol3.b@
```

**Expected:** 3 volunteer rows per campaign.

**Pass criteria:** 6/6 POSTs return HTTP 201.

---

## Section 5: Isolation sanity check (pre-phase-03)

### ENV-ISOL-01 | Confirm Org A owner cannot see Org B campaign in list

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  https://run.civpulse.org/api/v1/campaigns | jq '.items[].id'
```

**Expected:** List contains `06d710c8-32ce-44ae-bbab-7fcc72aab248` (QA Test Campaign) but NOT `${ORG_B_CAMPAIGN_ID}`.

**Pass criteria:** qa-owner's campaign list does NOT include Org B's campaign UUID.

**Failure meaning:** Critical isolation leak — escalate immediately (P0).

---

### ENV-ISOL-02 | Confirm Org B owner cannot see Org A campaign in list

**Steps:** Same as ENV-ISOL-01, but with `$TOKEN_B`.

**Expected:** List contains `${ORG_B_CAMPAIGN_ID}` but NOT `06d710c8-32ce-44ae-bbab-7fcc72aab248`.

**Pass criteria:** qa-b-owner's campaign list does NOT include Org A's campaign UUID.

**Failure meaning:** Critical isolation leak — escalate immediately (P0).

---

## Results Template

Save a filled-in copy of this section to `results/phase-00-results.md`.

### Health checks

| Test ID | Result | Notes |
|---|---|---|
| ENV-HEALTH-01 | | |
| ENV-HEALTH-02 | | |
| ENV-HEALTH-03 | | |
| ENV-HEALTH-04 | | |
| ENV-HEALTH-05 | | |
| ENV-HEALTH-06 | | |

### Baseline verification (Org A)

| Test ID | Result | Notes |
|---|---|---|
| ENV-BASE-01 | | |
| ENV-BASE-02 | | |
| ENV-BASE-03 | | |
| ENV-BASE-04 | | |

### Org B provisioning

| Test ID | Result | Notes |
|---|---|---|
| ENV-PROV-01 | | `${ORG_B_ZITADEL_ID}` = ___ |
| ENV-PROV-02 | | Grant ID = ___ |
| ENV-PROV-03 | | 5 user IDs + passwords recorded below |
| ENV-PROV-04 | | `${ORG_B_DB_ID}` = ___; `${ORG_B_CAMPAIGN_ID}` = ___ |
| ENV-PROV-05 | | |
| ENV-PROV-06 | | |

### Baseline seed

| Test ID | Result | Notes |
|---|---|---|
| ENV-SEED-01 | | |
| ENV-SEED-02 | | |
| ENV-SEED-03 | | |
| ENV-SEED-04 | | |
| ENV-SEED-05 | | |
| ENV-SEED-06 | | |
| ENV-SEED-07 | | |

### Isolation sanity

| Test ID | Result | Notes |
|---|---|---|
| ENV-ISOL-01 | | |
| ENV-ISOL-02 | | |

### Org B credentials (persist these — other phases need them)

| Role | Email | Password | ZITADEL User ID |
|---|---|---|---|
| owner | qa-b-owner@civpulse.org | | |
| admin | qa-b-admin@civpulse.org | | |
| manager | qa-b-manager@civpulse.org | | |
| volunteer | qa-b-volunteer@civpulse.org | | |
| viewer | qa-b-viewer@civpulse.org | | |

### Summary

- Total tests: 21
- PASS: ___ / 21
- FAIL: ___ / 21
- SKIP: ___ / 21
- BLOCKED: ___ / 21

**Launch-blocking:** Any FAIL here is a P0 blocker — downstream phases cannot proceed.

## Cleanup

This phase creates persistent state. DO NOT tear down at end of phase — phases 01-15 depend on this state. Phase 16 handles cleanup.
