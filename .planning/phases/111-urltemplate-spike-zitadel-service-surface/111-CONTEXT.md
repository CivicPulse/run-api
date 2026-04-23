# Phase 111: `urlTemplate` Spike + ZITADEL Service Surface — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 111 delivers two things, in order:

1. **A gating spike** that proves ZITADEL 2.71.x's `urlTemplate` parameter reliably deep-links an authenticated invitee back to `/invites/<token>` after completing the hosted password-set flow, with the resulting OIDC session visible to `oidc-client-ts` in the SPA.
2. **The `ZitadelService` surface** that phases 112–115 consume: `ensure_human_user` + `create_invite_code`, both wrapped in a shared bounded retry, plus a scope audit of the runtime service-account identity (SEC-03).

**In scope:**
- Committed Playwright E2E spike test driving a full invite → hosted setup → deep-link → authed-API-call flow
- Two new methods on `ZitadelService` with unit + integration coverage
- Shared `_retry_on_5xx` async helper on `ZitadelService`, applied to the two new methods only
- `111-SCOPE-AUDIT.md` artifact mapping every ZITADEL API call the runtime service makes to the minimum role required
- Conditional narrowing of the runtime service-account role if the audit shows it's over-privileged, with an integration test proving existing flows still work

**Out of scope (belongs to later phases):**
- Alembic migration or any new columns on `invites` (Phase 112)
- Wiring `ensure_human_user` into `send_campaign_invite_email` (Phase 113)
- Any frontend changes to `/invites/<token>` or `/login` (Phase 114)
- Admin resend endpoint, expired-init-code re-mint, funnel telemetry (Phase 115)
- Backfilling retry onto `ensure_project_grant` / `assign_project_role` / other existing methods

**Spike contingency:** If the spike test fails, Phase 111 exits with `status: blocked (spike failed)`, a `111-SPIKE-VERDICT.md` is written with evidence, and `/gsd-replan-milestone` is proposed to reroute v1.19 to Option C non-ROPC. ROPC remains out of scope.

</domain>

<decisions>
## Implementation Decisions

### Spike — Execution & Exit Criteria

- **D-SPIKE-01:** The spike is a **committed Playwright E2E test** at `web/tests/e2e/invite-urltemplate-spike.spec.ts`, driven by `web/scripts/run-e2e.sh`. The test becomes a permanent regression gate for EMAIL-03's exact `urlTemplate` shape, not a throwaway script.
- **D-SPIKE-02:** **Pass signal = full authed flow.** The test passes only when all three hold: (a) browser lands at `/invites/<token>?zitadelCode=...&userID=...`, (b) `authStore` in `oidc-client-ts` has a valid hydrated user, (c) at least one authenticated backend call (e.g. `GET /api/v1/me` or `GET /api/v1/invites/<token>`) returns 200. Landing at the URL alone is NOT sufficient — we're proving the session bridges from `auth.civpulse.org` to `run.civpulse.org`.
- **D-SPIKE-03:** **On spike failure**, Claude writes `111-SPIKE-VERDICT.md` with network/console/screenshot evidence, stops the phase, and proposes the Option C non-ROPC replan via `/gsd-replan-milestone` for user approval. No auto-replan.
- **D-SPIKE-04:** **Per-run throwaway invitee** — the test generates a UUID-suffixed email (`spike-<uuid>@civpulse.test`), creates the invite, walks through hosted setup typing a generated strong password, asserts the deep-link flow, then cleans up the ZITADEL user in `afterAll`. No persistent test credentials. Spike runs against the dev ZITADEL instance.

### `ensure_human_user` — Idempotency & Return Shape

