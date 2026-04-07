---
phase: 85-campaign-scoped-search-data-freshness
verified: 2026-04-07T02:47:54Z
status: passed
score: 3/3 must-haves verified
re_verification: true
---

# Phase 85 Verification

## Verified

1. Search data is denormalized into a campaign-scoped PostgreSQL surface. ✅
2. Direct voter/contact edits and import writes refresh the surface inside the app write paths. ✅
3. A DB-backed production-scale lookup benchmark returned the intended result in about 116 ms on a 10k-row campaign dataset. ✅

## Commands Run

- `uv run pytest tests/unit/test_voter_search.py tests/unit/test_voter_contacts.py tests/unit/test_import_service.py -q`
- `uv run python -m compileall app alembic/versions/028_voter_search_surface.py`
- `DATABASE_URL_SYNC=postgresql+psycopg2://postgres:postgres@localhost:49374/run_api uv run alembic upgrade head`
- `TEST_DB_PORT=49374 uv run python - <<'PY' ...` (DB-backed 10k-row lookup benchmark via the ASGI app; `Morgan Anderson` returned in ~115.54 ms)
