# Phase 63: Phone Banking API + Data Resilience - Research

**Researched:** 2026-03-31
**Domain:** FastAPI phone-banking session lifecycle + Playwright deterministic fixture design
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Session Delete Endpoint Contract
- **D-01:** Implement `DELETE /campaigns/{campaign_id}/phone-bank-sessions/{session_id}` as a guarded hard delete that returns `204 No Content` on success.
- **D-02:** Deletion is allowed only for non-active sessions (`draft`, `paused`, `completed`); active sessions are rejected with a clear 422-style validation error.
- **D-03:** Deleting a session removes the session record and its caller assignments; call history, voter interactions, and DNC effects remain as independent audit/operational records.

### Deterministic Active-Calling Test Data
- **D-04:** Default strategy is per-spec API-built disposable data for phone-banking flows; specs must not depend on long-lived pre-seeded phone-banking sessions for claimable entries.
- **D-05:** Specs create their own call list/session/entries for active-calling assertions and consume only that generated data.

### Isolation Boundary
- **D-06:** Enforce strict per-spec isolation for phone-banking and field phone-banking flows; no shared mutable phone-banking fixtures across PB/FIELD specs.
- **D-07:** Shared baseline seed data may still be used for navigation/auth context, but active-calling entities are spec-owned and disposable.

### Unskip and Verification Bar
- **D-08:** Remove BUG-01 skip gating for PB-10 and FIELD-08/09/10; these tests must execute assertions end-to-end.
- **D-09:** No-skip is mandatory in CI and local runs for the affected tests; any failure is treated as a regression rather than an expected skip path.

### Carry Forward from Prior Phases
- **D-10:** Preserve established E2E pattern of API-first setup for speed and determinism (Phase 59/60 pattern).
- **D-11:** Preserve role-auth project conventions and existing Playwright helper style when extending specs.

### the agent's Discretion
- Exact helper function layout/naming in E2E specs for creating disposable phone-banking artifacts
- Exact error payload wording/details for delete-while-active validation response, as long as contract and status behavior above are preserved
- Whether per-spec data helpers live in `web/e2e/helpers.ts` or local spec helper sections, as long as isolation guarantees remain strict

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-15 | Automated tests verify phone banking session CRUD, caller assignment, active calling, and progress tracking (PB-01 through PB-10) | Adds missing session DELETE API contract for PB-10, plus deterministic fixture strategy for claimable entries so active-calling assertions are stable |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Source: `.hatchkit/AGENTS.md`

- Write clear, self-documenting code.
- Prefer small, focused functions and modules.
- Always add or update tests when changing behaviour.
- Keep dependencies minimal.
- Workflow: agree approach, implement smallest viable change, verify with tests/lint before completion.

## Summary

Phase 63 is primarily an integration-hardening phase, not a new feature architecture phase. The frontend already calls `DELETE /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}` (`useDeletePhoneBankSession`), and the sessions UI already exposes a destructive delete flow. Current PB-10 failure is backend contract drift: route missing in `app/api/v1/phone_banks.py`, causing 405 and forced skip.

The most reusable backend pattern is already present in adjacent modules: route-level role guard + service-level validation + `ProblemResponse` for 404/422 + explicit `Response(status_code=204)` on success. `PhoneBankService` also already contains the primitives needed for delete safety (`get_session`, `_release_session_entries`, caller removal and lifecycle checks). This enables a minimal, consistent implementation with no schema changes.

Test fragility root cause is shared mutable seed data in field-mode phone banking: FIELD-08/09/10 consume an existing seeded session/call list that can be exhausted before these tests run. The stable fix is per-spec disposable artifacts created via API in setup (call list -> activate -> session -> activate -> assign volunteer), with strict no-skip enforcement for PB-10 and FIELD-08/09/10.