- **D-EHU-01:** **Search-first-then-create ordering.** 1) POST v2 user search filtered by email (lowercased); 2) if hit → return existing user with `created=False`; 3) else POST AddHumanUser with `email.isVerified=true` → return new user with `created=True`. One extra round-trip on the cold path is acceptable; it's the only ordering that makes `created` correct by construction.
- **D-EHU-02:** **Return shape = frozen dataclass** `EnsureHumanUserResult(user_id: str, created: bool)`. Lives next to `ZitadelService` (e.g. `app/services/zitadel.py` or a sibling types module). Dataclass is chosen over `tuple` for call-site readability and over `TypedDict` for Python ergonomics; chosen over a bigger shape because Phase 113 only needs these two fields today.
- **D-EHU-03:** **"Mirrors `ensure_project_grant`" is semantic, not structural.** The existing method uses create-first-then-fallback-to-search; `ensure_human_user` inverts that ordering because the `(user_id, created)` return contract demands it. CONTEXT.md records this deviation so the planner doesn't re-raise the "mirror exactly" interpretation.

### `create_invite_code` — Surface

- **D-CIC-01:** Signature follows the roadmap exactly: `async def create_invite_code(user_id: str, url_template: str) -> str`, returning the invite code. The `url_template` is a per-call parameter (not class-level config) because Phase 113 may pass different templates during testing and Phase 115's resend path may eventually diverge.
- **D-CIC-02:** Request body matches research: `{"returnCode": {}, "urlTemplate": url_template}` against `POST /v2/users/{userId}/invite_code`. CivicPulse emails the code via Mailgun (keeps DMARC/SPF under our control); ZITADEL does not send mail.
- **D-CIC-03:** Claude's Discretion — the method returns just the code string for this phase. If Phase 115's transparent-re-mint logic (RECOV-01) needs `expirationDate`, it can be added as a non-breaking return-shape extension then (e.g. swap to a `CreateInviteCodeResult` dataclass). Recorded here so the planner doesn't over-engineer today.

### Retry Wrapper

- **D-RETRY-01:** **Private `_retry_on_5xx` async helper** on `ZitadelService`. Rough signature: `async def _retry_on_5xx(self, fn: Callable[[], Awaitable[T]], *, attempts: int = 3, backoff: tuple[float, ...] = (1.0, 2.0, 4.0)) -> T`. Retries on `httpx.ConnectError`, `httpx.TimeoutException`, and `httpx.HTTPStatusError` where `response.status_code >= 500`. All other exceptions (4xx, validation, etc.) re-raise immediately. No `tenacity` dependency — matches research SUMMARY.md and existing inline-asyncio style.
- **D-RETRY-02:** **Scope = the two new methods only.** `ensure_project_grant`, `assign_project_role`, `create_project_grant`, and the other 6 existing methods stay as-is. Rationale: minimal diff, existing methods work in prod, backfilling is a clean follow-up phase when / if incident evidence surfaces.
- **D-RETRY-03:** Unit tests for the helper must cover: retry success on attempt 2, retry exhaustion raising `ZitadelUnavailableError`, immediate re-raise on 4xx, and backoff timing (patched `asyncio.sleep`).

### Service-Account Scope (SEC-03)

- **D-SCOPE-01:** **SEC-03 applies to the runtime service-account** (the OIDC client used by `ZitadelService._get_token`), NOT the bootstrap PAT. The roadmap's "PAT" language is corrected here — the runtime service uses `client_credentials` grant against an OIDC service-account identity. The bootstrap PAT in `scripts/bootstrap-zitadel.py` is a dev-time tool and stays out of scope.
- **D-SCOPE-02:** **Audit + conditional narrow.** The phase produces `111-SCOPE-AUDIT.md` enumerating every ZITADEL API call the runtime service makes today (grep-based inventory of `app/services/zitadel.py` plus the two new methods) and the minimum role each requires. If the runtime identity is already scoped to `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` on the CivicPulse org → SEC-03 passes as-is with the audit as evidence. If broader (e.g. `IAM_OWNER`), narrow via console + any required `bootstrap-zitadel.py` change + an integration test proving `ensure_human_user`, `create_invite_code`, and `ensure_project_grant` still work under the narrowed scope.

### Claude's Discretion

