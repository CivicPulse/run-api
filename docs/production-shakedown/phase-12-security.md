# Phase 12: Security

**Prefix:** `SEC`
**Depends on:** phase-00, phase-01
**Estimated duration:** 40 min
**Agents required:** 1

## Purpose

Exhaustively probe the production API and web surface for common web-security vulnerabilities: SQL injection, XSS, CSRF, input-validation bypass, authentication bypass, file-upload abuse, rate-limit evasion, information disclosure, open redirect, and weak TLS. Every test in this phase is a **negative test** — the expected outcome is safe rejection (4xx, escaped output, no data leakage), and a successful exploit is a **P0 launch blocker**.

## Threat model

An unauthenticated or low-privileged attacker with knowledge of public UUIDs and the public OpenAPI schema attempts to:
1. Exfiltrate data via SQL injection.
2. Inject client-side scripts (XSS) into stored fields or reflected routes.
3. Forge authentication tokens or replay expired ones.
4. Abuse file upload to plant malware or pivot.
5. Enumerate cross-tenant existence via timing / status-code diffs.
6. Discover unprotected admin or debug endpoints.

## Prerequisites

- Phase 00 complete (Org A + Org B live, seed data populated)
- Phase 01 complete (JWTs obtainable for all test users)
- `$TOKEN_A` = valid JWT for qa-owner@civpulse.org
- `$TOKEN_B` = valid JWT for qa-b-owner@civpulse.org
- `${ORG_A_CAMPAIGN_ID}` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`
- `curl`, `jq`, Playwright installed
- Ability to write files to `/tmp`

---

## Section 1: SQL Injection Probes

Purpose: prove that every user-controlled input is parameterised, and that no payload causes a 500, DB modification, or row-level leak.

### SEC-SQLI-01 | Classic OR-1=1 in voter search query param

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "search=' OR 1=1--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"
jq '.items | length' /tmp/body.json
```

**Expected:** HTTP 200 or 422. If 200, `items.length` equals the count returned for an empty search (no row expansion). No 500.

**Pass criteria:** Non-500 status + no more rows than a legitimate empty search returns.

**Failure meaning:** P0 — SQL injection via query param.

---

### SEC-SQLI-02 | DROP TABLE payload in voter search

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "search='; DROP TABLE voters--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"

# Verify table still intact
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT count(*) FROM voters WHERE campaign_id='$ORG_A_CAMPAIGN_ID';"
```

**Expected:** Non-500 status AND voter count unchanged.

**Pass criteria:** `voters` table still has the pre-test row count.

**Failure meaning:** P0 — destructive SQLi.

---

### SEC-SQLI-03 | UNION SELECT probe in voter search

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "search=' UNION SELECT null,null,null,null,null--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"
cat /tmp/body.json | head -c 500
```

**Expected:** Non-500. Response either 200 with empty items or 422 validation error.

**Pass criteria:** No column data leaked, no DB error messages surfaced.

---

### SEC-SQLI-04 | Time-based blind injection (pg_sleep)

**Steps:**
```bash
# Baseline latency
time curl -sS -o /dev/null -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"

# Injection attempt
time curl -sS -o /dev/null -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "search=' AND pg_sleep(5)--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"
```

**Expected:** Injection request completes within baseline latency + ~200 ms (no 5 s sleep triggered).

**Pass criteria:** Delta between baseline and injection < 1 s.

**Failure meaning:** P0 — blind time-based SQLi possible.

---

### SEC-SQLI-05 | Quote-escape in voter first_name body field (POST)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d "{\"first_name\":\"Robert'); DROP TABLE voters;--\",\"last_name\":\"Tables\",\"address_line_1\":\"1 Test St\",\"city\":\"Macon\",\"state\":\"GA\",\"zip_code\":\"31201\"}"
cat /tmp/body.json

# Verify voters table still has rows
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT count(*) FROM voters WHERE campaign_id='$ORG_A_CAMPAIGN_ID';"
```

**Expected:** 201 Created (payload stored literally) OR 422. `voters` table intact; the created row's `first_name` equals the raw payload string.

**Pass criteria:** Row count not reduced; new voter (if created) has the literal payload stored, not executed.

---

### SEC-SQLI-06 | Injection in path param (voter UUID segment)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/1'%20OR%20'1'='1"
cat /tmp/body.json
```

**Expected:** HTTP 422 (UUID validation error) or 404.

**Pass criteria:** Non-2xx, non-500. No voter row returned.

---

