# Phase 01: Authentication & OIDC

**Prefix:** `AUTH`
**Depends on:** phase-00
**Estimated duration:** 20 min
**Agents required:** 1

## Purpose

Exercise every authentication path: OIDC login, callback handling, token lifecycle, session expiry, logout, and negative cases (forged/expired/missing tokens). Prove that unauthenticated access is consistently rejected and authenticated access works for every test user.

## Prerequisites

- Phase 00 complete (baseline Org A + Org B users exist)
- Ability to run Playwright OR open an interactive browser
- `curl` available

---

## Section 1: Happy-path OIDC flow

### AUTH-OIDC-01 | OIDC discovery document completeness

**Steps:**
```bash
curl -fsS https://auth.civpulse.org/.well-known/openid-configuration -o /tmp/oidc.json
jq 'keys' /tmp/oidc.json
```

**Expected:** Contains keys: `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `revocation_endpoint`, `end_session_endpoint`, `scopes_supported`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported`.

**Pass criteria:** All 11 keys present + `code_challenge_methods_supported` includes `"S256"` (PKCE).

---

### AUTH-OIDC-02 | JWKS endpoint serves valid keys

**Steps:**
```bash
curl -fsS https://auth.civpulse.org/oauth/v2/keys | jq '.keys | length, .keys[0].kty, .keys[0].use'
```

**Expected:** ≥1 key, `kty == "RSA"`, `use == "sig"`.

**Pass criteria:** ≥1 valid signing key.

---

### AUTH-OIDC-03 | Authorize endpoint responds with HTML login UI

**Steps:**
```bash
curl -fsS -i "https://auth.civpulse.org/oauth/v2/authorize?client_id=364255312682745892&redirect_uri=https%3A%2F%2Frun.civpulse.org%2Fcallback&response_type=code&scope=openid+profile+email&code_challenge=test&code_challenge_method=S256" -o /tmp/authz.html
head -5 /tmp/authz.html
```

**Expected:** 302 redirect OR 200 with HTML login UI.

**Pass criteria:** No 500 error. (302 → ZITADEL hosted login page is correct.)

---

### AUTH-FLOW-01 | Full OIDC login: qa-owner@civpulse.org

**Steps:** Perform the complete auth-code + PKCE flow via a real browser (Playwright or browser tool).

```bash
cd web && EMAIL='qa-owner@civpulse.org' PASSWORD='k%A&ZrlYH4tgztoVK&Ms' ROLE='auth-owner' node smoke-test-harness.mjs > /tmp/auth-owner.json 2>&1
jq '.loginSuccess, .landingUrl' screenshots/smoke-auth-owner/result.json
```

**Expected:**
- `loginSuccess: true`
- `landingUrl: https://run.civpulse.org/`
- No console errors (except Cloudflare beacon CSP warning — ignorable)

**Pass criteria:** Login success + landed on `/`.

---

### AUTH-FLOW-02 | Full OIDC login: all 10 test users (Org A + Org B)

**Steps:** Repeat AUTH-FLOW-01 for each user:
- qa-owner@civpulse.org
- qa-admin@civpulse.org
- qa-manager@civpulse.org
- qa-volunteer@civpulse.org
- qa-viewer@civpulse.org
- qa-b-owner@civpulse.org
- qa-b-admin@civpulse.org
- qa-b-manager@civpulse.org
- qa-b-volunteer@civpulse.org
- qa-b-viewer@civpulse.org

**Expected:** 10/10 logins succeed.

**Pass criteria:** All 10 login flows complete. Record pass/fail per user.

---

### AUTH-FLOW-03 | Callback redirect preserves original destination

**Steps:**
1. Open private/incognito browser tab
2. Navigate to `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters` (deep link)
3. Observe redirect to ZITADEL login
4. Log in as qa-owner
5. Observe post-login destination

**Expected:** After login, browser lands on `https://run.civpulse.org/campaigns/06d710c8-.../voters` (NOT the root `/`).

**Pass criteria:** Post-login URL matches the original deep link.

---

### AUTH-FLOW-04 | Callback handles error parameter

**Steps:**
1. Manually construct a callback URL with an error parameter:
   `https://run.civpulse.org/callback?error=access_denied&error_description=User+cancelled`
2. Navigate to it in a browser

**Expected:** Error alert rendered ("Sign-in failed"), with a "Back to login" button.

**Pass criteria:** Error UI displayed, no JS exception, no infinite redirect.

---

## Section 2: Token lifecycle