**Primary recommendation:** Implement a guarded hard-delete service+route consistent with existing 204 delete patterns, then convert PB-10 and FIELD-08/09/10 to spec-owned API-built fixtures and remove BUG-01 skip paths entirely.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | `>=0.135.1` (project-pinned) | HTTP route contract for session delete | Existing API layer already built around FastAPI dependency injection + role guards |
| SQLAlchemy (async) | `>=2.0.48` (project-pinned) | Service-layer data mutation and transactional delete | Existing phone-bank/call-list services use async SQLAlchemy patterns consistently |
| fastapi-problem-details | `>=0.1.4` (project-pinned) | 404/422 problem responses | Existing phone bank route error paths already use this for user-facing API errors |
| Playwright | `^1.58.2` (`web/package.json`) | E2E verification for PB/FIELD flows | Existing v1.7 validation framework and CI execution standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | `^5.90.21` | Session list invalidation after delete | Keep existing `useDeletePhoneBankSession` behavior; no custom cache logic |
| Existing E2E helpers (`web/e2e/helpers.ts`) | in-repo | Authenticated API setup/teardown (`apiPost/apiPatch/apiDelete`) | Build disposable call list/session fixtures quickly and deterministically |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard delete (guarded) | Soft delete (`deleted_at`) | Adds schema/API/UI complexity outside Phase 63 scope; not required by locked decisions |
| Per-spec API-built fixtures | Rely on long-lived seed sessions | Reintroduces order-dependent data exhaustion and skip-prone behavior |

**Installation:**
```bash
# None. Use existing project dependencies.
```

## Architecture Patterns

### Recommended Project Structure
```text
app/
├── api/v1/phone_banks.py      # Add DELETE session route (manager+)
├── services/phone_bank.py     # Add guarded delete_session service logic
└── schemas/phone_bank.py       # No new schema required for 204 delete

tests/
└── unit/test_phone_bank.py     # Add service tests for delete guard + behavior

web/e2e/
├── phone-banking.spec.ts        # Unskip PB-10, run full delete assertions
├── field-mode.volunteer.spec.ts # Replace BUG-01 skip path with disposable fixture setup
└── helpers.ts                   # Optional shared helper extraction for PB fixture builder
```

### Pattern 1: Route-level 204 delete + service validation
**What:** Keep API thin: role check + service call + commit + `204` response; map service errors to 404/422 ProblemResponse.
**When to use:** New session DELETE endpoint.
**Example:**
```python
# Source: app/api/v1/call_lists.py (delete pattern), app/api/v1/phone_banks.py (problem mapping)
@router.delete("/campaigns/{campaign_id}/phone-bank-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(...):
    await ensure_user_synced(user, db)
    try:
        await _phone_bank_service.delete_session(db, session_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Session Delete Failed",
            detail=str(exc),
            type="session-delete-failed",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

### Pattern 2: Service owns lifecycle guardrails
**What:** Validate session status in service (`active` forbidden), perform deletion of child assignments and session row.
**When to use:** Any lifecycle-sensitive mutation where state machine rules apply.
**Example:**
```python
# Source: app/services/phone_bank.py (status transition enforcement + helpers)
pb_session = await self.get_session(session, session_id)
if pb_session is None:
    raise ValueError(f"Session {session_id} not found")
if pb_session.status == SessionStatus.ACTIVE:
    raise ValueError(f"Session {session_id} is active and cannot be deleted")

