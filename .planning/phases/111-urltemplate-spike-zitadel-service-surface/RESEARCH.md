# Phase 111 Research: `urlTemplate` Spike + ZITADEL Service Surface

**Phase:** 111
**Researcher:** Claude (automated)
**Date:** 2026-04-23
**Confidence key:** HIGH = verified in codebase/docs; MEDIUM = cross-referenced but not tested; LOW = assumed from training data

---

## 1. ZITADEL v2 API Surface for Phase 111

### 1.1 Create Human User — `POST /v2/users/human`

**Confidence:** HIGH

The v2 endpoint creates a human user. [CITED: zitadel.com/docs/apis/resources/user_service_v2/user-service-add-human-user]

**Required fields:**
- `profile.givenName` (string, required)
- `profile.familyName` (string, required)
- `email.email` (string, required)
- `email.isVerified` (bool) — set `true` to skip ZITADEL's verification email

**Optional fields used by Phase 111:**
- `organization.orgId` — scope user to a ZITADEL org
- `username` — defaults to email if omitted

**To mark email verified at creation (PROV-01):**
```json
{
  "profile": { "givenName": "Jo", "familyName": "Doe" },
  "email": { "email": "jo@example.com", "isVerified": true },
  "organization": { "orgId": "..." }
}
```

**Response shape:**
```json
{
  "userId": "string",
  "details": { "resourceOwner": "string", "creationDate": "..." }
}
```

**Required permission:** `user.write` [CITED: zitadel.com/docs/apis/resources/user_service_v2/user-service-add-human-user]

**Note:** This endpoint is being deprecated in favor of `POST /v2/users/new` (CreateUser), but both work on ZITADEL 2.71.x. [VERIFIED: web search] Recommend using `/v2/users/human` since it's well-documented and stable for our version.

### 1.2 Create Invite Code — `POST /v2/users/{userId}/invite_code`

**Confidence:** HIGH

Two mutually exclusive modes: [CITED: zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode]

**Mode A — Return code to caller (our mode, per PROV-02):**
```json
{ "returnCode": {} }
```
Response includes `"inviteCode": "string"` — our service emails it via Mailgun.

**Mode B — ZITADEL sends the email:**
```json
{
  "sendCode": {
    "urlTemplate": "https://app.example.com/invite?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}",
    "applicationName": "MyApp"
  }
}
```

**CRITICAL FINDING — `urlTemplate` placement:**
The `urlTemplate` parameter belongs inside `sendCode`, NOT at the request body root. When using `returnCode` mode, the caller constructs the URL themselves. This means:
- Phase 111 spike must use `sendCode` mode (with `urlTemplate`) to test the deep-link redirect behavior
- Phase 113's production path uses `returnCode` mode and constructs the URL in email template code
- The spike tests the ZITADEL-hosted setup → redirect behavior; the production path tests our email → link → setup → redirect behavior

**urlTemplate placeholders:** [CITED: zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode]
- `{{.UserID}}` — ZITADEL user ID
- `{{.Code}}` — invite code string
- `{{.OrgID}}` — organization ID

**Behavioral notes:**
- A new invite code **invalidates any prior code** for that user [VERIFIED: ZITADEL docs]
- Creating an invite code creates a user initialization flow — the user sets their password on ZITADEL's hosted UI and then is redirected to the `urlTemplate` URL

**Recommendation for planner:** The D-CIC-02 decision in 111-CONTEXT.md says `{"returnCode": {}, "urlTemplate": url_template}`. Verify whether `urlTemplate` is accepted at root level alongside `returnCode` or only inside `sendCode`. If only inside `sendCode`, the production `create_invite_code` method should use `{"returnCode": {}}` (no urlTemplate) and the spike should use `{"sendCode": {"urlTemplate": "..."}}`. [ASSUMED — needs spike verification]

### 1.3 Search Users by Email — `POST /v2/users` (ListUsers)

**Confidence:** HIGH

```json
{
  "queries": [{
    "emailQuery": {
      "emailAddress": "user@example.com",
      "method": "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE"
    }
  }]
}
```

Response returns `result` array of user objects with `userId`, `state`, `human.email.email`, `human.email.isVerified`, etc. [CITED: zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.ListUsers]