### AUTH-TOKEN-01 | Access token is a JWT with expected claims

**Steps:** Capture an access token from a successful login (via browser DevTools Network panel OR by inspecting a session storage entry). Decode and inspect.

```bash
TOKEN="<paste>"
# Decode payload (middle segment)
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

**Expected claims:**
- `sub` — user's ZITADEL ID (snowflake)
- `iss == "https://auth.civpulse.org"`
- `aud` — contains project client ID or project ID
- `exp` — future timestamp
- `iat` — past timestamp
- `urn:zitadel:iam:user:resourceowner:id` — user's home org ID
- `urn:zitadel:iam:org:project:364255076543365156:roles` — role claim map

**Pass criteria:** All 7 claims present + valid.

---

### AUTH-TOKEN-02 | Access token validates via JWKS

**Steps:** Use the token to call the API. The backend validates via JWKS.

```bash
TOKEN="<valid token>"
curl -fsS -H "Authorization: Bearer $TOKEN" https://run.civpulse.org/api/v1/users/me | jq .
```

**Expected:** HTTP 200 with user profile info.

**Pass criteria:** 200 OK.

---

### AUTH-TOKEN-03 | Forged token (wrong signature) is rejected

**Steps:**
```bash
# Take a valid token, flip 1 character in the signature
GOOD_TOKEN="<valid>"
BAD_SIG="${GOOD_TOKEN%?}X"  # change last char of signature
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $BAD_SIG" https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401.

**Pass criteria:** 401. Not 500, not 200.

**Failure meaning:** If 200, critical security bug (signature validation broken). If 500, crash on forged input (DoS risk).

---

### AUTH-TOKEN-04 | Expired token is rejected

**Steps:** Obtain an expired token (use a token captured >1 hour ago, or wait for natural expiry).

```bash
EXPIRED_TOKEN="<expired>"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $EXPIRED_TOKEN" https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

**Note:** If no expired token available, skip with note — covered in AUTH-TOKEN-05.

---

### AUTH-TOKEN-05 | Token with wrong issuer is rejected

**Steps:** Craft a JWT with `iss` set to `https://evil.example.com`.

```python
# Use python3 / jwt library or online JWT builder; sign with any key
# Submit to the API; backend must reject (invalid iss)
```

Send it as:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $EVIL_TOKEN" https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### AUTH-TOKEN-06 | Token with wrong audience is rejected

**Steps:** Craft a JWT with valid signature but `aud` set to a different project.

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### AUTH-TOKEN-07 | Missing Authorization header returns 401

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### AUTH-TOKEN-08 | Malformed Authorization header returns 401

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: NotBearer token123" https://run.civpulse.org/api/v1/users/me
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer" https://run.civpulse.org/api/v1/users/me
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization:" https://run.civpulse.org/api/v1/users/me
```

**Expected:** All three return HTTP 401.

**Pass criteria:** All 401.

---

### AUTH-TOKEN-09 | Empty Bearer token returns 401

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer " https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### AUTH-TOKEN-10 | Random string as Bearer token returns 401

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer not.a.real.jwt.token" https://run.civpulse.org/api/v1/users/me
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $(head -c 200 /dev/urandom | base64)" https://run.civpulse.org/api/v1/users/me
```

**Expected:** HTTP 401 for both.

**Pass criteria:** Both 401.

---

## Section 3: Logout

### AUTH-LOGOUT-01 | Logout clears session and redirects

**Steps:**
1. Log in as qa-owner in a browser
2. Open user menu (top-right avatar)
3. Click "Sign out"

**Expected:**
- Browser redirects through ZITADEL end_session_endpoint
- Final destination: `/login` or `/`
- Subsequent navigation to `/` redirects to login again (session cleared)

**Pass criteria:** Back on login page after logout AND deep-link protected route redirects to login.

---

### AUTH-LOGOUT-02 | Revoked token can't access API after logout

