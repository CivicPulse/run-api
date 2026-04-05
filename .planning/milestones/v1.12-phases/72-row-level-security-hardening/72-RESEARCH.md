# Phase 72: Row-Level Security Hardening - Research

**Researched:** 2026-04-04
**Domain:** PostgreSQL Row-Level Security (RLS), Alembic migrations, multi-tenant DB isolation
**Confidence:** HIGH

## Summary

Phase 72 closes C5 and C6 from the 2026-04-04 codebase review via a single Alembic migration (`026_rls_hardening.py`) that:
1. Adds `FORCE ROW LEVEL SECURITY` to `campaigns`, `campaign_members`, `users` (C5 — FORCE already exists on the 003 canvassing tables; these 3 initial-schema tables got `ENABLE` but not `FORCE`).
2. Adds `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + isolation policy + `app_user` GRANTs to `organizations` and `organization_members` (C6 — no RLS today).

The scoping strategy is locked: both new policies use `current_setting('app.current_campaign_id', true)::uuid` with a subquery through `campaigns.organization_id` to derive the visible org from the active campaign context. **No new session variable is introduced.**

Existing infrastructure (`app_user` role, `set_campaign_context` helper, `two_campaigns_with_resources` fixture, integration test harness pattern from `test_rls_api_smoke.py`) is sufficient. No service/route code changes required.

**Primary recommendation:** Follow the exact pattern in `alembic/versions/003_canvassing_operations.py:332-378` (DIRECT_RLS_TABLES loop + subquery policies). Add regression tests that set campaign context to Campaign A and assert 0 rows visible from Campaign B's organization/org_members/users/campaign_members as `app_user`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RLS Policy Scoping Strategy**
- Reuse existing `app.current_campaign_id` session variable — do NOT introduce `app.current_org_id` or `app.current_user_id`. Keeps session-setting infrastructure unchanged.
- `organizations` policy: `id IN (SELECT organization_id FROM campaigns WHERE id = current_setting('app.current_campaign_id', true)::uuid)` — user sees only the organization that owns their current campaign.
- `organization_members` policy: `organization_id IN (SELECT organization_id FROM campaigns WHERE id = current_setting('app.current_campaign_id', true)::uuid)` — user sees all members of their current campaign's parent org.
- Single migration touches all 5 tables: add FORCE to `campaigns`, `campaign_members`, `users` (C5), and ENABLE+FORCE+policy on `organizations`, `organization_members` (C6).
- Migration number: `026_rls_hardening.py`, following sequential numbering. Follows the `app_user` GRANT pattern from migration 003.

**Migration Safety & Testing**
- Fully reversible: downgrade drops the two new policies and removes FORCE from the 3 core tables (leaves ENABLE where it was pre-existing).
- Integration tests hitting real Postgres via the `app_user` role: set session var to Campaign A's id, attempt SELECT on Campaign B's org/members, assert 0 rows.
- Core table regression test (C5): verify existing RLS still enforces under new FORCE constraint — attempt cross-campaign access as table owner/superuser, assert 0 rows.
- New test file: `tests/integration/test_rls_hardening.py` (alongside existing `tests/integration/test_rls_api_smoke.py`).

### Claude's Discretion
- Policy naming convention (e.g., `organizations_isolation` vs `organizations_campaign_scope`) — Claude to follow migration 003's `{table}_isolation` convention.
- Exact fixture setup for multi-org test (reuse `two_campaigns_with_resources` from Phase 71 or build new two-org fixture) — Claude to choose the cleanest approach.

### Deferred Ideas (OUT OF SCOPE)
- Introducing `app.current_org_id` session variable — deferred to a future phase if needed; current subquery approach works without it.
- Deeper user-level RLS scoping (e.g., users table filtered by self) — out of scope; current phase only adds FORCE to users table.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-05 | `campaigns`, `campaign_members`, and `users` tables have `FORCE ROW LEVEL SECURITY` enabled (C5) | Three `ALTER TABLE ... FORCE ROW LEVEL SECURITY` statements; ENABLE already exists on all 3 at `001_initial_schema.py:142-144`; policies already exist at `001_initial_schema.py:148-166`. |
| SEC-06 | `organizations` and `organization_members` tables have `ENABLE` + `FORCE ROW LEVEL SECURITY` with scoping policies (C6) | ENABLE + FORCE + CREATE POLICY + GRANT for each, matching the 003 migration pattern (`alembic/versions/003_canvassing_operations.py:332-378`). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Python linting: `uv run ruff check .` / `uv run ruff format .` (E, F, I, N, UP, B, SIM, ASYNC; 88 col)
- Always use `uv run` — never system python
- Tests: `uv run pytest` (asyncio_mode=auto, markers: integration, e2e)
- Commit after each task on a branch

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 14+ (project uses postgres:16-3.4 via postgis image) | Row-Level Security with FORCE | Native DB-level tenant isolation; the only layer that survives app-layer bugs |
| Alembic | existing | DB migration tooling | Project's established pattern; migrations 001-025 already deployed |
| SQLAlchemy async | existing | ORM / raw SQL via `op.execute` | All existing RLS migrations use `op.execute("ALTER TABLE ...")` raw SQL |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-asyncio | existing | async integration tests | New `tests/integration/test_rls_hardening.py` |
| sqlalchemy.text | existing | raw SQL in tests | Setting RLS context + assertions |

**No new dependencies required.**

## Architecture Patterns

### Migration File Structure (mirror migration 003)

```python
"""RLS hardening: FORCE on core tables + RLS on organizations.

Revision ID: 026_rls_hardening
Revises: 025_import_cleanup_and_processing_start
Create Date: 2026-04-04

Closes C5 (FORCE missing on campaigns/campaign_members/users) and
C6 (no RLS on organizations/organization_members) from the
2026-04-04 codebase review.
"""
from __future__ import annotations
from collections.abc import Sequence
from alembic import op