### SEC-SQLI-07 | Injection in UUID campaign path segment

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/00000000-0000-0000-0000-000000000000'%20OR%20'1'='1/voters"
```

**Expected:** HTTP 422 (UUID validation) or 404.

**Pass criteria:** Non-500; no voter data returned.

---

### SEC-SQLI-08 | Injection in pagination cursor

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "cursor=abc' OR 1=1--" --data-urlencode "page_size=10" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"
```

**Expected:** 400/422 (invalid cursor) or 200 with empty items. No 500.

**Pass criteria:** Non-500 and no cross-campaign leak.

---

### SEC-SQLI-09 | Injection in voter-tags name filter

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "name=' OR 1=1--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags"
```

**Expected:** Non-500; no cross-campaign tag rows returned.

**Pass criteria:** No rows beyond those belonging to `$ORG_A_CAMPAIGN_ID`.

---

### SEC-SQLI-10 | Injection in ORDER BY (sort param)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  --get --data-urlencode "sort=last_name; DROP TABLE voters--" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters"
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT count(*) FROM voters;"
```

**Expected:** 400/422 (invalid sort field) or 200. Table unchanged.

**Pass criteria:** Non-500 + voters table count unchanged.

---

### SEC-SQLI-11 | No DB error text leaked on bad input

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/not-a-uuid/voters"
cat /tmp/body.json
```

**Expected:** 422 with generic validation error. Body must NOT contain: `psycopg`, `asyncpg`, `SQLSTATE`, `relation`, `column`, raw SQL fragments.

**Pass criteria:** No DB internals in response body.

---

## Section 2: XSS Probes

### SEC-XSS-01 | Stored XSS via voter first_name

**Steps:**
```bash
PAYLOAD='<script>window.__pwned=1</script>'
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d "{\"first_name\":\"$PAYLOAD\",\"last_name\":\"XSS\",\"address_line_1\":\"1 Test St\",\"city\":\"Macon\",\"state\":\"GA\",\"zip_code\":\"31201\"}"
VOTER_ID=$(jq -r .id /tmp/body.json)
echo "Created voter id=$VOTER_ID"
```

Then render in UI via Playwright and check for `window.__pwned`:
```bash
cd web && TOKEN="$TOKEN_A" VOTER_ID="$VOTER_ID" CAMPAIGN_ID="$ORG_A_CAMPAIGN_ID" node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(\`https://run.civpulse.org/campaigns/\${process.env.CAMPAIGN_ID}/voters/\${process.env.VOTER_ID}\`);
  // login then wait for voter detail; then:
  const pwned = await p.evaluate(() => window.__pwned);
  console.log('pwned=', pwned);
  await b.close();
})();
"
```

**Expected:** API stores literal text; UI renders `<script>...</script>` escaped as text. `window.__pwned` is `undefined`.

**Pass criteria:** Script did NOT execute in browser.

**Failure meaning:** P0 — stored XSS.

---

### SEC-XSS-02 | Stored XSS via voter last_name with img onerror

**Steps:**
```bash
PAYLOAD='<img src=x onerror="window.__xss2=1">'
curl -sS -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"first_name\":\"XSS\",\"last_name\":\"$PAYLOAD\",\"address_line_1\":\"1 T\",\"city\":\"Macon\",\"state\":\"GA\",\"zip_code\":\"31201\"}" | jq .id
```
Then render in UI and check `window.__xss2` is undefined.

**Expected:** Payload is escaped on render; `window.__xss2` undefined.

**Pass criteria:** No JS execution.

---

### SEC-XSS-03 | Stored XSS via campaign name

**Steps:**
```bash
curl -sS -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>","type":"LOCAL","jurisdiction_name":"Test"}' | jq .
```
View campaign list in browser.

**Expected:** Campaign name rendered as escaped text, no alert fires.

**Pass criteria:** No JS execution; campaign dropdown/list shows literal `<script>...`.

---

### SEC-XSS-04 | Stored XSS via voter notes / tag name / survey question text

**Steps:** POST payloads `<svg onload=alert(1)>`, `"><script>alert(1)</script>`, `javascript:alert(1)` to:
- `voter-tags.name`
- `voter-interactions.notes`
- `surveys.name` / `questions.text`
- `turfs.name`
- `walk_lists.name`

For each, render the containing UI screen and verify no alert fires and payload appears escaped.

**Expected:** All payloads stored literally; none execute.

**Pass criteria:** No JS execution across 5+ render contexts.

---

### SEC-XSS-05 | Reflected XSS via query parameter

**Steps:** Navigate browser to:
```
https://run.civpulse.org/campaigns/$ORG_A_CAMPAIGN_ID/voters?search=<script>window.__reflect=1</script>
```
Then evaluate `window.__reflect`.

**Expected:** `undefined`.

**Pass criteria:** Payload visible in the search input as text; not executed.

---

### SEC-XSS-06 | Reflected XSS via URL fragment (#)

**Steps:** Navigate to `https://run.civpulse.org/#<img src=x onerror=alert(1)>` and verify no alert fires.

**Expected:** Fragment ignored by router; no alert.

**Pass criteria:** No JS execution.

---

### SEC-XSS-07 | DOM-based XSS via route parameter

**Steps:** Navigate to `https://run.civpulse.org/campaigns/javascript:alert(1)/voters` and verify no alert.

**Expected:** Router rejects or URL-encodes; 404 page renders; no alert.

**Pass criteria:** No JS execution.

---

### SEC-XSS-08 | Content-Security-Policy header present

**Steps:**
```bash
curl -sS -I https://run.civpulse.org/ | grep -i 'content-security-policy\|x-content-type-options\|x-frame-options'
```

**Expected:** At minimum: `X-Content-Type-Options: nosniff` and either `X-Frame-Options: DENY/SAMEORIGIN` or a `frame-ancestors` CSP directive.

**Pass criteria:** Anti-clickjacking header present.

---

### SEC-XSS-09 | Dangerous attribute injection (formaction, srcdoc)

**Steps:** POST voter with first_name `" formaction=javascript:alert(1) x="` and render.

**Expected:** No JS execution; attribute injection prevented by safe rendering.

**Pass criteria:** No alert fires.

---

## Section 3: CSRF

### SEC-CSRF-01 | State-changing POST from forged Origin header

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -H "Origin: https://evil.example.com" \
  -H "Referer: https://evil.example.com/attack" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags" \
  -d '{"name":"CSRFTag","color":"red"}'
cat /tmp/body.json
```

**Expected:** Request succeeds IF API relies solely on Bearer token auth (no cookie auth). If cookie auth exists, expect 403.

**Pass criteria:** Document behaviour. Since API is Bearer-only, Origin check is not required — but note whether CORS preflight (see next test) blocks browsers.

---

### SEC-CSRF-02 | CORS preflight rejects evil origin

**Steps:**
```bash
curl -sS -i -X OPTIONS "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" | grep -i 'access-control-allow-origin'
```

**Expected:** `Access-Control-Allow-Origin` header is absent OR matches only `https://run.civpulse.org`. Never `*` combined with credentials, never echoes `evil.example.com`.

**Pass criteria:** Evil origin not echoed back.

---

### SEC-CSRF-03 | CORS preflight allows legitimate origin

**Steps:**
```bash
curl -sS -i -X OPTIONS "https://run.civpulse.org/api/v1/campaigns" \
  -H "Origin: https://run.civpulse.org" \
  -H "Access-Control-Request-Method: GET" | grep -i 'access-control-allow-origin'
```

**Expected:** `Access-Control-Allow-Origin: https://run.civpulse.org`.

**Pass criteria:** Legit origin allowed.

---

## Section 4: Input Validation Boundaries

### SEC-INPUT-01 | Oversized JSON body (10 MB)

**Steps:**
```bash
python -c "import json; print(json.dumps({'first_name':'A','last_name':'B','address_line_1':'X'*(10*1024*1024),'city':'Macon','state':'GA','zip_code':'31201'}))" > /tmp/huge.json
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  --data-binary @/tmp/huge.json
```

**Expected:** HTTP 413 (Payload Too Large) or 422. Not 500, not 200.

**Pass criteria:** Request rejected; API pod not OOM-killed (check `kubectl -n civpulse-prod get pods`).

---

### SEC-INPUT-02 | Null byte in string field

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"Null\u0000Byte","last_name":"Test","address_line_1":"1 T","city":"Macon","state":"GA","zip_code":"31201"}'
cat /tmp/body.json
```

**Expected:** 422 OR 201 with null byte stripped/escaped. No 500.

**Pass criteria:** Non-500, no DB error leaked.

---

### SEC-INPUT-03 | Unicode RTL override / zero-width / emoji

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"Jo\u202ehn\u200b \ud83d\ude00","last_name":"Unicode","address_line_1":"1 T","city":"Macon","state":"GA","zip_code":"31201"}'
```

