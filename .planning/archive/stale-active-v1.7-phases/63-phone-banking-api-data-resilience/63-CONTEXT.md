# Phase 63: Phone Banking API + Data Resilience - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Make phone banking session lifecycle API-complete and remove data-exhaustion fragility from active-calling tests. Specifically: add the missing session delete endpoint and make PB-10 plus FIELD-08/09/10 run with deterministic, claimable data instead of BUG-01 skip paths.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Gap Definitions
- `.planning/ROADMAP.md` — Phase 63 goal, success criteria, and dependency chain
- `.planning/v1.7-MILESTONE-AUDIT.md` — INT-02 (missing DELETE endpoint) and BUG-01 (phone-banking data exhaustion) evidence
- `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-BUGS.md` — BUG-01 details and observed skip behavior

### Backend Phone-Banking API and Service
- `app/api/v1/phone_banks.py` — Existing phone-bank routes; currently missing session DELETE endpoint
- `app/services/phone_bank.py` — Session lifecycle logic and caller/session operations where delete semantics should align
- `app/schemas/phone_bank.py` — Request/response schema patterns and existing API contract style
- `tests/unit/test_phone_bank.py` — Existing service-level testing patterns for session lifecycle behavior

### E2E Specs Affected by This Phase
- `web/e2e/phone-banking.spec.ts` — PB-10 currently skipped due to missing backend DELETE endpoint
- `web/e2e/field-mode.volunteer.spec.ts` — FIELD-08/09/10 currently skip when claimable phone-banking entries are exhausted
- `web/e2e/helpers.ts` — Shared API helper patterns for deterministic setup/teardown in Playwright tests

### Cross-Phase Context
- `.planning/phases/59-e2e-advanced-tests/59-CONTEXT.md` — Prior E2E strategy (API-based setup, serial-in-spec execution)
- `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-CONTEXT.md` — Field-mode testing constraints and BUG tracking conventions
- `.planning/phases/62-ci-auth-policy-automation/62-01-SUMMARY.md` — Recent CI determinism approach and strict-failure pattern context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PhoneBankService` lifecycle methods in `app/services/phone_bank.py` already provide create/get/list/update patterns that delete can follow
- Route-layer problem response patterns in `app/api/v1/phone_banks.py` for 404/422 conflict and validation handling
- Existing Playwright API helpers (`apiPost`, `apiPatch`, `apiDelete`, `apiGet`) already used by phone-banking specs for setup speed and determinism

### Established Patterns
- Backend delete endpoints commonly return `204` with route-level role enforcement and service-layer validation
- E2E specs use serial flow within file + API setup helpers to avoid slow UI-only entity creation
- BUG-tracked skips were used in Phase 60 as temporary gap markers; this phase converts those to executable assertions

### Integration Points
- Add session DELETE route + service method in backend phone-banking modules, then wire unit/API tests
- Update `web/e2e/phone-banking.spec.ts` PB-10 to execute full delete lifecycle
- Update `web/e2e/field-mode.volunteer.spec.ts` FIELD-08/09/10 setup so each test has claimable entries from spec-owned artifacts

</code_context>

<specifics>
## Specific Ideas

- Guarded hard delete is preferred over soft-delete expansion to keep this phase focused on API completeness and test unblock
- Test-data resilience should come from spec-owned API setup, not repeated reseeding of shared long-lived sessions
- CI should enforce no-skip behavior for PB-10 and FIELD-08/09/10 after this phase, matching the milestone gap-closure intent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 63-phone-banking-api-data-resilience*
*Context gathered: 2026-03-31*
