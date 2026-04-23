# Phase 111: `urlTemplate` Spike + ZITADEL Service Surface — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `111-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 111-urltemplate-spike-zitadel-service-surface
**Areas discussed:** Spike execution & exit criteria; `ensure_human_user` idempotency ordering; Shared retry wrapper shape; Service-account scope & PAT vs client_credentials

---

## Spike execution & exit criteria

### Q1: How should the spike be executed and what artifact lives in the repo?

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright E2E test (gate) | Committed test at `web/tests/e2e/invite-urltemplate-spike.spec.ts` driven by `web/scripts/run-e2e.sh`. Becomes a permanent EMAIL-03 regression gate. | ✓ |
| Chrome DevTools MCP trace | Scripted MCP-driven browser trace, evidence in `.planning/phases/111-.../artifacts/spike-trace.md`. Lightweight but not a CI gate. | |
| Committed Python script + Playwright follow-up | `scripts/spike_urltemplate.py` + short Playwright check that graduates to Phase 114 E2E. | |
| Throwaway notebook + /gsd-spike artifact | Use /gsd-spike workflow, findings wrapped into a skill. Minimum friction, no CI signal. | |

**User's choice:** Playwright E2E test (gate)
**Notes:** Aligns with `feedback_no_human_testing.md` memory (UI/UAT must be automated). Makes the spike outcome a permanent CI signal.

### Q2: What concretely counts as 'spike passes'?

| Option | Description | Selected |
|--------|-------------|----------|
| Full authed flow (Recommended) | Browser lands at `/invites/<token>` + `authStore` has valid user + authed API call returns 200. | ✓ |
| Redirect + session cookie only | Browser lands at `/invites/<token>` with ZITADEL session cookie present. Does not verify oidc-client-ts hydration. | |
| Redirect URL only | Any GET landing at `/invites/<token>?zitadelCode=...&userID=...` counts. | |
| Redirect + 1 authed API call | Redirect lands + single authed call succeeds. Middle ground. | |

