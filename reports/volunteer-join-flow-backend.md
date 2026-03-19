# Volunteer Join Flow — Backend Implementation Report

**Date:** 2026-03-18
**Branch:** `feat/volunteer-signup-flow`
**Commit:** `33f9104`

---

## Summary

This report documents the implementation of the volunteer self-registration (join) flow backend for the CivicPulse run-api. The feature enables prospective volunteers to discover a campaign via a public URL slug and register themselves with a single authenticated API call.

---

## Files Created

### `app/utils/slug.py`
URL-safe slug generation using only the Python `re` standard library module.

- `generate_slug(name: str) -> str` — lowercases, replaces non-alphanumeric runs with hyphens, strips leading/trailing hyphens.
- `generate_unique_slug(name: str, existing_slugs: set[str]) -> str` — appends `-2`, `-3`, etc. until a collision-free slot is found.

Edge cases handled: empty string, all-punctuation names, strings with leading/trailing separators, single-word names.

### `app/schemas/join.py`
Two Pydantic schemas inheriting from `BaseSchema` (ORM mode enabled):

- `CampaignPublicInfo` — exposes only the fields a prospective volunteer needs (slug, name, candidate_name, party_affiliation, election_date, type, jurisdiction_name).
- `JoinResponse` — returned after successful registration (campaign_id, campaign_slug, volunteer_id, message).

All UUID fields are serialised as strings for frontend convenience.

### `app/services/join.py`
`JoinService` class with two async methods:

**`get_campaign_public_info(slug, db)`**
Queries `campaigns` table filtering on `slug = slug AND status = ACTIVE`. Raises `CampaignNotFoundError` (sentinel UUID `int=0`) when not found so the API layer maps it to HTTP 404.

**`register_volunteer(slug, user, db, zitadel)`**
Atomic registration flow:
1. Resolve campaign by slug (raises `CampaignNotFoundError` if inactive/missing).
2. Check for existing `CampaignMember` (raises `ValueError("already_registered:<campaign_id>")` on duplicate).
3. Insert `CampaignMember(role="volunteer")`.
4. Insert `Volunteer` with first/last name split from `user.display_name`, email from JWT, `status="active"`, `skills=[]`.
5. Assign ZITADEL `volunteer` project role via `zitadel.assign_project_role()`. This step is **best-effort**: a ZITADEL failure is logged as a warning but does not abort the DB commit. The local DB records are the authoritative source of truth; a reconciliation job can fix ZITADEL state later.
6. Commits and returns `{campaign_id, campaign_slug, volunteer_id}`.

### `app/api/v1/join.py`
Two FastAPI endpoints:

- `GET /api/v1/join/{slug}` — **public**, no auth. Returns `CampaignPublicInfo`. Returns HTTP 404 on `CampaignNotFoundError`.
- `POST /api/v1/join/{slug}/register` — requires JWT bearer auth via `get_current_user` (**not** `require_role`). Returns 201 `JoinResponse` on success, 404 on missing campaign, 409 `{"campaign_id": "<uuid>"}` on duplicate registration.

### `alembic/versions/010_campaign_slug.py`
Migration `010_campaign_slug` (down_revision: `009_organizations`):
1. Adds nullable `VARCHAR(255) slug` column to `campaigns`.
2. Backfills using a PostgreSQL CTE that derives base slug via `LOWER(REGEXP_REPLACE(...))` and disambiguates duplicates with `ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id)`.
3. Creates unique index `ix_campaigns_slug`.

The column is kept nullable to allow a zero-downtime rollout — existing rows are backfilled, and the service layer always sets a value on new rows.

### Test files
- `tests/unit/test_slug.py` — 14 tests for `generate_slug` and `generate_unique_slug`.
- `tests/unit/test_join_service.py` — 8 async tests covering happy path, 404, 409, name splitting edge cases, None display_name, and ZITADEL failure resilience.
- `tests/unit/test_join_api.py` — 5 async tests for the HTTP layer (200, 404, 201, 409).

---

## Files Modified

### `app/models/campaign.py`
Added `slug: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)`.