**Steps:**
1. Log in as qa-owner, capture access token via DevTools
2. Log out via user menu
3. Attempt to reuse the captured token:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CAPTURED_TOKEN" https://run.civpulse.org/api/v1/users/me
```

**Expected:** Should eventually return 401 once token expires, but MAY return 200 if token hasn't expired (ZITADEL doesn't revoke immediately).

**Pass criteria:** Document the behavior. If token still valid post-logout, record as an informational note (design choice, not a bug per OIDC spec).

**Note:** ZITADEL access tokens are self-contained JWTs. Logout doesn't revoke them instantly. This is standard OIDC behavior. For immediate revocation, token introspection would be needed.

---

## Section 4: Multi-session

### AUTH-SESSION-01 | Two browsers can log in as different users simultaneously

**Steps:**
1. Browser 1 (or profile A): log in as qa-owner
2. Browser 2 (or profile B): log in as qa-b-owner
3. In each browser, verify the correct user is logged in (check header avatar + `/api/v1/users/me`)

**Expected:** Both sessions isolated. Each sees only their user's profile.

**Pass criteria:** User-A session shows qa-owner, User-B session shows qa-b-owner. No cross-contamination.

---

### AUTH-SESSION-02 | Same user in two browsers

**Steps:**
1. Browser 1: log in as qa-owner
2. Browser 2: log in as qa-owner
3. In Browser 1: log out
4. In Browser 2: attempt to make an API request

**Expected:** Browser 2 still works (separate session). This is standard OIDC.

**Pass criteria:** Browser 2 remains authenticated after Browser 1's logout.

---

### AUTH-SESSION-03 | Token persists across page reloads

**Steps:**
1. Log in as qa-viewer
2. Hard-refresh the page (Cmd+Shift+R / Ctrl+Shift+R)

**Expected:** Still logged in, no re-auth required, same user profile.

**Pass criteria:** Session persists across reload.

---

## Section 5: Cross-origin & CORS

### AUTH-CORS-01 | API rejects browser requests from unauthorized origins

**Steps:** Simulate a cross-origin preflight:
```bash
curl -sS -i -X OPTIONS https://run.civpulse.org/api/v1/users/me \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" 2>&1 | grep -iE "access-control-allow-origin"
```

**Expected:** Either no `Access-Control-Allow-Origin` header returned, OR explicitly the allowed origin (`https://run.civpulse.org`). NOT `*` and NOT echoing back `evil.example.com`.

**Pass criteria:** CORS origin is restricted to prod domain.

---

### AUTH-CORS-02 | Allowed origin receives CORS headers

**Steps:**
```bash
curl -sS -i -X OPTIONS https://run.civpulse.org/api/v1/users/me \
  -H "Origin: https://run.civpulse.org" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" 2>&1 | grep -iE "access-control"
```

**Expected:** `Access-Control-Allow-Origin: https://run.civpulse.org` + `Access-Control-Allow-Methods` includes GET + `Access-Control-Allow-Credentials: true` OR `Access-Control-Allow-Headers` includes `authorization`.

**Pass criteria:** Correct CORS headers for allowed origin.

---

## Results Template

Save filled to `results/phase-01-results.md`.

### OIDC flow

| Test ID | Result | Notes |
|---|---|---|
| AUTH-OIDC-01 | | |
| AUTH-OIDC-02 | | |
| AUTH-OIDC-03 | | |
| AUTH-FLOW-01 | | |
| AUTH-FLOW-02 | | owner/admin/manager/volunteer/viewer × A+B |
| AUTH-FLOW-03 | | |
| AUTH-FLOW-04 | | |

### Token lifecycle

| Test ID | Result | Notes |
|---|---|---|
| AUTH-TOKEN-01 | | |
| AUTH-TOKEN-02 | | |
| AUTH-TOKEN-03 | | Forged signature rejection |
| AUTH-TOKEN-04 | | |
| AUTH-TOKEN-05 | | Wrong issuer |
| AUTH-TOKEN-06 | | Wrong audience |
| AUTH-TOKEN-07 | | Missing header |
| AUTH-TOKEN-08 | | Malformed header (3 variants) |
| AUTH-TOKEN-09 | | Empty Bearer |
| AUTH-TOKEN-10 | | Random garbage |

### Logout

| Test ID | Result | Notes |
|---|---|---|
| AUTH-LOGOUT-01 | | |
| AUTH-LOGOUT-02 | | Informational |

### Sessions

| Test ID | Result | Notes |
|---|---|---|
| AUTH-SESSION-01 | | |
| AUTH-SESSION-02 | | |
| AUTH-SESSION-03 | | |

### CORS

| Test ID | Result | Notes |
|---|---|---|
| AUTH-CORS-01 | | |
| AUTH-CORS-02 | | |

### Summary

- Total tests: 22
- PASS: ___ / 22
- FAIL: ___ / 22
- **P0 candidates:** Any FAIL on TOKEN-03, TOKEN-04, TOKEN-05, TOKEN-06 → critical security bug.

## Cleanup

None — this phase doesn't create persistent state beyond browser sessions. Log out at the end if needed.