**Idempotency pattern for `ensure_human_user` (PROV-01):**
1. Search by email with `TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE`
2. If `result` non-empty → return `(user_id, created=False)`
3. If empty → create user → return `(user_id, created=True)`

This matches D-EHU-01's search-first-then-create ordering. [VERIFIED: 111-CONTEXT.md]

### 1.4 Invite Code TTL

**Confidence:** HIGH

Default: **72 hours (3 days)** [VERIFIED: zitadel/zitadel cmd/defaults.yaml on GitHub]

```yaml
InviteCode:
  Length: 6
  Expiry: "72h"
  IncludeUpperLetters: true
  IncludeDigits: true
```

**Not configurable via API** as of 2.71.x — only overridable via YAML config in self-hosted deployments. Open enhancement request: GitHub issue #10474 (filed Aug 2025, status "To be scoped and estimated"). [VERIFIED: GitHub issue search]

**Impact on v1.19:** Our invite TTL is 7 days (`INVITE_EXPIRY_DAYS` in model). ZITADEL init codes expire in 3 days. Phase 115's RECOV-01 (transparent re-mint) is essential for invites clicked between day 3 and day 7. For self-hosted: consider overriding to match 7 days via ZITADEL YAML config. [ASSUMED — user should confirm desired TTL alignment strategy]

---

## 2. Current Codebase State

### 2.1 ZitadelService — Existing Patterns

**Confidence:** HIGH (all verified by reading source)

**File:** `app/services/zitadel.py` (533 lines)

**Auth pattern:** `client_credentials` grant via `_get_token()` (line 46), cached with 60s-before-expiry refresh. All methods use `_auth_headers(token)` which adds Bearer + Content-Type + optional Host header for internal URLs. [VERIFIED: zitadel.py:46-101]

**Existing methods (9):**
| Method | ZITADEL API | Used at runtime? |
|--------|-------------|-----------------|
| `create_organization` | `POST /management/v1/orgs` | **No** (defined but no callers in `app/`) |
| `deactivate_organization` | `POST /management/v1/orgs/{id}/_deactivate` | Yes (campaign deletion) |
| `delete_organization` | `DELETE /management/v1/orgs/{id}` | **No** (defined but no callers in `app/`) |
| `assign_project_role` | `POST /management/v1/users/{id}/grants` | Yes (invite accept, member update, campaign create, volunteer approval) |
| `remove_project_role` | `GET .../_search` + `DELETE .../grants/{id}` | Yes (member update, invite accept) |
| `remove_all_project_roles` | `GET .../_search` + `DELETE .../grants/{id}` | Yes (member removal) |
| `create_project_grant` | `POST /management/v1/projects/{id}/grants` | Yes (via `ensure_project_grant`) |
| `ensure_project_grant` | create + fallback search | Yes (campaign create, join) |
| (token management) | `POST /oauth/v2/token` | Yes (implicit) |

**Idempotency reference — `ensure_project_grant` (line 463):**
Uses create-first-then-search-on-conflict pattern. D-EHU-03 explicitly notes `ensure_human_user` inverts this to search-first-then-create for the `created` flag. [VERIFIED: 111-CONTEXT.md]

**No retry wrapper exists today.** Each method has its own inline try/except for `ConnectError`, `TimeoutException`, and `HTTPStatusError >= 500`, all raising `ZitadelUnavailableError`. The bootstrap script has a sync retry loop (10 attempts, 3s sleep on 503) at lines 102-117. [VERIFIED: bootstrap-zitadel.py:102-117, zitadel.py]

**httpx client pattern:** Each method creates a new `httpx.AsyncClient` context manager per call. No persistent session. TLS verification conditionally disabled when internal URL differs from issuer. [VERIFIED: zitadel.py:117-118, 44]

### 2.2 Invite Model — Current Columns

**Confidence:** HIGH

**File:** `app/models/invite.py`

Current columns (no ZITADEL provisioning columns yet):
- `id`, `campaign_id`, `email`, `role`, `token`, `expires_at`, `accepted_at`, `revoked_at`
- `email_delivery_status`, `email_delivery_queued_at`, `email_delivery_sent_at`, `email_delivery_provider_message_id`, `email_delivery_error`, `email_delivery_last_event_at`
- `created_by`, `created_at`