### `app/services/campaign.py`
In `create_campaign()`, just before `Campaign(...)` construction: fetches all existing non-null slugs with `select(Campaign.slug).where(Campaign.slug.is_not(None))` and calls `generate_unique_slug(name, existing_slugs)` to set `campaign.slug`.

Import `generate_unique_slug` added at module level.

### `app/api/v1/router.py`
Added `join` to the import block and registered `join.router` with tag `"join"`.

### `tests/unit/test_campaign_service.py`
Updated `mock_db` fixture to configure the default `execute` return value to support both `scalar_one_or_none()` and `scalars().all()` call patterns. This was required because the new slug query uses the latter.

### `tests/unit/test_api_campaigns.py`
Added a slug-query mock result to the `side_effect` list in `test_create_campaign_success` (one additional `execute` call in `create_campaign()`).

### `tests/unit/test_lifespan.py`
Same fix: added a slug-query mock result to the e2e `execute` side_effect list.

---

## Design Decisions

### Why `CampaignNotFoundError(uuid.UUID(int=0))` in `get_campaign_public_info`?
`CampaignNotFoundError` was designed to carry a UUID (not a slug). Rather than change its signature — which would ripple across many existing exception handlers — we pass a sentinel zero-UUID. The error message is overridden by the HTTP 404 response anyway.

**Future improvement:** Accept `str | uuid.UUID` in `CampaignNotFoundError.__init__` and update the message accordingly.

### Why best-effort ZITADEL role assignment?
ZITADEL is an external service. Rolling back the local DB transaction on ZITADEL failures would create a poor UX (the user gets an error even though the campaign logic is valid). The existing `delete_campaign` pattern does the same. A background reconciliation or health check should detect and retry failed role assignments.

### Why not `require_role` on the register endpoint?
Brand-new users who click a join link have no ZITADEL project role yet. `require_role` would check `CampaignMember.role` (which doesn't exist) and fall back to the JWT role (`VIEWER`), which would pass only if `minimum="viewer"` — but even then, the tight coupling is unnecessary. Using `get_current_user` directly is both simpler and semantically correct.

### Slug uniqueness strategy
The `generate_unique_slug` approach reads all existing slugs in one query and computes the suffix in Python. This avoids a retry loop and is safe under low concurrency. For high-throughput scenarios a unique constraint violation with retry would be more robust; the DB unique index will catch any race condition and the service layer would need to handle `IntegrityError` with a retry. This is a known limitation to address if the create-campaign endpoint sees heavy concurrent traffic.

---

## Test Coverage

| File | Tests | Scenarios Covered |
|---|---|---|
| `test_slug.py` | 14 | lowercasing, special chars, collapse, strip edges, empty, digits, unicode, unique with gaps/many collisions |
| `test_join_service.py` | 8 | happy path, not found, duplicate, name splitting (2 words, 1 word, None), ZITADEL failure |
| `test_join_api.py` | 5 | GET 200, GET 404, POST 201, POST 404, POST 409 |

All 451 unit tests pass.

---

## Known Limitations / Future Improvements

1. **Slug race condition**: Under concurrent campaign creation, two requests could read the same `existing_slugs` set and both try to insert the same slug. The DB unique index will reject one — the service would need to catch `sqlalchemy.exc.IntegrityError` and retry. Low risk for current traffic levels.

2. **CampaignNotFoundError sentinel UUID**: The zero-UUID sentinel in `get_campaign_public_info` is a code smell. Consider adding a `slug: str | None` field to `CampaignNotFoundError` or a separate `CampaignSlugNotFoundError`.

3. **ZITADEL reconciliation**: Failed ZITADEL role assignments are only logged. A Celery/ARQ background task to reconcile ZITADEL roles with `campaign_members` would close this gap.

4. **Slug update on campaign rename**: `update_campaign()` does not update the slug. If campaign names can be changed (they can via `PATCH /campaigns/{id}`), the slug should also be updated atomically. This requires the migration to ensure no `NOT NULL` constraint and careful handling of external links that embed the old slug.