**Expected:** 201 Created; name stored verbatim.

**Pass criteria:** Non-500, no encoding error.

---

### SEC-INPUT-04 | Negative page_size

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters?page_size=-1"
```

**Expected:** 422.

**Pass criteria:** 422 validation error.

---

### SEC-INPUT-05 | Integer overflow page_size

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters?page_size=9999999999"
```

**Expected:** 422.

**Pass criteria:** Non-500; no pagination run with overflow value.

---

### SEC-INPUT-06 | Future birth_date

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"Fut","last_name":"Ure","birth_date":"2099-12-31","address_line_1":"1 T","city":"Macon","state":"GA","zip_code":"31201"}'
cat /tmp/body.json
```

**Expected:** 422 validation error (birth_date cannot be in future).

**Pass criteria:** 422; if 201, record as P2 validation gap.

---

### SEC-INPUT-07 | Oversized string (first_name 500 chars)

**Steps:**
```bash
LONG=$(python -c "print('A'*500)")
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d "{\"first_name\":\"$LONG\",\"last_name\":\"Long\",\"address_line_1\":\"1 T\",\"city\":\"Macon\",\"state\":\"GA\",\"zip_code\":\"31201\"}"
```

**Expected:** 422 (length exceeded) or silent truncation to column limit. No 500.

**Pass criteria:** Non-500. If 201, verify stored value equals column limit.

---

### SEC-INPUT-08 | Empty required array

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-lists/$VOTER_LIST_A/members" \
  -d '{"voter_ids":[]}'
```