Phase 112 adds: `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at`, `legacy_flow`. [VERIFIED: ROADMAP.md]

### 2.3 Background Task — `send_campaign_invite_email`

**Confidence:** HIGH

**File:** `app/tasks/invite_tasks.py`

- Queue: `communications` (Procrastinate)
- `queueing_lock=f"invite-email:{invite.id}"` prevents duplicate enqueueing
- Already checks for deliverability (not accepted, not revoked, not expired, not already sent)
- Fetches Invite, Campaign, Organization, User (inviter) for email context
- Creates `EmailDeliveryAttempt` record, calls Mailgun, updates delivery status
- Re-raises on failure for Procrastinate retry with backoff

Phase 113 will add ZITADEL provisioning BEFORE the email send step. [VERIFIED: invite_tasks.py, ROADMAP.md]

### 2.4 Test Patterns

**Confidence:** HIGH

**Existing ZITADEL test files:**
- `tests/unit/test_zitadel_token.py` — mocks `httpx.AsyncClient` via `unittest.mock.patch`
- `tests/unit/test_zitadel_timeouts.py` — timeout behavior mocking

**Pattern:** `unittest.mock.patch("httpx.AsyncClient")` to mock the HTTP layer. No `respx` or `pytest-httpx` in dependencies. D-SPIKE-04 in context confirms: continue existing pattern, no new test deps. [VERIFIED: 111-CONTEXT.md, pyproject.toml]

**E2E test runner:** `web/scripts/run-e2e.sh` — logs to `web/e2e-runs.jsonl`. Spike test must use this wrapper per D-SPIKE-01. [VERIFIED: 111-CONTEXT.md]

---

## 3. Service-Account Scope Audit (SEC-03)

### 3.1 Current State

**Confidence:** HIGH

The bootstrap script grants **`IAM_OWNER`** to the machine user `run-api-service` at line 163. [VERIFIED: bootstrap-zitadel.py:156-167]

The runtime `ZitadelService` uses `client_credentials` grant with this machine user's identity. So the **runtime service account IS `IAM_OWNER`**. [VERIFIED: zitadel.py:62-73, bootstrap-zitadel.py:163]

### 3.2 Required Permissions by Method

**Confidence:** MEDIUM (role→permission mappings from ZITADEL defaults.yaml, but not tested against 2.71.x)

| Runtime Method | Required Permission | Minimum Role |
|----------------|-------------------|--------------|
| `deactivate_organization` | `org.write` (with `x-zitadel-orgid` header) | `ORG_OWNER` on target org |
| `assign_project_role` | `user.grant.write` | `ORG_USER_MANAGER` or `ORG_PROJECT_USER_GRANT_EDITOR` |
| `remove_project_role` | `user.grant.read` + `user.grant.delete` | `ORG_USER_MANAGER` or `ORG_PROJECT_USER_GRANT_EDITOR` |
| `remove_all_project_roles` | `user.grant.read` + `user.grant.delete` | `ORG_USER_MANAGER` or `ORG_PROJECT_USER_GRANT_EDITOR` |
| `ensure_project_grant` | `project.grant.write` + `project.grant.read` | `ORG_OWNER` or instance-level |
| **(new) `ensure_human_user`** | `user.read` + `user.write` | `ORG_USER_MANAGER` |
| **(new) `create_invite_code`** | `user.write` | `ORG_USER_MANAGER` |

### 3.3 Scope Narrowing Analysis

**Confidence:** MEDIUM

**Key finding:** `deactivate_organization` needs `org.write` and `ensure_project_grant` needs `project.grant.write`. These require at least `ORG_OWNER` on each target org, which is problematic because the service operates across multiple orgs (one per campaign).

**The simplest narrowing** from `IAM_OWNER` would be to `IAM_ORG_MANAGER`, which grants:
- `org.read`, `org.write` (across all orgs)
- `user.read`, `user.write`, `user.delete`, `user.grant.read/write/delete`
- `project.read`, `project.grant.read/write/delete`

This covers all runtime needs without granting full `IAM_OWNER` (which also includes `iam.write`, `iam.policy.write`, `iam.member.write`, etc.).