- **Test mocking library:** Existing precedent at `tests/unit/test_zitadel_token.py` uses `unittest.mock.patch("httpx.AsyncClient")`. Continue that pattern — do NOT introduce `respx` or `pytest-httpx` as new dependencies. `pyproject.toml` has neither today.
- **Where `EnsureHumanUserResult` lives:** Claude picks between inline in `app/services/zitadel.py` (simplest) or a sibling `app/services/zitadel_types.py` (cleaner if more result shapes appear in Phase 113+). Default: inline.
- **Retry helper test isolation:** Claude picks between extracting the helper to a module-level function for easy testing vs keeping it a method and testing through the two new methods. Default: keep as a method, test through both public methods + one dedicated retry-timing test.
- **Concrete `_auth_headers` reuse:** The new methods should reuse whatever auth-header shape the existing methods use (bearer token via `_get_token`). Don't invent a new pattern.

### Folded Todos

None — `gsd-sdk query todo.match-phase 111` returned zero matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (load first)
- `.planning/ROADMAP.md` §Phase 111 — success criteria the phase must satisfy (especially criterion #1's replan-on-fail language)
- `.planning/REQUIREMENTS.md` §PROV-01/02/03, §SEC-03 — the four in-phase requirement IDs with their exact acceptance wording
- `.planning/research/SUMMARY.md` — Option B / Option C decision record, confirms `{"returnCode": {}}` + urlTemplate shape, flags the Phase-111-gating `urlTemplate` deep-link confidence gap
- `.planning/research/ARCHITECTURE.md` — integration points for the new service methods
- `.planning/research/PITFALLS.md` — M1 (pre-created user logs in before accept), S6/Z3 (PAT scope), Z4 (user+grant+role atomicity), O1 (ZITADEL 50 req/s rate limit)
- `.planning/research/STACK.md` — confirms no new `pyproject.toml` entries; reuse `httpx`, `_get_token`, `slowapi`, `procrastinate`
- `.planning/research/FEATURES.md` — table-stakes list (#1 pre-provisioning, #2 working set-password flow)

### Existing Code the Phase Extends
- `app/services/zitadel.py` — the file both new methods land in. `_get_token` (line 46), `_auth_headers` pattern, `ensure_project_grant` (line 463) as the idempotency reference
- `app/core/errors.py` — `ZitadelUnavailableError` to raise on retry exhaustion
- `scripts/bootstrap-zitadel.py` §102–117 — the reference retry pattern (sync 503-only) whose shape the new async `_retry_on_5xx` generalizes
- `tests/unit/test_zitadel_token.py` — existing httpx-mocking precedent (unittest.mock.patch on `httpx.AsyncClient`)
- `tests/unit/test_zitadel_timeouts.py` — existing timeout-mocking precedent
- `web/scripts/run-e2e.sh` — the Playwright wrapper the spike test must use (logs to `web/e2e-runs.jsonl`)
- `web/src/stores/authStore.ts` — `oidc-client-ts` auth store the spike test asserts against for "hydrated user"

### ZITADEL External Docs (verify exact shapes during planning)
- `https://zitadel.com/docs/apis/migration_v1_to_v2` — v1→v2 invitation-code migration reference
- `https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode` — invite-code endpoint with `returnCode` + `urlTemplate`
- `https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateUser` — AddHumanUser, including duplicate response shape
- `https://zitadel.com/docs/guides/integrate/onboarding/end-users` — onboarding end-to-end guide (confirms Hosted Login UI stays enabled)
- `https://github.com/zitadel/zitadel/issues/10319` — initial-password bypasses email verification (why Option B; supports `isVerified=true` via invite-code path)

### Project Conventions
- `CLAUDE.md` — `uv` for Python ops, ruff rules, tz-aware datetimes
- `.planning/codebase/CONVENTIONS.md` — repo-wide patterns
- `.planning/codebase/TESTING.md` — test structure (`tests/unit`, `tests/integration`, `web/tests/e2e`)
- `.planning/codebase/STACK.md` — confirms httpx, procrastinate, slowapi versions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ZitadelService._get_token`** (`app/services/zitadel.py:46`) — token caching with 60s-before-expiry refresh. Both new methods call this before any API request; no new auth plumbing.
- **`ZitadelService._auth_headers(token)`** — standard bearer-header helper already in use; reuse verbatim.
- **`ZitadelUnavailableError`** (`app/core/errors.py`) — the exception the retry wrapper raises on exhaustion; already the contract every existing method uses.
- **`unittest.mock.patch("httpx.AsyncClient")`** pattern in `tests/unit/test_zitadel_token.py` / `test_zitadel_timeouts.py` — the inherited test style for the new methods.
- **`web/scripts/run-e2e.sh`** — the E2E wrapper the spike test runs under. Logs pass/fail/duration to `web/e2e-runs.jsonl` so the spike becomes traceable over time.

### Established Patterns
- **Idempotency via try-then-search** — `ensure_project_grant` demonstrates the ZITADEL-409 recovery shape. `ensure_human_user` inverts to search-first-then-create because its return contract demands a reliable `created` flag (see D-EHU-03).
- **Tz-aware datetimes everywhere** — `DateTime(timezone=True)` + `datetime.now(UTC)`. Doesn't apply to this phase's code directly (no new columns), but the spike test should use `datetime.now(UTC)` for any timestamp assertions to avoid re-introducing the v1.18 naive-datetime regression (SEC-04 lives in Phase 112 but the convention starts here).
- **Loguru `logger` for service-level logs** — `logger.error(...)` on transient failures, `logger.debug(...)` on recoverable conflicts. Both new methods follow this shape.
- **httpx `AsyncClient` per-call** — each method opens its own `async with httpx.AsyncClient(...)` block. No shared connection pool. The retry helper must open the client inside each attempt (not once around them) to avoid retrying on a closed client.

### Integration Points
- **New methods land on `ZitadelService`** — class already imported by `app/services/invite.py`, `app/tasks/invite_tasks.py`, and `app/api/v1/invites.py`. No new wiring.
- **Spike test sits alongside existing E2E specs** (`web/tests/e2e/*.spec.ts`). It runs under the same Playwright config, uses the same dev ZITADEL, logs to the same `web/e2e-runs.jsonl`.
- **Scope audit artifact** (`111-SCOPE-AUDIT.md`) lives in the phase directory — referenced by verification as SEC-03's evidence, not consumed by code.

</code_context>

<specifics>
## Specific Ideas

- **Spike URL shape is LOCKED:** `https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`. Frontend query-string parsing is Phase 114's problem; this phase just passes the string to ZITADEL and asserts the redirect lands correctly.
- **Spike captures a console + network trace on failure** so the Phase 111 replan verdict has enough evidence for the Option C decision. Playwright's `trace: 'retain-on-failure'` is the standard knob.
- **Scope audit uses grep over `app/services/zitadel.py`** — every `client.post(...)` or `client.get(...)` URL is one API call; map each to the minimum role required per ZITADEL docs.
- **"Narrow scope" means narrowing the runtime service-account role in ZITADEL Console** — not deleting it and re-creating via bootstrap. Bootstrap changes, if any, are additive (to match the narrowed role on a fresh bootstrap).

</specifics>

<deferred>
## Deferred Ideas

- **Backfill `_retry_on_5xx` to existing ZitadelService methods** (`ensure_project_grant`, `assign_project_role`, `create_project_grant`, `_get_token`, etc.) — tracked as a future improvement candidate. Gate on incident evidence or a dedicated hardening phase, not on this milestone.
- **`CreateInviteCodeResult` dataclass carrying `expirationDate`** — defer to Phase 115 when RECOV-01's transparent-re-mint actually needs it. Return-shape extension is non-breaking because `create_invite_code`'s current single return is `str`; upgrading to a dataclass at that point requires one call-site update.
- **Rate-limit the provisioning path at 40 req/s (O1 honorable mention)** — not needed until a bulk-invite UI exists. Design the retry helper so adding a token bucket later is additive.
- **Narrowing the bootstrap PAT in `scripts/bootstrap-zitadel.py`** — out of scope for SEC-03 per D-SCOPE-01; if we want to do it, a new phase in v1.20 handles it with its own audit.
- **`ZITADEL Hosted Login UI enabled on prod org` probe at app startup** — research's pre-deploy checklist item; belongs in Phase 115's observability work or a separate ops phase, not here.

</deferred>

---

*Phase: 111-urltemplate-spike-zitadel-service-surface*
*Context gathered: 2026-04-23*