**Expected:** 422 or 200 no-op.

**Pass criteria:** Non-500.

---

### SEC-INPUT-09 | Array with 10 000 items (bulk membership)

**Steps:**
```bash
python -c "import json; print(json.dumps({'voter_ids':['00000000-0000-0000-0000-000000000000']*10000}))" > /tmp/bulk.json
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-lists/$VOTER_LIST_A/members" \
  --data-binary @/tmp/bulk.json
```

**Expected:** 422 (size limit) or 200 with processing. Not 500.

**Pass criteria:** Non-500 and response time < 30 s.

---

### SEC-INPUT-10 | Malformed JSON (trailing comma)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"X","last_name":"Y",}'
```

**Expected:** 400 Bad Request.

**Pass criteria:** 400.

---

### SEC-INPUT-11 | Single-quoted JSON keys

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d "{'first_name':'X'}"
```

**Expected:** 400.

**Pass criteria:** 400.

---

### SEC-INPUT-12 | Wrong Content-Type (text/plain on JSON endpoint)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: text/plain" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"X","last_name":"Y"}'
```

**Expected:** 415 Unsupported Media Type or 422.

**Pass criteria:** Non-2xx, non-500.

---

### SEC-INPUT-13 | Unexpected extra JSON keys

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  -d '{"first_name":"X","last_name":"Y","address_line_1":"1","city":"Macon","state":"GA","zip_code":"31201","is_admin":true,"campaign_id":"'"$ORG_B_CAMPAIGN_ID"'"}'
cat /tmp/body.json
```

**Expected:** 201 with extra keys silently ignored. Verify created voter's `campaign_id` = `$ORG_A_CAMPAIGN_ID` (NOT Org B's).

**Pass criteria:** Extra keys do not override path-derived fields.

**Failure meaning:** P0 if `campaign_id` from body overrode path.

---

### SEC-INPUT-14 | Deeply nested JSON (JSON bomb)

**Steps:**
```bash
python -c "
import json
o = 'x'
for _ in range(1000):
    o = {'n': o}
print(json.dumps({'first_name': 'X', 'last_name': 'Y', 'extra': o}))
" > /tmp/deep.json
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters" \
  --data-binary @/tmp/deep.json
```

**Expected:** 422 or 400; not 500; pod stays alive.

**Pass criteria:** Non-500, no OOM.

---

## Section 5: Authentication Bypass

### SEC-AUTH-01 | JWT with `alg: none`

**Steps:**
```bash
# Construct unsigned JWT
HEADER=$(echo -n '{"alg":"none","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
PAYLOAD=$(echo -n '{"sub":"367278364538437701","iss":"https://auth.civpulse.org","aud":"364255312682745892","exp":9999999999}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
NONE_TOKEN="$HEADER.$PAYLOAD."
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $NONE_TOKEN" \
  "https://run.civpulse.org/api/v1/users/me"
```

**Expected:** 401 Unauthorized.

**Pass criteria:** 401.

**Failure meaning:** P0 — alg:none accepted.

---

### SEC-AUTH-02 | JWT with forged `kid` pointing to external URL

**Steps:** Craft a JWT with header `{"alg":"RS256","kid":"https://evil.com/key.json"}` and a self-signed payload. POST to `/api/v1/users/me`.

**Expected:** 401.

**Pass criteria:** 401; no outbound request to evil.com (check pod egress logs).

---

### SEC-AUTH-03 | JWT signed with HMAC using public RSA key (alg confusion)

