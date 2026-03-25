# Phase 39: RLS Fix & Multi-Campaign Foundation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the active multi-tenant data isolation leak in production and establish the foundation for users to work across multiple campaigns within an org. This phase delivers correct RLS context scoping, defensive pool reset, centralized middleware, multi-campaign membership backfill, campaign visibility fix, and settings button fix. No new UI features — just correctness and foundation.

</domain>

<decisions>
## Implementation Decisions

### RLS Context Scoping
- **D-01:** Fix `set_config('app.current_campaign_id', :id, false)` to `true` (transaction-scoped) globally — applies to both web requests and background tasks (single function, one semantic)
- **D-02:** Add SQLAlchemy pool checkout event to reset `app.current_campaign_id` to null UUID on every connection acquisition — defense-in-depth alongside transaction scoping
- **D-03:** If `set_campaign_context()` fails (null campaign_id), hard fail with 403 — no request should ever run without valid RLS context on a campaign-scoped endpoint

### Centralized Middleware
- **D-04:** Replace `get_db_with_rls()` with centralized middleware that sets RLS on the request's main session — no endpoint can skip it (DATA-03)
- **D-05:** Middleware uses path-based convention: endpoints under `/campaigns/{campaign_id}/*` get RLS context automatically from the path parameter; everything else (health, auth, campaign list, future `/org/*`) skips RLS
- **D-06:** Design the middleware/pool reset to be forward-compatible with org-level context (`app.current_org_id`) — don't implement org switching, but ensure the pattern supports adding a second context variable in Phase 41 without rework

### Multi-Campaign Membership
- **D-07:** Fix `ensure_user_synced()` to create CampaignMember records for ALL campaigns in the user's org — remove `.limit(1)` (DATA-04)
- **D-08:** Fix `get_campaign_from_token()` — campaign-scoped endpoints require `campaign_id` in the URL path; `get_campaign_from_token()` becomes a fallback for the campaign list page only
- **D-09:** Campaign list endpoint returns only campaigns where a CampaignMember record exists for the authenticated user (DATA-05)

### Data Migration
- **D-10:** Create Alembic data migration to backfill missing CampaignMember records for existing users in prod — query all org users, create membership for every campaign in their org

### RLS Policy Audit
- **D-11:** Full audit of all 51 RLS policies across 6 migrations to confirm each correctly uses `current_setting('app.current_campaign_id')` — do not trust consistency, verify

### Campaign Visibility Diagnosis
- **D-12:** Investigate DATA-05 (campaigns not visible in prod) systematically: check CampaignMember records first, then verify ZITADEL org_id mapping against DB data

### Frontend Fixes
- **D-13:** Settings button fix: fix root cause (campaign resolution) AND add defensive UI guard — hide/disable settings button when campaignId is unavailable
- **D-14:** Frontend campaign switching UI deferred to Phase 43 — Phase 39 is backend-only fixes

### Testing Strategy
- **D-15:** Test-first approach: write failing RLS isolation tests that prove cross-campaign data leaks BEFORE the fix, then verify they pass after (TEST-03)
- **D-16:** Both test levels: unit tests with mocked sessions for middleware/pool logic, plus integration tests against live PostgreSQL for actual RLS policy behavior

### Background Tasks
- **D-17:** Background tasks (TaskIQ) already call `set_campaign_context()` directly — the transaction-scope fix (D-01) applies globally, so tasks get the fix automatically with no additional work

### Rollback Strategy
- **D-18:** Rollback via Alembic downgrade + ArgoCD deployment revert — standard GitOps rollback, no feature flags needed for a security fix

### Claude's Discretion
- Pool event implementation: Claude picks the specific SQLAlchemy event type (checkout vs checkin vs connect) and whether to use raw DBAPI or ORM, based on async engine semantics and codebase patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### RLS Implementation
- `app/db/rls.py` — Current `set_campaign_context()` implementation (line 21: the `false` bug)
- `app/db/session.py` — Engine and session factory (no pool events currently)
- `app/api/deps.py` — `get_db_with_rls()`, `ensure_user_synced()`, `get_campaign_from_token()` (lines 23, 39, 142)

### RLS Policies (all 6 migration files)
- `alembic/versions/001_initial_schema.py` — 9 policies
- `alembic/versions/002_voter_data_models.py` — 6 policies
- `alembic/versions/002_invites_table.py` — 3 policies
- `alembic/versions/003_canvassing_operations.py` — 12 policies
- `alembic/versions/004_phone_banking.py` — 9 policies
- `alembic/versions/005_volunteer_management.py` — 12 policies

### Auth & Security
- `app/core/security.py` — JWT validation, role enforcement, `AuthenticatedUser` model
- `app/tasks/import_task.py` — Background task RLS usage (line 42)

### Frontend
- `web/src/routes/__root.tsx` — Settings button link (line 131)
- `web/src/routes/campaigns/$campaignId/settings.tsx` — Settings route definition

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — Layered architecture, RLS data flow
- `.planning/codebase/CONVENTIONS.md` — Coding patterns, API route patterns

### Requirements
- `.planning/REQUIREMENTS.md` — DATA-01 through DATA-06 (lines 9-15)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `set_campaign_context()` in `app/db/rls.py` — single function to fix (change 3rd param)
- `async_session_factory` in `app/db/session.py` — attach pool events here
- `ensure_user_synced()` in `app/api/deps.py` — fix `.limit(1)`, add loop for all campaigns
- Existing test infrastructure with `asyncio_mode=auto` and pytest markers

### Established Patterns
- SQLAlchemy async engine with `pool_pre_ping=True` — pool event attachment point exists
- FastAPI `Depends()` chain for auth → role → DB session
- Alembic migrations with raw SQL execution for schema + data changes
- `CampaignMember` model already exists for membership tracking

### Integration Points
- Middleware hooks into `create_app()` in `app/main.py`
- Pool events attach to `engine` in `app/db/session.py`
- Campaign list endpoint in `app/api/v1/campaigns.py`
- Background tasks in `app/tasks/import_task.py` (already self-contained)

</code_context>

<specifics>
## Specific Ideas

- Org switcher UI is needed eventually but deferred to Phase 43 — Phase 39 ensures the RLS foundation is org-context-extensible
- The user wants the org switching event handled in RLS context (forward-compatible design, D-06)
- Investigation of prod campaign visibility should be systematic: membership records first, ZITADEL config second

</specifics>

<deferred>
## Deferred Ideas

- **Org switcher UI** — Phase 43 (ORG-12). Phase 39 ensures forward-compatible RLS design for `app.current_org_id`
- **Frontend campaign switching component** — Phase 43. Phase 39 fixes backend only; campaign list page is sufficient for now
- **Org-level RLS policies** — Phase 41 when org data model ships

</deferred>

---

*Phase: 39-rls-fix-multi-campaign-foundation*
*Context gathered: 2026-03-24*