revision: str = "026_rls_hardening"
down_revision: str = "025_import_cleanup_and_processing_start"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- C5: FORCE RLS on core tables (ENABLE already exists from 001) ---
    op.execute("ALTER TABLE campaigns FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")

    # --- C6: Enable RLS on organization tables ---
    op.execute("ALTER TABLE organizations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY organizations_isolation ON organizations "
        "USING (id IN ("
        "SELECT organization_id FROM campaigns "
        "WHERE id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO app_user")

    op.execute("ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organization_members FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY organization_members_isolation ON organization_members "
        "USING (organization_id IN ("
        "SELECT organization_id FROM campaigns "
        "WHERE id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO app_user"
    )


def downgrade() -> None:
    # C6 reversal
    op.execute(
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON organization_members FROM app_user"
    )
    op.execute(
        "DROP POLICY IF EXISTS organization_members_isolation ON organization_members"
    )
    op.execute("ALTER TABLE organization_members NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY")

    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON organizations FROM app_user")
    op.execute("DROP POLICY IF EXISTS organizations_isolation ON organizations")
    op.execute("ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations DISABLE ROW LEVEL SECURITY")

    # C5 reversal (leaves ENABLE in place — it predates this migration)
    op.execute("ALTER TABLE users NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaigns NO FORCE ROW LEVEL SECURITY")
```

**Key decision points:**
- `down_revision` = `"025_import_cleanup_and_processing_start"` (current head; verify via `alembic history` before filing plan)
- Policy name `organizations_isolation` / `organization_members_isolation` (matches `{table}_isolation` convention from 003)
- GRANTs already exist on all tables in public schema via `001:170-176` default ALTER DEFAULT PRIVILEGES, but 003 re-grants explicitly per table — follow that pattern for clarity and to survive any future GRANT REVOKE.

### PostgreSQL `NO FORCE ROW LEVEL SECURITY` Syntax

PostgreSQL supports `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` to reverse `FORCE`. Verified against PostgreSQL 16 docs: `ALTER TABLE` synopsis includes `[ NO ] FORCE ROW LEVEL SECURITY` as dual forms. This is the correct downgrade verb (NOT `DISABLE` — that turns off RLS entirely and would bypass even the pre-existing policies on campaigns/campaign_members/users).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session variable management | Custom `app.current_org_id` | Reuse `app.current_campaign_id` via subquery | Locked decision; avoids touching `app/db/session.py:25-41` checkout listener |
| Test fixtures | New two-org fixture | Extend `two_campaigns_with_resources` (conftest.py:250-545) — each campaign already gets its own `org-res-*` string, but those are **zitadel_org_id strings, not real `organizations` rows** | Fixture does NOT currently create `organizations` or `organization_members` rows; either extend it or build a targeted `two_orgs_with_campaigns` fixture |
| RLS context restoration in tests | Manual `set_config` repeated in each test | Reuse `app/db/rls.py:set_campaign_context` | Already handles the `::uuid` cast and transaction-scoped `true` flag |

## Runtime State Inventory

This is a DB-only migration phase. The following runtime-state concerns were audited:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the migration does not rewrite any row; it only adds table-level ALTER and policies | None |
| Live service config | None — no external service holds the policy names | None |
| OS-registered state | None | None |
| Secrets/env vars | None — `app_user` password `app_password` already exists from migration 001 | None |
| Build artifacts | None | None |

**Critical runtime dependency to verify BEFORE merging:** the production/dev API currently connects to PostgreSQL as the `postgres` superuser (`docker-compose.yml:20,85`: `postgresql+asyncpg://postgres:postgres@postgres:5432/run_api`). **Superusers bypass RLS regardless of FORCE.** See "Common Pitfalls → Pitfall 4" below. The FORCE + RLS added by this migration provides defense-in-depth but does NOT protect against the live API connecting as superuser. Fixing that is out of scope for this phase.