**User's choice:** Full authed flow
**Notes:** Catches the M1 risk class (pre-created user could have a cookie but empty session from SPA's perspective). Matches UX-01's actual acceptance bar so the spike doubles as proof-of-UX-01-feasibility.

### Q3: Who decides pass/fail and initiates replan on failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Claude writes verdict + /gsd-replan-milestone | `111-SPIKE-VERDICT.md` with evidence + replan proposal for user approval. | ✓ |
| Claude writes verdict, user triggers replan | Verdict artifact written, user invokes replan manually. | |
| Auto-replan on fail | Phase 111 marks blocked and auto-kicks Option C replan. | |
| Pass/fail is binary in CI | Playwright test passing IS the signal; fail blocks merge. | |

**User's choice:** Claude writes verdict + /gsd-replan-milestone (with user approval)
**Notes:** Keeps the milestone-level decision human-gated while automating the evidence-gathering + replan drafting.

### Q4: How should the spike test authenticate through ZITADEL's hosted setup?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-run throwaway invitee | UUID-suffixed email, generated strong password, cleanup in afterAll. | ✓ |
| Fixed spike invitee in seed.py | Reusable spike-invitee@civpulse.test with known password in `.env.test`. | |
| Service-token shortcut (non-UI) | POST directly to ZITADEL v2 session/password endpoints; skip hosted UI. Weakens spike value. | |
| You decide | Claude picks based on existing Playwright patterns. | |

**User's choice:** Per-run throwaway invitee
**Notes:** No persistent test creds, clean isolation, works on any dev ZITADEL.

---

## `ensure_human_user` idempotency ordering

### Q1: Which idempotency ordering?

| Option | Description | Selected |
|--------|-------------|----------|
| Search-first then create (Recommended) | Search by email → hit → `(user_id, False)`; miss → create → `(user_id, True)`. Extra round-trip, correct `created` by construction. | ✓ |
| Create-first then fallback-to-search | Mirrors `ensure_project_grant`. Faster happy-path, risk of wrong `created` if duplicate status codes vary. | |
| Create-first with search-on-409 + unit-test matrix | Create-first but exhaustively test every ZITADEL duplicate-response shape. | |
| You decide | Claude picks based on what spike reveals. | |

**User's choice:** Search-first then create
**Notes:** Research SUMMARY.md independently recommended this ("search by login-name first; only CreateUser on miss"). The "mirrors ensure_project_grant" roadmap language is reinterpreted as semantic-similarity, not structural-identity (see D-EHU-03 in CONTEXT.md).

### Q2: What return shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Named tuple / dataclass `EnsureHumanUserResult` (Recommended) | Frozen dataclass with `user_id: str` + `created: bool`. Self-documenting, extensible. | ✓ |
| Plain tuple `(user_id, created)` | Matches roadmap literal. Order-confusion-prone at call sites. | |
| TypedDict `{user_id, created}` | Keyword-accessible but less ergonomic in internal Python. | |

**User's choice:** Frozen dataclass `EnsureHumanUserResult`

---

## Shared retry wrapper shape

### Q1: What shape should the shared retry take?

| Option | Description | Selected |
|--------|-------------|----------|
| Private `_retry_on_5xx` async helper (Recommended) | One method on ZitadelService, `fn`-accepting, unit-testable in isolation. | ✓ |
| Decorator `@retry_on_5xx` | Cleaner call sites, obscures stack traces on debug. | |
| Context manager `async with self._retry(...) as attempt` | Very readable, more ceremony. | |
| Add tenacity dependency | Battle-tested; contradicts research SUMMARY.md's "no tenacity" recommendation. | |

**User's choice:** Private `_retry_on_5xx` async helper

### Q2: Blast radius — where does retry get applied?

| Option | Description | Selected |
|--------|-------------|----------|
| Only the two new methods (Recommended) | ensure_human_user + create_invite_code only. Existing methods unchanged. | ✓ |
| New methods + retroactive backfill | Also wrap the ~6 existing ZITADEL methods. Standardizes whole service. | |
| New methods + `_get_token` | Also wrap the token exchange (single point of failure). | |
| You decide | Claude picks based on git/incident history. | |

**User's choice:** Only the two new methods
**Notes:** Tight scope; backfill is deferred to a future hardening phase if incident evidence surfaces.

---

## Service-account scope & PAT vs client_credentials

### Q1: Which identity does SEC-03 apply to?

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime service-account only (Recommended) | OIDC client behind `ZitadelService._get_token`. Roadmap's "PAT" language corrected. | ✓ |
| Both runtime + bootstrap PAT | Doubles audit scope, risks breaking bootstrap. | |
| Bootstrap PAT only | Matches roadmap literal but misses the actual runtime invite-flow identity. | |

**User's choice:** Runtime service-account only
**Notes:** The runtime service uses `client_credentials` grant (client_id + client_secret) — distinct from the PAT that `scripts/bootstrap-zitadel.py` uses. CONTEXT.md corrects the roadmap's PAT language explicitly so downstream agents don't get confused.

### Q2: How aggressive is the narrowing?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit + conditional narrow (Recommended) | `111-SCOPE-AUDIT.md` inventories calls + minimum roles. Narrow only if current is broader than target. Integration test proves existing flows still work. | ✓ |
| Audit-only; defer narrowing | Ship the audit artifact, leave role changes to a later phase. | |
| Narrow unconditionally | Apply target role, fix whatever breaks. Fast, risky. | |
| You decide | Claude picks after the audit. | |

**User's choice:** Audit + conditional narrow

---

## Claude's Discretion (areas not asked, captured via code scout)

- **Test mocking library:** Inherited from `tests/unit/test_zitadel_token.py` — `unittest.mock.patch("httpx.AsyncClient")`. No new dependency.
- **`create_invite_code` return shape:** Plain `str` for this phase; upgrade to a dataclass when Phase 115's re-mint needs `expirationDate`. Non-breaking upgrade path.
- **Where `EnsureHumanUserResult` lives:** Default to inline in `app/services/zitadel.py`; extract to `app/services/zitadel_types.py` only if Phase 113 adds more result shapes.

## Deferred Ideas

- Retroactive retry backfill on existing ZitadelService methods (post-incident hardening phase)
- `CreateInviteCodeResult` dataclass carrying `expirationDate` (Phase 115 RECOV-01)
- Token-bucket rate limiter at 40 req/s on provisioning path (O1, when bulk-invite UI lands)
- Narrowing the bootstrap PAT (future v1.20 phase with its own audit)
- ZITADEL Hosted Login UI startup probe (Phase 115 observability or ops phase)