**Steps:**
```bash
# Fetch JWKS public key, use as HMAC secret, sign HS256 token
# Then attempt to use it
curl -sS https://auth.civpulse.org/oauth/v2/keys > /tmp/jwks.json
# (Construct HS256 token with n-value from jwks as the secret)
# ... POST token
```

**Expected:** 401.

**Pass criteria:** 401 — backend enforces RS256 only.

---

### SEC-AUTH-04 | Replay of expired token

**Steps:** Capture a valid token, wait for it to expire (or use a token captured > 1 h ago), retry.

```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $EXPIRED_TOKEN" \
  "https://run.civpulse.org/api/v1/users/me"
```

**Expected:** 401.

**Pass criteria:** 401.

---

### SEC-AUTH-05 | Token from revoked session

**Steps:** Log in as qa-viewer, capture token, log out via `end_session_endpoint`, retry token.

**Expected:** 401 (token should be invalidated on logout) OR 200 if ZITADEL doesn't revoke short-lived tokens. Document actual behaviour.

**Pass criteria:** Behaviour documented; if tokens remain valid, verify TTL ≤ 1 h.

---

### SEC-AUTH-06 | Token issued for different `aud`

**Steps:** Obtain a token with `aud` claim for a different ZITADEL client and attempt to use it.

**Expected:** 401.

**Pass criteria:** 401 — aud claim verified.

---

### SEC-AUTH-07 | Empty Authorization header

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: " \
  "https://run.civpulse.org/api/v1/users/me"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer " \
  "https://run.civpulse.org/api/v1/users/me"
```

**Expected:** Both 401.

**Pass criteria:** Both 401, non-500.

---

## Section 6: File Upload Security

### SEC-UPLOAD-01 | Upload non-CSV file with .csv extension

**Steps:**
```bash
echo '<?php system($_GET["c"]); ?>' > /tmp/evil.csv
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/evil.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
cat /tmp/body.json
```

**Expected:** 400/422 — invalid CSV format. File contents never executed.

**Pass criteria:** Rejected as malformed CSV.

---

### SEC-UPLOAD-02 | Oversized CSV (> 100 MB)

**Steps:**
```bash
python -c "
print('first_name,last_name,address_line_1,city,state,zip_code')
for i in range(2_000_000):
    print(f'A{i},B{i},1 T,Macon,GA,31201')
" > /tmp/huge.csv
ls -lh /tmp/huge.csv
curl -sS -o /tmp/body.json -w "%{http_code}\n" --max-time 60 \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/huge.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
```

**Expected:** 413 or 400 (size-limit exceeded). Pod not OOM-killed.

**Pass criteria:** Request rejected within configured limit; API pod still Ready.

---

### SEC-UPLOAD-03 | CSV with Excel formula injection

**Steps:**
```bash
cat > /tmp/formula.csv <<'CSV'
first_name,last_name,address_line_1,city,state,zip_code
=cmd|'/c calc'!A1,Formula,1 T,Macon,GA,31201
+SUM(1+1),Injection,1 T,Macon,GA,31201
@evilSUM(A1),Inject,1 T,Macon,GA,31201
-cmd|'/c calc'!A1,Inject,1 T,Macon,GA,31201
CSV
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/formula.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
cat /tmp/body.json
```

Then download the exported CSV (if the app supports export) and verify that formula-leading cells are escaped with a leading `'` or are refused on export.

**Expected:** Import succeeds (stored as literal text). Export (if present) prefixes formula cells with `'`.

**Pass criteria:** Exported CSV cannot execute formulas in Excel.

---

### SEC-UPLOAD-04 | Path traversal in filename

**Steps:**
```bash
cp /tmp/formula.csv "/tmp/../../../../etc/passwd.csv" 2>/dev/null || true
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F 'file=@/tmp/formula.csv;filename=../../../../etc/passwd.csv' \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
# Verify no file created outside app sandbox
kubectl -n civpulse-prod exec deploy/run-api -c run-api -- ls -la /etc/passwd.csv 2>&1 | grep -q 'No such file' && echo "SAFE"
```

**Expected:** Filename sanitised; no file written outside upload scratch dir.

**Pass criteria:** `/etc/passwd.csv` does not exist in API container.

---