## Common Pitfalls

### Pitfall 1: Migrations that don't survive `alembic downgrade → upgrade`
**What goes wrong:** `DROP POLICY IF EXISTS` works, but `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` on downgrade would destroy the pre-existing policies on `campaigns`/`campaign_members`/`users` (from migration 001). A subsequent `upgrade` would re-add FORCE but the base ENABLE+policy from 001 would now be disabled.
**Why it happens:** Confusing `DISABLE ROW LEVEL SECURITY` (turns RLS off entirely) with `NO FORCE ROW LEVEL SECURITY` (only removes the FORCE flag; ENABLE and policies remain).
**How to avoid:** Use `NO FORCE ROW LEVEL SECURITY` in downgrade, NOT `DISABLE ROW LEVEL SECURITY`, for C5 tables. For C6 tables (which this migration enables), downgrade MUST both drop the policy AND fully `DISABLE ROW LEVEL SECURITY` since 009/015 left them with no RLS at all.
**Warning signs:** Integration test for `test_rls_isolation.py` starts failing after a downgrade+upgrade cycle.

### Pitfall 2: Policy subquery fails when `app.current_campaign_id` is the nil-UUID
**What goes wrong:** On pool checkout, `app/db/session.py:34-38` sets `app.current_campaign_id = '00000000-0000-0000-0000-000000000000'`. The new policies run `SELECT organization_id FROM campaigns WHERE id = '00000000-...'::uuid` — this returns zero rows (no such campaign) and `id IN (empty set)` evaluates to FALSE, which is correct. No orgs visible until a real campaign context is set. Matches existing behavior of 001's `user_campaign_isolation` policy.
**Why it happens:** Expected and correct; just worth documenting in test comments.
**How to avoid:** Write a test case that verifies "nil-UUID context → 0 rows visible" for both new policies.

### Pitfall 3: Existing `OrgService` and `org.py` routes rely on NO RLS
**What goes wrong:** `app/services/org.py:22` comment explicitly says "D-17: no RLS on org data". All `/api/v1/org/*` routes use `Depends(get_db)` (`app/api/v1/org.py:42,57,80,107,140`), which is the superuser session with no campaign context. After this migration, if those sessions ever run as a non-superuser (e.g., switching to `app_user` in a future phase), every org endpoint would return empty because the policy requires a campaign context that `/org` routes don't set.
**Why it happens:** C6 reverses the earlier D-17 architectural decision.
**How to avoid:** Document that org endpoints keep `get_db` (superuser) connections. Add a code comment in `app/services/org.py` noting that this service assumes a BYPASSRLS-capable connection. If the migration to `app_user` happens later, those endpoints will need an "elevated org context" pattern.
**Warning signs:** `/api/v1/org` returns empty lists in integration tests if tests use `app_user` without campaign context.