await session.execute(delete(SessionCaller).where(SessionCaller.session_id == session_id))
await session.delete(pb_session)
```

### Pattern 3: API-first disposable E2E fixture provisioning
**What:** In `beforeAll`/test-setup, create disposable call list and session through authenticated API helpers, activate both, assign caller, then assert on known-fresh data.
**When to use:** PB-10 and FIELD-08/09/10 no-skip stabilization.
**Example:**
```ts
// Source: web/e2e/helpers.ts + web/e2e/phone-banking.spec.ts existing API helper style
const callListId = await createCallListViaApi(page, campaignId, `E2E PB ${Date.now()}`)
await apiPatch(page, `/api/v1/campaigns/${campaignId}/call-lists/${callListId}`, { status: "active" })
const sessionId = await createSessionViaApi(page, campaignId, `E2E Session ${Date.now()}`, callListId)
await apiPatch(page, `/api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`, { status: "active" })
await assignCallerViaApi(ownerPage, campaignId, sessionId, volunteerUserId)
```

### Anti-Patterns to Avoid
- **Shared mutable seed session for active-calling tests:** causes FIELD-08/09/10 skip drift as claimable entries get consumed.
- **Route-only guard logic without service enforcement:** bypass risk if service reused elsewhere.
- **Silent fallback assertions (“all done” accepted) for required flows:** hides regressions and undermines no-skip requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated E2E API calls | Custom fetch/token parsing in each spec | `apiGet/apiPost/apiPatch/apiDelete` from `web/e2e/helpers.ts` | Existing helper centralizes auth/header behavior and timeout defaults |
| Session lifecycle rules | Ad hoc status checks in route only | `PhoneBankService` lifecycle checks | Keeps state-machine logic consistent and testable |
| Claim concurrency | Manual assignment SQL in specs/tests | Existing call-list claim endpoint/service (`FOR UPDATE SKIP LOCKED`) | Prevents race conditions and lock bugs |

**Key insight:** this phase should compose existing backend and E2E primitives; new bespoke fixture frameworks are unnecessary.

## Common Pitfalls

### Pitfall 1: Deleting active sessions without guard
**What goes wrong:** Live callers and in-progress work can be orphaned or semantically inconsistent.
**Why it happens:** Route deletion implemented as generic hard delete without lifecycle check.
**How to avoid:** Service-level status validation: reject `active` with 422 problem payload.
**Warning signs:** PB-10 passes but active-session delete also succeeds in manual API test.

### Pitfall 2: Paused session may still have in-progress claims
**What goes wrong:** Deleting paused session can leave temporary `IN_PROGRESS` entries tied to old claim state until stale-claim timeout.
**Why it happens:** Claims are call-list scoped, not session scoped.
**How to avoid:** Validate expected behavior in tests; optionally release session entries pre-delete if needed for deterministic cleanup.
**Warning signs:** FIELD phone-bank screens show no immediately claimable entry right after fixture teardown/setup transitions.

### Pitfall 3: Cross-spec data exhaustion
**What goes wrong:** FIELD-08/09/10 intermittently skip due to no voter card.
**Why it happens:** Tests depend on long-lived seed session/call-list consumption order.
**How to avoid:** Create disposable per-spec call list/session with guaranteed fresh entries.
**Warning signs:** Skip messages mention empty/completed call list; failures vary by run order.

### Pitfall 4: Role-context mismatch in fixture setup
**What goes wrong:** Volunteer context cannot create/assign management artifacts; setup partially succeeds.
**Why it happens:** Manager+ permissions required for call list/session/caller assignment mutations.
**How to avoid:** Keep owner/manager context for fixture creation, volunteer context for field assertions.
**Warning signs:** 403/422 in setup API calls before test body starts.

## Code Examples

### Existing reusable delete pattern (backend)
```python
# Source: app/api/v1/call_lists.py: delete_call_list
await _call_list_service.delete_call_list(db, call_list_id)
await db.commit()
return Response(status_code=status.HTTP_204_NO_CONTENT)
```

### Existing reusable E2E API helper pattern
```ts
// Source: web/e2e/helpers.ts
export async function apiDelete(page: Page, url: string, timeout = 60_000) {
  return page.request.delete(url, {
    headers: await authHeaders(page),
    timeout,
  })
}
```

### Existing known gap marker to remove
```ts
// Source: web/e2e/phone-banking.spec.ts
test.skip(true, "Backend DELETE /phone-bank-sessions/{id} endpoint not yet implemented (returns 405)")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Seed-dependent phone-banking assertions with BUG-01 skip fallback | Per-spec disposable API-built phone-banking fixtures | Phase 63 target | Deterministic no-skip PB/FIELD phone-banking coverage |
| API contract mismatch (frontend delete mutation exists, backend route missing) | API-complete session CRUD with guarded delete | Phase 63 target | PB-10 can execute real delete lifecycle instead of permanent skip |

**Deprecated/outdated:**
- BUG-01-based permanent skip paths in PB-10 and FIELD-08/09/10 after implementation.

## Open Questions

1. **Should paused-session delete proactively release in-progress entries?**
   - What we know: decision permits deleting `paused`; claims are call-list scoped and can remain `IN_PROGRESS` until stale timeout.
   - What's unclear: whether product expects immediate claimability after paused-session deletion in all environments.
   - Recommendation: add explicit unit/API assertion for chosen behavior and document it in response contract.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | Backend unit test/lint commands | ✓ | 0.8.14 | — |
