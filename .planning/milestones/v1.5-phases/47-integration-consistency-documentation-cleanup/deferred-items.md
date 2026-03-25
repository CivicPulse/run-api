# Deferred Items - Phase 47

## Pre-existing Test Failures

### test_api_invites.py::TestAcceptInviteEndpoint::test_accept_invite_success
- **Found during:** 47-04 Task 1 (full unit suite verification)
- **Issue:** Test expects `zitadel_project_id` to be empty string but settings now returns `'363436702133387300'`
- **Impact:** Low -- test mock expectation is outdated, not a production bug
- **Fix:** Update test mock to match current `settings.zitadel_project_id` value
