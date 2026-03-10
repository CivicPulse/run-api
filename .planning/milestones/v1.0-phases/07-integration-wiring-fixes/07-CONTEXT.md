# Phase 7: Integration Wiring Fixes - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix runtime wiring gaps identified in the v1.0 milestone audit (INT-01, INT-02, FLOW-01). ZitadelService must be initialized in the app lifespan so campaign CRUD, invite accept, and member management work without AttributeError. Phone banking models must be discoverable by Alembic autogenerate. No new features — strictly wiring fixes.

</domain>

<decisions>
## Implementation Decisions

### ZitadelService Lifespan Init
- Fail fast on startup if ZITADEL is unreachable, credentials are invalid, or config is missing (empty client_id/secret)
- Validate credentials at startup by attempting a token exchange (_get_token()) — bad config surfaces at deploy time, not on first user request
- No cleanup needed on shutdown — current ZitadelService creates a new httpx.AsyncClient per request, no persistent connection to close
- Missing config (empty zitadel_service_client_id or zitadel_service_client_secret) is a startup error, not a warning

### Alembic Model Discovery
- Full audit of app/models/ against app/db/base.py — not just the three known gaps (call_list, phone_bank, dnc)
- Add all missing model imports to base.py
- Add a regression test that asserts every .py model file in app/models/ is imported in app/db/base.py — prevents future drift

### Verification
- Unit test with mock for ZitadelService lifespan wiring (consistent with existing test patterns that mock zitadel_service on app.state)
- Model file coverage test for Alembic discovery (no DB needed — just checks imports against filesystem)
- E2E campaign creation flow test (with mocked ZITADEL) to directly validate FLOW-01 closure
- Startup failure tests for all three fail-fast scenarios:
  - Missing config (empty client_id/secret)
  - Invalid credentials (ZITADEL returns 401)
  - ZITADEL unreachable (connection timeout/refused)

### Claude's Discretion
- Exact error messages for startup failures
- Test file organization (new module vs alongside existing)
- How the model coverage test discovers and compares files

</decisions>

<specifics>
## Specific Ideas

No specific requirements — fixes are clearly defined by the v1.0 audit report (INT-01, INT-02, FLOW-01).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ZitadelService` (app/services/zitadel.py): Already fully implemented with _get_token(), create/deactivate/delete org, role management. Just needs instantiation in lifespan.
- `app/core/config.py`: Already has `zitadel_issuer`, `zitadel_service_client_id`, `zitadel_service_client_secret` settings.
- `app/models/__init__.py`: Already imports all 18 models including the missing ones — can be used as the source of truth for the audit.

### Established Patterns
- Lifespan pattern (app/main.py): Imports at function level to avoid circular imports, stores services on `app.state`, yields, then cleans up.
- Route handlers access via `request.app.state.zitadel_service` (campaigns.py:38, invites.py:120, members.py:115/170/218).
- Test fixtures mock `app.state.zitadel_service` directly (test_api_campaigns.py:138, test_api_invites.py:146, test_api_members.py:92).

### Integration Points
- `app/main.py:lifespan()` — add ZitadelService init between JWKSManager and StorageService
- `app/db/base.py` — add missing import lines after existing imports (line 29)
- Existing test files for campaigns, invites, members already exercise the dependent endpoints

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-integration-wiring-fixes*
*Context gathered: 2026-03-10*
