# Deferred Items — Phase 72

## Pre-existing failures (out of scope)

### tests/integration/test_canvassing_rls.py::test_door_knock_persists_survey_responses_for_authoritative_readback
- **Status:** FAILING on base branch (pre-existing; not caused by Phase 72 changes)
- **Error:** `ValueError: Survey responses require a walk list with an attached survey script` (app/services/canvass.py:150)
- **Scope:** Canvassing service — unrelated to RLS hardening
- **Action:** Defer to canvassing subsystem owner; file separate issue if not already tracked