| `node` | Playwright + frontend tooling | ✓ | v24.13.1 | — |
| `npm`/`npx` | Playwright execution via wrapper | ✓ | 11.8.0 | — |
| Docker | Local compose-backed E2E environment | ✓ | 29.3.1 | Use existing running env if already provisioned |

**Missing dependencies with no fallback:**
- None found.

**Missing dependencies with fallback:**
- None found.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Pytest (backend unit) + Playwright (E2E) |
| Config file | `pyproject.toml` (`[tool.pytest.ini_options]`), `web/playwright.config.ts` |
| Quick run command | `uv run pytest tests/unit/test_phone_bank.py -x` |
| Full suite command | `uv run pytest && cd web && ./scripts/run-e2e.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-15-A | Session delete endpoint returns 204 for non-active sessions | backend unit/api | `uv run pytest tests/unit/test_phone_bank.py -k "delete and session" -x` | ❌ Wave 0 |
| E2E-15-B | Active session delete rejected with 422 validation | backend unit/api | `uv run pytest tests/unit/test_phone_bank.py -k "active and delete" -x` | ❌ Wave 0 |
| E2E-15-C | PB-10 executes delete lifecycle without skip | e2e | `cd web && ./scripts/run-e2e.sh phone-banking.spec.ts --project=chromium --grep "PB-10"` | ✅ |
| E2E-15-D | FIELD-08/09/10 execute phone-banking assertions without skip | e2e | `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-08|FIELD-09|FIELD-10"` | ✅ |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_phone_bank.py -x`
- **Per wave merge:** `cd web && ./scripts/run-e2e.sh phone-banking.spec.ts field-mode.volunteer.spec.ts --project=chromium --project=volunteer`
- **Phase gate:** Full targeted backend + E2E green; no skips in PB-10 and FIELD-08/09/10.

### Wave 0 Gaps
- [ ] `tests/unit/test_phone_bank.py` — add `delete_session` service tests (non-active success, active blocked, not-found)
- [ ] API route coverage for new `DELETE /phone-bank-sessions/{session_id}` contract (204/422/404)
- [ ] `web/e2e/field-mode.volunteer.spec.ts` — replace BUG-01 `test.skip()` with deterministic fixture setup assertions
- [ ] Skip-regression check to fail if PB-10 or FIELD-08/09/10 reintroduce `test.skip(` paths

## Sources

### Primary (HIGH confidence)
- `.planning/phases/63-phone-banking-api-data-resilience/63-CONTEXT.md` — locked decisions and no-skip scope
- `.planning/ROADMAP.md` (Phase 63 section) — goal/success criteria for INT-02 + BUG-01 closure
- `.planning/REQUIREMENTS.md` — E2E-15 traceability target
- `app/api/v1/phone_banks.py` — existing phone-bank API routes and error-handling style
- `app/services/phone_bank.py` — lifecycle and caller/session behavior to extend for delete
- `app/services/call_list.py` + `app/api/v1/call_lists.py` — canonical delete endpoint/service pattern
- `tests/unit/test_phone_bank.py` — existing service-test style and gaps
- `web/e2e/helpers.ts` — standardized API-first test helper style
- `web/e2e/phone-banking.spec.ts` — PB-10 skip location and session fixture pattern
- `web/e2e/field-mode.volunteer.spec.ts` — FIELD-08/09/10 BUG-01 skip behavior
- `web/src/hooks/usePhoneBankSessions.ts` + sessions route UI — frontend already wired to delete endpoint
- `pyproject.toml`, `web/playwright.config.ts`, `web/scripts/run-e2e.sh`, `web/package.json` — validation and runtime execution architecture

### Secondary (MEDIUM confidence)
- `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-BUGS.md` — BUG-01 root-cause context and prior handling

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - entirely derived from in-repo pinned dependencies and current code usage
- Architecture: HIGH - route/service/test patterns directly observed in current implementation
- Pitfalls: HIGH - confirmed by current skips, missing endpoint, and call-list/session coupling in code

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable codebase patterns; re-check if major phone-banking refactor lands)