**However:** `IAM_ORG_MANAGER` is still broad. A per-org `ORG_OWNER` grant would be tighter but requires granting the role on every new org — adding operational complexity.

**Recommendation for planner:**
1. The audit artifact (`111-SCOPE-AUDIT.md`) should enumerate all calls + minimum permissions
2. Narrowing from `IAM_OWNER` to `IAM_ORG_MANAGER` is the safe first step — removes ability to change instance settings, manage IAM members, modify login policies
3. Full narrowing to per-org roles is a follow-up (requires granting `ORG_OWNER` to the service account on each new org at org-creation time)
4. The bootstrap script's `IAM_OWNER` grant for the machine user (dev-time PAT) is a separate concern from the runtime `client_credentials` identity [VERIFIED: D-SCOPE-01 in 111-CONTEXT.md distinguishes these]

**Open question for user:** Does the production ZITADEL instance use the same machine user for runtime that bootstrap creates? If production has a separate service account, its current role needs independent verification. [ASSUMED — need user confirmation]

---

## 4. Spike Implementation Details

### 4.1 urlTemplate Deep-Link Flow

**Confidence:** MEDIUM

The expected flow when using ZITADEL's invite code with `urlTemplate`:

1. Service creates user via `POST /v2/users/human` (email verified)
2. Service creates invite code via `POST /v2/users/{userId}/invite_code` with `sendCode.urlTemplate`
3. ZITADEL sends email with link to its hosted init page (e.g. `https://auth.civpulse.org/ui/login/init?userID=...&code=...&orgID=...`)
4. User clicks link → lands on ZITADEL hosted password-set page
5. User sets password → ZITADEL redirects to the `urlTemplate` URL with placeholders filled
6. User lands at `https://run.civpulse.org/invites/<token>?zitadelCode=<code>&userID=<id>`
7. `oidc-client-ts` should pick up the authenticated session

**Spike risk area:** Step 7 — does ZITADEL set an OIDC session cookie after password setup that `oidc-client-ts` can detect? The redirect to our app is NOT an OIDC callback — it's a plain URL redirect. The SPA would need to trigger a silent OIDC login (`signinSilent()`) or redirect-based login after landing. [ASSUMED — this is the core spike question]

**Alternative interpretation:** ZITADEL might redirect through the OIDC authorization endpoint before landing at our `urlTemplate`, which WOULD create a proper OIDC session. This needs empirical verification — the exact behavior depends on ZITADEL's init flow implementation. [ASSUMED]

### 4.2 Spike Test Structure

**Confidence:** HIGH (verified from 111-CONTEXT.md decisions)

Per D-SPIKE-01 through D-SPIKE-04:
- Committed Playwright E2E test at `web/tests/e2e/invite-urltemplate-spike.spec.ts`
- Uses `run-e2e.sh` wrapper
- Per-run throwaway user (`spike-<uuid>@civpulse.test`)
- Pass signal: browser at `/invites/<token>?...`, auth store hydrated, backend call returns 200
- Cleanup in `afterAll` (delete ZITADEL user)

---

## 5. Existing Phase 111 Plans

**Confidence:** HIGH

Phase 111 already has **6 detailed plans** and a full context document with implementation decisions. [VERIFIED: .planning/phases/111-*/]

| File | Content |
|------|---------|
| `111-CONTEXT.md` | Phase boundary, decisions (D-SPIKE-01–04, D-EHU-01–03, D-CIC-01–03, D-RETRY-01–03, D-SCOPE-01–02), canonical refs |
| `111-01-PLAN.md` through `111-06-PLAN.md` | Detailed implementation plans |
| `111-DISCUSSION-LOG.md` | Planning discussion record |
| `111-REVIEWS.md` | Plan review feedback |
| `.continue-here.md` | Execution resume point |

**The phase is already fully planned.** This research supplements the existing plans with verified API details and the scope audit analysis.

---

## 6. Risks and Pitfalls

### 6.1 Spike-Critical: OIDC Session After Password Setup

**Severity:** HIGH — gates the entire milestone

The `urlTemplate` redirect after password setup may NOT automatically create an OIDC session for `oidc-client-ts`. If ZITADEL redirects directly to the template URL (not through the OIDC auth endpoint), the SPA would land with no session. The spike must determine:
- Does ZITADEL route through OIDC auth before the template redirect?
- If not, can the SPA trigger `signinSilent()` to pick up the ZITADEL session cookie?
- If neither works, the spike fails and we replan to Option C.

