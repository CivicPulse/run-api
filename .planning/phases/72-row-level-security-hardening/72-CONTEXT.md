# Phase 72: Row-Level Security Hardening - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Core and organization tables enforce RLS at the database layer even against owner/superuser roles. Closes C5 (`FORCE ROW LEVEL SECURITY` missing on `campaigns`, `campaign_members`, `users`) and C6 (`organizations`, `organization_members` have no RLS at all) from CODEBASE-REVIEW-2026-04-04.md. This is a DB-only hardening — no service or route changes.

</domain>

<decisions>
## Implementation Decisions

### RLS Policy Scoping Strategy
- **Reuse existing `app.current_campaign_id` session variable** — do NOT introduce `app.current_org_id` or `app.current_user_id`. Keeps session-setting infrastructure unchanged.
- **`organizations` policy**: `id IN (SELECT organization_id FROM campaigns WHERE id = current_setting('app.current_campaign_id', true)::uuid)` — user sees only the organization that owns their current campaign.
- **`organization_members` policy**: `organization_id IN (SELECT organization_id FROM campaigns WHERE id = current_setting('app.current_campaign_id', true)::uuid)` — user sees all members of their current campaign's parent org.
- **Single migration** touches all 5 tables: add FORCE to `campaigns`, `campaign_members`, `users` (C5), and ENABLE+FORCE+policy on `organizations`, `organization_members` (C6).
- **Migration number**: `026_rls_hardening.py`, following sequential numbering. Follows the `app_user` GRANT pattern from migration 003.

### Migration Safety & Testing
- **Fully reversible**: downgrade drops the two new policies and removes FORCE from the 3 core tables (leaves ENABLE where it was pre-existing).
- **Integration tests hitting real Postgres** via the `app_user` role: set session var to Campaign A's id, attempt SELECT on Campaign B's org/members, assert 0 rows.
- **Core table regression test** (C5): verify existing RLS still enforces under new FORCE constraint — attempt cross-campaign access as table owner/superuser, assert 0 rows.
- **New test file**: `tests/integration/test_rls_hardening.py` (alongside existing `tests/integration/test_rls_api_smoke.py`).

### Claude's Discretion
- Policy naming convention (e.g., `organizations_isolation` vs `organizations_campaign_scope`) — Claude to follow migration 003's `{table}_isolation` convention.
- Exact fixture setup for multi-org test (reuse `two_campaigns_with_resources` from Phase 71 or build new two-org fixture) — Claude to choose the cleanest approach.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Migration pattern: `alembic/versions/003_canvassing_operations.py` demonstrates the full ENABLE + FORCE + CREATE POLICY + GRANT sequence, including subquery-based isolation for child tables (`walk_list_entries`).
- Session var infra: `app/db/session.py:25-41` resets `app.current_campaign_id` on pool checkout — no changes needed for this phase.
- Integration test harness: `tests/integration/test_rls_api_smoke.py` already exercises RLS via FastAPI TestClient with `_make_app_for_campaign` helper.
- `two_campaigns_with_resources` fixture (built in Phase 71) creates two campaigns with disjoint resources — may be reusable.

### Established Patterns
- Alembic migrations use `op.execute("ALTER TABLE ... ENABLE ROW LEVEL SECURITY")` and `op.execute("ALTER TABLE ... FORCE ROW LEVEL SECURITY")` separately.
- Policies named `{table}_isolation`.
- Every RLS-scoped table gets `GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user`.
- Session variable read via `current_setting('app.current_campaign_id', true)::uuid` (the `true` second arg = missing_ok).

### Integration Points
- `alembic/versions/001_initial_schema.py:142-166` — where ENABLE RLS was added without FORCE for campaigns/campaign_members/users.
- `alembic/versions/009_organizations.py` and `015_organization_members.py` — no RLS at all; need ENABLE+FORCE+policy added retroactively via new migration.
- `app/db/session.py:39` — TODO comment mentions `app.current_org_id`; this phase deliberately does NOT add it, using subquery-through-campaign instead.

</code_context>

<specifics>
## Specific Ideas

- Follow the exact patterns in `.planning/CODEBASE-REVIEW-2026-04-04.md` C5 and C6.
- Migration must be testable with `alembic upgrade head` and `alembic downgrade -1` cleanly.
- Tests should verify both the positive path (Campaign A sees its own org) and negative path (Campaign A cannot see Campaign B's org, even if orgs differ).

</specifics>

<deferred>
## Deferred Ideas

- Introducing `app.current_org_id` session variable — deferred to a future phase if needed; current subquery approach works without it.
- Deeper user-level RLS scoping (e.g., users table filtered by self) — out of scope; current phase only adds FORCE to users table.

</deferred>