### Pitfall 4: `FORCE ROW LEVEL SECURITY` does NOT apply to PostgreSQL superusers
**What goes wrong:** The PostgreSQL docs state: "Superusers and roles with the BYPASSRLS attribute bypass the row security system when accessing a table." FORCE only forces RLS against the *table owner* (who otherwise bypasses ENABLE'd policies). Superusers with BYPASSRLS attribute STILL bypass even FORCE. The `postgres` role (owner of all tables here) is a superuser in the dev/prod containers — it bypasses all RLS policies.
**Why it happens:** FORCE closes the owner-bypass loophole, but NOT the superuser-bypass loophole. These are two distinct mechanisms in Postgres.
**How to avoid:** (1) Run integration tests as `app_user` (not `postgres`) — already done. (2) Document prominently that this migration provides defense-in-depth: the security boundary is only real once the app connects as `app_user`. (3) Consider a follow-up phase to introduce an `app_user` runtime DATABASE_URL. Out of scope for Phase 72.
**Warning signs:** A test that connects as `postgres` sees Campaign B's data even with campaign A context set — this is expected and not a bug.

### Pitfall 5: Tests need to set campaign context BEFORE querying organizations
**What goes wrong:** An `app_user` session that queries `organizations` without first calling `set_campaign_context(session, campaign_id)` will return zero rows (because checkout resets to nil-UUID). Tests written for pre-phase-72 behavior may fail.
**Why it happens:** New policies; no existing tests had to worry about `organizations` RLS.
**How to avoid:** Audit `tests/integration/` for any test that connects as `app_user` and queries `organizations` or `organization_members` without setting campaign context. (Initial scan: no such tests exist — `OrgService` is not touched by any app_user-based test.)

## Code Examples

### Setting campaign context and verifying org isolation (test pattern)

```python
# Source: tests/integration/test_rls_api_smoke.py:507-534 (adapted)
from sqlalchemy import text
from app.db.rls import set_campaign_context

async def test_organizations_scoped_to_campaign(
    two_orgs_with_campaigns,  # new fixture to be authored
    app_user_engine,
):
    data = two_orgs_with_campaigns
    session_factory = async_sessionmaker(
        app_user_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        rows = (await s.execute(text("SELECT id FROM organizations"))).scalars().all()
        assert data["org_a_id"] in rows
        assert data["org_b_id"] not in rows
```

### Verifying FORCE regression on C5 tables

```python
async def test_campaigns_force_rls_blocks_owner(app_user_engine, two_campaigns):
    # As app_user (non-owner), selecting without context returns 0
    async with async_sessionmaker(app_user_engine, class_=AsyncSession)() as s:
        rows = (await s.execute(text("SELECT id FROM campaigns"))).scalars().all()
        assert rows == []  # nil-UUID context, no campaigns match
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ENABLE RLS only (001 pattern) | ENABLE + FORCE RLS (003+ pattern) | Migration 003 onward | FORCE closes the "table owner bypasses RLS" gap at the SQL layer |
| No RLS on organizations (D-17) | ENABLE + FORCE + policy via campaign subquery | Phase 72 (this phase) | Reverses D-17; org-level data now tenant-isolated at DB layer |

**Deprecated/outdated:**
- `app/services/org.py:22` comment "D-17: no RLS on org data" — becomes stale after this phase; plan should include updating the comment.
- `app/db/session.py:39` TODO "Phase 41: add set_config('app.current_org_id', ...)" — explicitly deferred by this phase's decisions. Plan can either leave the TODO in place or remove it with a note that campaign-scoped subquery is the current approach.

## Open Questions

1. **Should the plan include updating `app/services/org.py:22` docstring comment?**
   - What we know: D-17 ("no RLS on org data") is reversed by this phase. Comment becomes inaccurate.
   - What's unclear: Whether the planner wants a follow-up doc task or to bundle it into the migration task.
   - Recommendation: Add a small cleanup task to update the docstring + remove `app/db/session.py:39` TODO.

2. **Does the existing `two_campaigns_with_resources` fixture suffice, or do we need `two_orgs_with_campaigns`?**
   - What we know: `two_campaigns_with_resources` creates 2 campaigns but does NOT insert rows in `organizations` or `organization_members`; it uses `org-res-a-*` strings as `campaigns.zitadel_org_id` only. The test DB may or may not have `organizations` rows for these campaigns.
   - What's unclear: Whether `campaigns.organization_id` (the FK added in 009) is NULL for these fixture campaigns.
   - Recommendation: Author a new minimal `two_orgs_with_campaigns` fixture that INSERTs rows into `organizations`, sets `campaigns.organization_id` appropriately, and INSERTs `organization_members`. Keep it in `tests/integration/conftest.py` alongside peers.

3. **Should FORCE on `users` preserve the existing policy semantics?**
   - What we know: Migration 001:160-166 creates policy `user_campaign_isolation` that filters users via `campaign_members`. FORCE will apply this to all owner queries too.
   - What's unclear: Whether any internal superuser-less flow queries `users` without a campaign context. `ensure_user_synced` (deps.py:111) does `SELECT FROM users WHERE id = :user_id` — but uses `get_db()` (superuser), so it bypasses RLS regardless.
   - Recommendation: No changes required; FORCE is a no-op for superuser `get_db()` sessions. Plan should include a regression test asserting `ensure_user_synced` still works post-migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | RLS syntax (`FORCE ROW LEVEL SECURITY`, `NO FORCE`, policies) | ✓ | 16-3.4 (postgis image in docker-compose) | — |
| Alembic | migration tooling | ✓ | existing (uv managed) | — |
| `app_user` role | integration tests | ✓ | created in migration 001 (line 132-138) | — |
| `pytest` + `pytest-asyncio` | integration tests | ✓ | existing, `asyncio_mode=auto` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (existing, `asyncio_mode=auto`) |
| Config file | `pyproject.toml` (project uses `uv run pytest`) |
| Quick run command | `uv run pytest tests/integration/test_rls_hardening.py -x -m integration` |
| Full suite command | `uv run pytest -m integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-05 | FORCE RLS on campaigns blocks cross-campaign SELECT as app_user | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_campaigns_force_rls -x` | ❌ Wave 0 |
| SEC-05 | FORCE RLS on campaign_members blocks cross-campaign SELECT as app_user | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_campaign_members_force_rls -x` | ❌ Wave 0 |
| SEC-05 | FORCE RLS on users filters via campaign_members join | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_users_force_rls -x` | ❌ Wave 0 |
| SEC-06 | organizations RLS returns only current campaign's parent org | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_organizations_isolation -x` | ❌ Wave 0 |
| SEC-06 | organization_members RLS returns only current campaign's parent org members | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_organization_members_isolation -x` | ❌ Wave 0 |
| SEC-06 | organizations returns 0 rows when nil-UUID campaign context | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_organizations_empty_without_context -x` | ❌ Wave 0 |
| SEC-05+06 | Migration downgrade + upgrade cycles cleanly | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_migration_reversible -x` | ❌ Wave 0 |
| SEC-06 | Regression: existing `test_rls_api_smoke.py` still passes | integration | `uv run pytest tests/integration/test_rls_api_smoke.py -x` | ✅ exists |
| SEC-06 | Regression: existing `test_tenant_isolation.py` still passes | integration | `uv run pytest tests/integration/test_tenant_isolation.py -x` | ✅ exists |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/integration/test_rls_hardening.py -x -m integration`
- **Per wave merge:** `uv run pytest -m integration`
- **Phase gate:** `uv run pytest` (full suite) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/test_rls_hardening.py` — covers SEC-05 and SEC-06 (new file)
- [ ] New fixture `two_orgs_with_campaigns` in `tests/integration/conftest.py` (or extend `two_campaigns_with_resources`) — needed to exercise organizations/organization_members RLS
- [ ] Migration `alembic/versions/026_rls_hardening.py` itself

## Sources

### Primary (HIGH confidence)
- PostgreSQL 16 `ALTER TABLE` docs — `[ NO ] FORCE ROW LEVEL SECURITY` dual-form syntax verified.
- PostgreSQL 16 "Row Security Policies" docs — confirms that (a) FORCE forces RLS against table owners, (b) superusers with BYPASSRLS still bypass even FORCE, (c) `current_setting('name', true)` with `true` = missing_ok (returns empty string if unset).
- `alembic/versions/003_canvassing_operations.py:332-378` — reference implementation for the full ENABLE+FORCE+policy+GRANT sequence, including subquery-scoped policies (`walk_list_entries`, `walk_list_canvassers`, `survey_questions`).
- `alembic/versions/001_initial_schema.py:130-177` — pre-existing RLS on campaigns/campaign_members/users (ENABLE only, no FORCE); `app_user` role creation.
- `alembic/versions/009_organizations.py` — organizations table creation; no RLS statements.
- `alembic/versions/015_organization_members.py` — organization_members table creation; no RLS statements.
- `app/db/session.py:25-41` — pool checkout resets `app.current_campaign_id` to nil-UUID.
- `app/db/rls.py:9-30` — `set_campaign_context` helper; transaction-scoped `set_config(..., true)`.
- `tests/integration/conftest.py:39-58` — `app_user_engine` fixture; `app_user:app_password` credentials verified.
- `tests/integration/test_rls_api_smoke.py` — reference for API-level RLS tests with `_make_app_for_campaign` helper.

### Secondary (MEDIUM confidence)
- `docker-compose.yml:20,85` — API connects as `postgres` superuser; FORCE has no effect against this role (documented in Pitfall 4).
- `app/api/v1/org.py:42,57,80,107,140` — all org endpoints use `Depends(get_db)` (superuser session), unaffected by this migration at runtime.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Migration syntax: HIGH — identical pattern used 5 times in existing migrations (002b, 003, 004, 005, 022), verified against PostgreSQL 16 docs.
- Policy subquery correctness: HIGH — same subquery pattern used in 001's `user_campaign_isolation` and 003's `walk_list_entries_isolation`.
- Test fixture extension: MEDIUM — need to verify whether `two_campaigns_with_resources` actually creates `organizations` rows; grep shows it does NOT (only sets `campaigns.zitadel_org_id` strings). A new fixture is likely cleanest.
- Production security impact: HIGH — definitive finding that production uses `postgres` superuser bypasses RLS regardless of FORCE. Documented explicitly.

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days — DB patterns are stable)