### SEC-UPLOAD-05 | Mismatched Content-Type

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F 'file=@/tmp/formula.csv;type=application/x-executable' \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
```

**Expected:** 400/415 or ignored (API should sniff content, not trust header).

**Pass criteria:** Non-500; no executable stored.

---

### SEC-UPLOAD-06 | Binary garbage as CSV

**Steps:**
```bash
head -c 10000 /dev/urandom > /tmp/garbage.csv
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/garbage.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
```

**Expected:** 400/422 — cannot parse as CSV.

**Pass criteria:** Non-500; clear error message.

---

## Section 7: Rate Limiting

### SEC-RATE-01 | Burst 100 requests single IP, single token

**Steps:**
```bash
for i in $(seq 1 100); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org/api/v1/users/me" &
done | sort | uniq -c
wait
```

**Expected:** Mix of 200 and 429 (if rate limit set). Or all 200 (if no rate limit — document).

**Pass criteria:** No 500s; rate-limit behaviour documented.

---

### SEC-RATE-02 | Sustained 1000 requests / 10 s (hammer)

**Steps:**
```bash
seq 1 1000 | xargs -P 50 -I{} curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/users/me" > /tmp/rate.txt
sort /tmp/rate.txt | uniq -c
```

**Expected:** Significant fraction return 429 at some threshold. API remains reachable (no connection refused).

**Pass criteria:** 429s observed OR API remains healthy; no 500s.

---

### SEC-RATE-03 | Rate limit resets after cooldown

**Steps:** Run SEC-RATE-02, wait 60 s, re-run a single request.

**Expected:** 200 after cooldown.

**Pass criteria:** Single request after cooldown returns 200.

---

### SEC-RATE-04 | Unauthenticated rate limit (login brute-force)

**Steps:**
```bash
seq 1 50 | xargs -P 10 -I{} curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://auth.civpulse.org/oauth/v2/token" \
  -d "grant_type=password&username=qa-owner@civpulse.org&password=wrong{}" | sort | uniq -c
```

**Expected:** 400s/429s; ZITADEL rate-limits auth endpoints.

**Pass criteria:** No infinite retry window; 429s observed.

---

## Section 8: Information Disclosure

### SEC-INFO-01 | 500 errors do not leak stack traces

**Steps:**
```bash
# Try to provoke a 500 with malformed UUID followed by injection
curl -sS -o /tmp/body.json \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/%00"
cat /tmp/body.json
```

**Expected:** 400/422; no `Traceback`, no file paths (`/home/app/...`), no `sqlalchemy`, no `asyncpg` strings.

**Pass criteria:** No stack-trace tokens in body.

---

### SEC-INFO-02 | Cross-tenant 404 vs 403 uniformity

**Steps:**
```bash
# GET non-existent UUID
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/00000000-0000-0000-0000-000000000000"

# GET Org B's real UUID (exists but forbidden)
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID"
```

**Expected:** Both return the same status code (either both 404 or both 403). Differing codes let attackers enumerate existence.

**Pass criteria:** Identical status codes.

---

### SEC-INFO-03 | OpenAPI docs / Swagger UI exposure

**Steps:**
```bash
for path in /docs /redoc /api/docs /swagger /openapi.json; do
  echo -n "$path -> "
  curl -sS -o /dev/null -w "%{http_code}\n" "https://run.civpulse.org$path"
done
```

**Expected:** Either all 401/404 (docs disabled in prod) OR `openapi.json` 200 and `/docs` 401. Decide policy and document.

**Pass criteria:** Interactive docs (`/docs`) not world-readable in prod, OR explicit decision to leave open.

---

### SEC-INFO-04 | Framework / version headers absent

**Steps:**
```bash
curl -sS -I https://run.civpulse.org/api/v1/users/me -H "Authorization: Bearer $TOKEN_A" | grep -iE 'x-powered-by|server|x-runtime'
```

**Expected:** No `X-Powered-By`; `Server` header is generic (e.g., `uvicorn` acceptable, but not with full version).

**Pass criteria:** No `X-Powered-By`; no language/framework version leaked.

---

### SEC-INFO-05 | Health endpoint does not leak DB host

**Steps:**
```bash
curl -sS https://run.civpulse.org/health/ready | jq .
```

**Expected:** Contains `status`, `database: connected`, `git_sha`. NOT DB host, port, user, or password.

**Pass criteria:** No DSN / credentials in body.

---

### SEC-INFO-06 | 401 response does not echo token

**Steps:**
```bash
curl -sS -H "Authorization: Bearer secret-token-12345" \
  https://run.civpulse.org/api/v1/users/me
```

**Expected:** 401 body does not contain `secret-token-12345`.

**Pass criteria:** Token not echoed.

---

### SEC-INFO-07 | Debug endpoints not exposed

**Steps:**
```bash
for path in /debug /debug/vars /metrics /admin /console /.env /.git/config; do
  echo -n "$path -> "
  curl -sS -o /dev/null -w "%{http_code}\n" "https://run.civpulse.org$path"
