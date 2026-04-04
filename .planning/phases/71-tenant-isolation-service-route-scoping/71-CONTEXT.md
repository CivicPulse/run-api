# Phase 71: Tenant Isolation — Service & Route Scoping - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Every service query and sub-resource route scopes by `campaign_id` so no authenticated user can read, mutate, or delete data belonging to a campaign they do not have membership in. Closes IDOR vulnerabilities C1-C4 from CODEBASE-REVIEW-2026-04-04.md covering `list_campaigns`, `VoterListService`, `ImportJob` routes, `revoke_invite`, `voter_tags.add_tag`, and surveys script/question routes.

</domain>

<decisions>
## Implementation Decisions

### Enforcement Pattern & Error Handling
- Enforce campaign scoping at the **service layer**: add `campaign_id` predicate to every query in `VoterListService`, `InviteService.revoke_invite`, `ImportJob` lookups, `voter_tags.add_tag`, and surveys script/question services.
- Cross-campaign access returns **404 Not Found** (prevents UUID enumeration attacks), not 403.
- `list_campaigns` filters to **campaigns where the requesting user has a CampaignMember row** — strict membership-based visibility, no org-wide fallback.
- Use **inline guards** (`if obj is None or obj.campaign_id != campaign_id: raise HTTPException(404)`) per service method. No shared `_assert_campaign_scope` helper — matches review fixes exactly, zero new abstraction.

### Test Strategy
- **Integration tests** (not unit tests) using FastAPI TestClient to prove full route+service enforcement.
- **Two-campaign fixture** in shared conftest: Campaign A (with admin user), Campaign B (with volunteer user). Cross-campaign attacks executed as Campaign A's admin attempting to reach Campaign B resources.
- **One test per affected endpoint** (≈15 tests total across list_campaigns, VoterList 5 methods, ImportJob 4 routes, revoke_invite, add_tag, surveys script/question). Explicit and discoverable.
- Each endpoint gets **both positive (same-campaign access succeeds)** and **negative (cross-campaign returns 404)** assertions to ensure the fix doesn't break legitimate access.

### Claude's Discretion
- Exact test file organization (single `test_tenant_isolation.py` vs. per-service test files) — Claude to choose based on existing test layout conventions.
- Whether to add defensive `campaign_id` filter at route layer as well (defense in depth) — Claude to defer to service-layer-only per review unless a specific route shape makes route-layer checks simpler.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- FastAPI `HTTPException` with `status_code=404` is already the project's standard not-found pattern.
- `AuthenticatedUser` dependency from `app.core.security` provides `user.id` and `user.org_id` for membership lookups.
- `CampaignMember` model in `app/models/` already maps user-to-campaign relationships for membership checks.
- Existing `delete_import` in `app/api/v1/imports.py` already enforces campaign scoping correctly — use as pattern reference for fixing other ImportJob routes.

### Established Patterns
- Service methods accept `db: AsyncSession` as first arg, return domain objects or raise typed exceptions (e.g., `VoterNotFoundError`).
- Routes use `campaign_id: UUID` path parameter and inject `AuthenticatedUser` via `Depends`.
- Tests use `asyncio_mode=auto` (pytest-asyncio), with markers `integration` and `e2e`.
- Integration tests use FastAPI TestClient with DB fixtures; convention matches `tests/` layout.

### Integration Points
- `app/services/campaign.py:248` — `list_campaigns` query to be filtered by `CampaignMember.user_id == user.id`.
- `app/services/voter_list.py:70,96,119` — add `VoterList.campaign_id == campaign_id` predicate to all queries.
- `app/api/v1/imports.py:184,277,351,401` — add campaign_id check after `db.get(ImportJob, import_id)`.
- `app/services/invite.py:257` — add `Invite.campaign_id == campaign_id` predicate.
- `app/api/v1/voter_tags.py`, `app/api/v1/surveys.py` (script/question routes) — same pattern.

</code_context>

<specifics>
## Specific Ideas

- Follow the exact fix snippets in `.planning/CODEBASE-REVIEW-2026-04-04.md` sections C1-C4 as the implementation baseline.
- Each affected endpoint needs both a positive test (legitimate same-campaign access returns 200) and a negative test (cross-campaign attempt returns 404, not 200/403).
- Test assertions must check response.status_code == 404 — not just "not 200" — to prove the enumeration-safe error path.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. RLS enforcement at the DB layer is Phase 72's responsibility.

</deferred>