[ASSUMED — empirical verification needed]

### 6.2 `returnCode` vs `sendCode` Mode Confusion

**Severity:** MEDIUM

The `urlTemplate` parameter lives inside `sendCode`, not at the request body root. Phase 111 spike needs `sendCode` mode to test the redirect. Phase 113 production path uses `returnCode` mode and constructs the URL in our email template. The `create_invite_code` method signature should reflect which mode it supports.

**Recommendation:** Implement `create_invite_code` with `returnCode` mode (production path per PROV-02). The spike test calls the ZITADEL API directly to test `sendCode` + `urlTemplate`. [VERIFIED: PROV-02 requires `returnCode`]

### 6.3 Init Code Expiry < Invite Expiry

**Severity:** MEDIUM — handled by Phase 115 RECOV-01

ZITADEL init codes expire in 72h; our invites expire in 7 days. Invites clicked between day 3 and day 7 will have expired init codes. Phase 115 handles transparent re-minting.

For self-hosted ZITADEL: consider overriding `InviteCode.Expiry` to `168h` (7 days) in the ZITADEL YAML config to eliminate the gap entirely. [ASSUMED — needs user input on whether config override is preferred]

### 6.4 Service Account Scope Is IAM_OWNER

**Severity:** LOW for Phase 111 (audit only), MEDIUM long-term

The runtime service account is `IAM_OWNER`. SEC-03 asks to narrow to `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR`, but the service also needs `org.write` (for `deactivate_organization`) and `project.grant.write` (for `ensure_project_grant`), which require broader roles. See Section 3 for full analysis.

### 6.5 Duplicate User Race Condition

**Severity:** LOW

The search-then-create pattern for `ensure_human_user` has a TOCTOU window: two concurrent calls for the same email could both see "not found" and both try to create. ZITADEL will reject the second create with a conflict error. The implementation should catch this and fall back to search (similar to `ensure_project_grant`'s conflict handling). [ASSUMED — standard idempotency pattern]

---

## 7. Recommendations for Planner

1. **Spike must test both `sendCode` and `returnCode` modes** — `sendCode` to verify the redirect flow, `returnCode` to verify the code is returned for our email path.

2. **`create_invite_code` method should use `returnCode` mode** per PROV-02. The `url_template` parameter in D-CIC-01's signature should be reconsidered — in `returnCode` mode, the template is irrelevant because we construct the URL ourselves. The spike test should call ZITADEL directly for the `sendCode` + `urlTemplate` test.

3. **SEC-03 scope narrowing:** Produce the audit artifact. Narrow to `IAM_ORG_MANAGER` as a pragmatic first step. Document that further narrowing to per-org roles is a follow-up.

4. **Handle TOCTOU in `ensure_human_user`:** Catch 409/conflict on create and fall back to search, even though the primary path is search-first.

5. **Invite code TTL:** Flag the 72h vs 7-day gap to the user. Consider ZITADEL YAML config override for self-hosted.

6. **Plans already exist** — this research validates and supplements the existing 6-plan set. No fundamental plan changes needed, but the `urlTemplate` placement finding (inside `sendCode`, not at root) may affect D-CIC-02.

---

## 8. Key File References

| File | Relevance |
|------|-----------|
| `app/services/zitadel.py` | Target file for new methods |
| `app/services/invite.py` | Accept flow, email match (lines 202-205) |
| `app/tasks/invite_tasks.py` | Background task Phase 113 extends |
| `app/services/invite_email.py` | Email construction |
| `app/models/invite.py` | Current model (Phase 112 extends) |
| `app/core/errors.py` | `ZitadelUnavailableError` |
| `app/core/config.py` | ZITADEL settings |
| `scripts/bootstrap-zitadel.py` | IAM_OWNER grant (line 163), retry pattern (lines 102-117) |
| `tests/unit/test_zitadel_token.py` | httpx mocking precedent |
| `.planning/phases/111-*/111-CONTEXT.md` | Implementation decisions |
| `.planning/research/SUMMARY.md` | Option B convergence record |