done
```

**Expected:** All 401/404.

**Pass criteria:** No debug surface returns 200 with sensitive payload.

---

## Section 9: Open Redirect

### SEC-REDIR-01 | Login callback `redirect` param points at evil.com

**Steps:**
```bash
curl -sS -I "https://run.civpulse.org/callback?redirect=https://evil.example.com&code=X&state=Y" | grep -i location
```

**Expected:** Either 400/200 OR `Location:` points to a same-origin URL, never `evil.example.com`.

**Pass criteria:** No redirect to external origin.

---

### SEC-REDIR-02 | Login `next` param with javascript: scheme

**Steps:** Navigate browser to `https://run.civpulse.org/?next=javascript:alert(1)` and complete login.

**Expected:** Post-login navigates to `/` (safe default), not `javascript:`.

**Pass criteria:** No alert fires, no `javascript:` navigation.

---

### SEC-REDIR-03 | `next` param with `//evil.com` (protocol-relative)

**Steps:** Navigate to `https://run.civpulse.org/?next=//evil.example.com/pwn`.

**Expected:** Navigates to `/` or same-origin `/evil.example.com/pwn` (treated as path). Not a cross-origin redirect.

**Pass criteria:** Post-login URL is same-origin.

---

### SEC-REDIR-04 | Double-encoded redirect

**Steps:** Navigate to `https://run.civpulse.org/?next=%2F%2Fevil.example.com`.

**Expected:** Same-origin landing.

**Pass criteria:** No cross-origin redirect.

---

## Section 10: HTTPS / TLS

### SEC-TLS-01 | HTTP redirects to HTTPS

**Steps:**
```bash
curl -sS -I -o /dev/null -w "%{http_code} %{redirect_url}\n" http://run.civpulse.org/
```

**Expected:** 301/308 to `https://run.civpulse.org/`.

**Pass criteria:** Redirect target uses https scheme.

---

### SEC-TLS-02 | HSTS header present with adequate max-age

**Steps:**
```bash
curl -sS -I https://run.civpulse.org/ | grep -i strict-transport-security
```

**Expected:** `Strict-Transport-Security: max-age=31536000; includeSubDomains` (or longer).

**Pass criteria:** HSTS present with max-age ≥ 15552000 (180 days).

---

### SEC-TLS-03 | TLS version ≥ 1.2 enforced

**Steps:**
```bash
# Try TLS 1.0 and 1.1 (should fail)
curl --tlsv1.0 --tls-max 1.0 -sS -o /dev/null -w "%{http_code}\n" https://run.civpulse.org/ 2>&1 || echo "TLS 1.0 rejected"
curl --tlsv1.1 --tls-max 1.1 -sS -o /dev/null -w "%{http_code}\n" https://run.civpulse.org/ 2>&1 || echo "TLS 1.1 rejected"
# TLS 1.2 should work
curl --tlsv1.2 -sS -o /dev/null -w "%{http_code}\n" https://run.civpulse.org/
```

**Expected:** TLS 1.0/1.1 connection refused; TLS 1.2/1.3 succeeds.

**Pass criteria:** Legacy protocols rejected.

---

### SEC-TLS-04 | Certificate is valid and not self-signed

**Steps:**
```bash
echo | openssl s_client -servername run.civpulse.org -connect run.civpulse.org:443 2>/dev/null | openssl x509 -noout -issuer -dates -subject
```

**Expected:** Trusted issuer (Let's Encrypt, DigiCert, etc.); `notAfter` > today + 7 days.

**Pass criteria:** Cert chain validates and not near expiry.

---

### SEC-TLS-05 | Cookies (if any) have Secure + HttpOnly flags

**Steps:**
```bash
curl -sS -I -c /tmp/cookies.txt https://run.civpulse.org/ | grep -i set-cookie
cat /tmp/cookies.txt
```

**Expected:** Any Set-Cookie response has `Secure` and `HttpOnly` flags. `SameSite=Lax` or `Strict` preferred.

**Pass criteria:** No insecure cookies issued.

---

### SEC-TLS-06 | Mixed-content check

**Steps:** Load `https://run.civpulse.org/` in a browser with dev tools open; check console for mixed-content warnings.

**Expected:** No mixed-content warnings.

**Pass criteria:** No http:// subresources on an https:// page.

---

## Results Template

Save a filled-in copy of this section to `results/phase-12-results.md`.

### SQL Injection

| Test ID | Result | Notes |
|---|---|---|
| SEC-SQLI-01 | | |
| SEC-SQLI-02 | | |
| SEC-SQLI-03 | | |
| SEC-SQLI-04 | | |
| SEC-SQLI-05 | | |
| SEC-SQLI-06 | | |
| SEC-SQLI-07 | | |
| SEC-SQLI-08 | | |
| SEC-SQLI-09 | | |
| SEC-SQLI-10 | | |
| SEC-SQLI-11 | | |

### XSS

| Test ID | Result | Notes |
|---|---|---|
| SEC-XSS-01 | | |
| SEC-XSS-02 | | |
| SEC-XSS-03 | | |
| SEC-XSS-04 | | |
| SEC-XSS-05 | | |
| SEC-XSS-06 | | |
| SEC-XSS-07 | | |
| SEC-XSS-08 | | |
| SEC-XSS-09 | | |

### CSRF

| Test ID | Result | Notes |
|---|---|---|
| SEC-CSRF-01 | | |
| SEC-CSRF-02 | | |
| SEC-CSRF-03 | | |

### Input validation

| Test ID | Result | Notes |
|---|---|---|
| SEC-INPUT-01 | | |
| SEC-INPUT-02 | | |
| SEC-INPUT-03 | | |
| SEC-INPUT-04 | | |
| SEC-INPUT-05 | | |
| SEC-INPUT-06 | | |
| SEC-INPUT-07 | | |
| SEC-INPUT-08 | | |
| SEC-INPUT-09 | | |
| SEC-INPUT-10 | | |
| SEC-INPUT-11 | | |
| SEC-INPUT-12 | | |
| SEC-INPUT-13 | | |
| SEC-INPUT-14 | | |

### Authentication bypass

| Test ID | Result | Notes |
|---|---|---|
| SEC-AUTH-01 | | |
| SEC-AUTH-02 | | |
| SEC-AUTH-03 | | |
| SEC-AUTH-04 | | |
| SEC-AUTH-05 | | |
| SEC-AUTH-06 | | |
| SEC-AUTH-07 | | |

### File upload

| Test ID | Result | Notes |
|---|---|---|
| SEC-UPLOAD-01 | | |
| SEC-UPLOAD-02 | | |
| SEC-UPLOAD-03 | | |
| SEC-UPLOAD-04 | | |
| SEC-UPLOAD-05 | | |
| SEC-UPLOAD-06 | | |

### Rate limiting

| Test ID | Result | Notes |
|---|---|---|
| SEC-RATE-01 | | |
| SEC-RATE-02 | | |
| SEC-RATE-03 | | |
| SEC-RATE-04 | | |

### Information disclosure

| Test ID | Result | Notes |
|---|---|---|
| SEC-INFO-01 | | |
| SEC-INFO-02 | | |
| SEC-INFO-03 | | |
| SEC-INFO-04 | | |
| SEC-INFO-05 | | |
| SEC-INFO-06 | | |
| SEC-INFO-07 | | |

### Open redirect

| Test ID | Result | Notes |
|---|---|---|
| SEC-REDIR-01 | | |
| SEC-REDIR-02 | | |
| SEC-REDIR-03 | | |
| SEC-REDIR-04 | | |

### TLS / HTTPS

| Test ID | Result | Notes |
|---|---|---|
| SEC-TLS-01 | | |
| SEC-TLS-02 | | |
| SEC-TLS-03 | | |
| SEC-TLS-04 | | |
| SEC-TLS-05 | | |
| SEC-TLS-06 | | |

### Summary

- Total tests: 60
- PASS: ___ / 60
- FAIL: ___ / 60
- SKIP: ___ / 60
- BLOCKED: ___ / 60

**Launch-blocking:** Any SEC-SQLI-*, SEC-XSS-* (stored), or SEC-AUTH-* failure is a P0 blocker.

## Cleanup

Some tests create state (XSS payload voters, formula-injection voters, tag rows). Delete them at end of phase:

```bash
# Delete test voters whose names look like XSS payloads
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
DELETE FROM voters WHERE campaign_id='$ORG_A_CAMPAIGN_ID'
  AND (first_name LIKE '%<script%' OR first_name LIKE '%onerror%'
    OR first_name LIKE '%DROP TABLE%' OR first_name LIKE '=cmd%'
    OR last_name LIKE '%<script%' OR last_name='XSS' OR last_name='Tables'
    OR last_name='Unicode' OR last_name='Long' OR last_name='Formula');
DELETE FROM voter_tags WHERE campaign_id='$ORG_A_CAMPAIGN_ID' AND name IN ('CSRFTag');
DELETE FROM campaigns WHERE name='<script>alert(1)</script>';
"
```

Record cleanup row counts in `results/phase-12-results.md`.
