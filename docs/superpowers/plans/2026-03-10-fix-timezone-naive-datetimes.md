# Fix Timezone-Naive Datetime Mismatch — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all `datetime.now(UTC)` calls that produce timezone-aware datetimes incompatible with the database's `TIMESTAMP WITHOUT TIME ZONE` columns, by introducing a central `utcnow()` helper and replacing all call sites.

**Architecture:** Create a single `utcnow()` function in `app/core/time.py` that returns `datetime.now(UTC).replace(tzinfo=None)`. Replace every `datetime.now(UTC)` call in `app/` and `tests/` with this helper. This is a mechanical, low-risk refactor — no behavior changes, just consistent naive-UTC datetimes everywhere.

**Tech Stack:** Python 3.13, SQLAlchemy (asyncpg), PostgreSQL `TIMESTAMP WITHOUT TIME ZONE`

---

## Why a helper instead of find-and-replace `.replace(tzinfo=None)`?

1. **DRY** — one place to change if the DB schema ever moves to `TIMESTAMP WITH TIME ZONE`
2. **Readable** — `utcnow()` is clearer than `datetime.now(UTC).replace(tzinfo=None)`
3. **Lintable** — a ruff rule can ban direct `datetime.now(UTC)` calls in the future

---

## Chunk 1: Core helper + service layer

### Task 1: Create `app/core/time.py` helper

**Files:**
- Create: `app/core/time.py`
- Create: `tests/unit/test_core_time.py`

- [ ] **Step 1: Write the test**

```python
# tests/unit/test_core_time.py
"""Tests for app.core.time helpers."""

from datetime import datetime

from app.core.time import utcnow


class TestUtcnow:
    def test_returns_naive_datetime(self):
        result = utcnow()
        assert isinstance(result, datetime)
        assert result.tzinfo is None

    def test_returns_approximate_current_time(self):
        before = datetime.utcnow()  # noqa: DTZ003
        result = utcnow()
        after = datetime.utcnow()  # noqa: DTZ003
        assert before <= result <= after
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/unit/test_core_time.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.time'`

- [ ] **Step 3: Write implementation**

```python
# app/core/time.py
"""Timezone-naive UTC datetime helper.

The database uses TIMESTAMP WITHOUT TIME ZONE columns, so all Python
datetimes must be naive (no tzinfo).  This module provides a single
``utcnow()`` function that returns the current UTC time as a naive
datetime — avoiding the deprecated ``datetime.utcnow()`` while staying
compatible with the DB schema.
"""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-naive datetime."""
    return datetime.now(UTC).replace(tzinfo=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/unit/test_core_time.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint**

Run: `uv run ruff check app/core/time.py tests/unit/test_core_time.py`
Expected: All checks passed

- [ ] **Step 6: Commit**

```bash
git add app/core/time.py tests/unit/test_core_time.py
git commit -m "feat: add utcnow() helper for naive UTC datetimes"
```

---

### Task 2: Replace `datetime.now(UTC)` in service files (batch 1 — 7 files)

These files each have 1-3 occurrences and are straightforward replacements.

**Files to modify:**
- `app/services/campaign.py` (2 occurrences: lines 250, 290)
- `app/services/voter.py` (1 occurrence: line 261)
- `app/services/voter_list.py` (1 occurrence: line 103)
- `app/services/voter_interaction.py` (1 occurrence: line 63)
- `app/services/dnc.py` (2 occurrences: lines 67, 125)
- `app/services/turf.py` (2 occurrences: lines 130, 262)
- `app/services/survey.py` (3 occurrences: lines 71, 207, 459)

**For each file, the change is mechanical:**

1. Replace `from datetime import UTC, datetime` with `from datetime import datetime` (keep `datetime` if used elsewhere, drop `UTC` if no longer needed)
2. Add `from app.core.time import utcnow`
3. Replace every `datetime.now(UTC)` with `utcnow()`

- [ ] **Step 1: Apply replacements to all 7 files**

In each file:
- Change import: add `from app.core.time import utcnow`
- Remove `UTC` from datetime import if no longer used
- Replace all `datetime.now(UTC)` → `utcnow()`

- [ ] **Step 2: Lint all modified files**

Run: `uv run ruff check app/services/campaign.py app/services/voter.py app/services/voter_list.py app/services/voter_interaction.py app/services/dnc.py app/services/turf.py app/services/survey.py`
Expected: All checks passed

- [ ] **Step 3: Run existing unit tests for these services**

Run: `uv run pytest tests/unit/test_campaign_service.py tests/unit/test_voter_interactions.py tests/unit/test_voter_lists.py tests/unit/test_dnc.py tests/unit/test_surveys.py -v`
Expected: All tests pass (unit tests use mocks so timezone doesn't matter there)

- [ ] **Step 4: Commit**

```bash
git add app/services/campaign.py app/services/voter.py app/services/voter_list.py app/services/voter_interaction.py app/services/dnc.py app/services/turf.py app/services/survey.py
git commit -m "fix: use utcnow() helper in service batch 1 (7 files)"
```

---

### Task 3: Replace `datetime.now(UTC)` in service files (batch 2 — 7 files)

These files have more occurrences or more complex usage patterns.

**Files to modify:**
- `app/services/invite.py` (6 occurrences: lines 80, 89, 131, 192, 228, 253)
- `app/services/shift.py` (12 occurrences: lines 70, 182, 215, 371, 437, 497, 568, 613, 614, 645, 704)
- `app/services/call_list.py` (5 occurrences: lines 165, 166, 242, 277, 330)
- `app/services/volunteer.py` (4 occurrences: lines 66, 222, 258, 355)
- `app/services/voter_contact.py` (7 occurrences: lines 62, 121, 202, 261, 350, 413, 542)
- `app/services/phone_bank.py` (8 occurrences: lines 91, 194, 229, 284, 304, 396, 614)
- `app/services/walk_list.py` (2 occurrences: lines 88, 301)

Same mechanical change as Task 2.

- [ ] **Step 1: Apply replacements to all 7 files**

Same pattern: update imports, replace `datetime.now(UTC)` → `utcnow()`.

- [ ] **Step 2: Lint all modified files**

Run: `uv run ruff check app/services/invite.py app/services/shift.py app/services/call_list.py app/services/volunteer.py app/services/voter_contact.py app/services/phone_bank.py app/services/walk_list.py`
Expected: All checks passed

- [ ] **Step 3: Run existing unit tests for these services**

Run: `uv run pytest tests/unit/test_invite_service.py tests/unit/test_shifts.py tests/unit/test_call_lists.py tests/unit/test_volunteers.py tests/unit/test_voter_contacts.py tests/unit/test_phone_bank.py tests/unit/test_canvassing.py -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add app/services/invite.py app/services/shift.py app/services/call_list.py app/services/volunteer.py app/services/voter_contact.py app/services/phone_bank.py app/services/walk_list.py
git commit -m "fix: use utcnow() helper in service batch 2 (7 files)"
```

---

### Task 4: Update `app/api/deps.py` to use the helper

**Files:**
- Modify: `app/api/deps.py` (line 56 — already has `.replace(tzinfo=None)` inline)

- [ ] **Step 1: Replace inline fix with helper**

Change:
```python
from datetime import UTC, datetime
...
now = datetime.now(UTC).replace(tzinfo=None)
```
To:
```python
from datetime import datetime
from app.core.time import utcnow
...
now = utcnow()
```

- [ ] **Step 2: Lint**

Run: `uv run ruff check app/api/deps.py`
Expected: All checks passed

- [ ] **Step 3: Commit**

```bash
git add app/api/deps.py
git commit -m "refactor: use utcnow() helper in deps.py"
```

---

### Task 5: Update `scripts/seed.py` to use the helper

**Files:**
- Modify: `scripts/seed.py` (line 42 — already has `.replace(tzinfo=None)` inline)

- [ ] **Step 1: Replace inline fix with helper**

Change:
```python
from datetime import UTC, datetime, timedelta
...
NOW = datetime.now(UTC).replace(tzinfo=None)
```
To:
```python
from datetime import datetime, timedelta
from app.core.time import utcnow
...
NOW = utcnow()
```

- [ ] **Step 2: Lint**

Run: `uv run ruff check scripts/seed.py`
Expected: Pass (pre-existing lint issues are fine, no new ones)

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.py
git commit -m "refactor: use utcnow() helper in seed script"
```

---

## Chunk 2: Test files

### Task 6: Update test files (batch 1 — unit tests, 11 files)

**Files to modify:**
- `tests/unit/test_api_campaigns.py` (4 occurrences)
- `tests/unit/test_api_invites.py` (2 occurrences)
- `tests/unit/test_api_members.py` (4 occurrences)
- `tests/unit/test_call_lists.py` (3 occurrences)
- `tests/unit/test_campaign_service.py` (4 occurrences)
- `tests/unit/test_canvassing.py` (3 occurrences)
- `tests/unit/test_dnc.py` (1 occurrence)
- `tests/unit/test_invite_service.py` (5 occurrences)
- `tests/unit/test_lifespan.py` (4 occurrences)
- `tests/unit/test_surveys.py` (2 occurrences)
- `tests/unit/test_voter_lists.py` (4 occurrences)

Same mechanical change: update imports, replace `datetime.now(UTC)` → `utcnow()`.

- [ ] **Step 1: Apply replacements to all 11 files**

- [ ] **Step 2: Lint all modified files**

Run: `uv run ruff check tests/unit/test_api_campaigns.py tests/unit/test_api_invites.py tests/unit/test_api_members.py tests/unit/test_call_lists.py tests/unit/test_campaign_service.py tests/unit/test_canvassing.py tests/unit/test_dnc.py tests/unit/test_invite_service.py tests/unit/test_lifespan.py tests/unit/test_surveys.py tests/unit/test_voter_lists.py`
Expected: All checks passed

- [ ] **Step 3: Run all modified tests**

Run: `uv run pytest tests/unit/test_api_campaigns.py tests/unit/test_api_invites.py tests/unit/test_api_members.py tests/unit/test_call_lists.py tests/unit/test_campaign_service.py tests/unit/test_canvassing.py tests/unit/test_dnc.py tests/unit/test_invite_service.py tests/unit/test_lifespan.py tests/unit/test_surveys.py tests/unit/test_voter_lists.py -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_api_campaigns.py tests/unit/test_api_invites.py tests/unit/test_api_members.py tests/unit/test_call_lists.py tests/unit/test_campaign_service.py tests/unit/test_canvassing.py tests/unit/test_dnc.py tests/unit/test_invite_service.py tests/unit/test_lifespan.py tests/unit/test_surveys.py tests/unit/test_voter_lists.py
git commit -m "fix: use utcnow() in unit test batch 1 (11 files)"
```

---

### Task 7: Update test files (batch 2 — remaining unit + integration tests, 11 files)

**Files to modify:**
- `tests/unit/test_phone_bank.py` (26 occurrences — heaviest file)
- `tests/unit/test_shifts.py` (16 occurrences)
- `tests/unit/test_volunteers.py` (6 occurrences)
- `tests/unit/test_voter_contacts.py` (12 occurrences)
- `tests/unit/test_voter_interactions.py` (2 occurrences)
- `tests/integration/conftest.py` (10 occurrences)
- `tests/integration/test_canvassing_rls.py` (1 occurrence)
- `tests/integration/test_phone_banking_rls.py` (1 occurrence)
- `tests/integration/test_spatial.py` (1 occurrence)
- `tests/integration/test_volunteer_rls.py` (1 occurrence)
- `tests/integration/test_voter_rls.py` (1 occurrence)

- [ ] **Step 1: Apply replacements to all 11 files**

- [ ] **Step 2: Lint all modified files**

Run: `uv run ruff check tests/unit/test_phone_bank.py tests/unit/test_shifts.py tests/unit/test_volunteers.py tests/unit/test_voter_contacts.py tests/unit/test_voter_interactions.py tests/integration/conftest.py tests/integration/test_canvassing_rls.py tests/integration/test_phone_banking_rls.py tests/integration/test_spatial.py tests/integration/test_volunteer_rls.py tests/integration/test_voter_rls.py`
Expected: All checks passed

- [ ] **Step 3: Run all modified tests**

Run: `uv run pytest tests/unit/test_phone_bank.py tests/unit/test_shifts.py tests/unit/test_volunteers.py tests/unit/test_voter_contacts.py tests/unit/test_voter_interactions.py -v`
Expected: All unit tests pass

(Integration tests require a running DB and are not run here — they'll work because the helper produces the same values.)

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_phone_bank.py tests/unit/test_shifts.py tests/unit/test_volunteers.py tests/unit/test_voter_contacts.py tests/unit/test_voter_interactions.py tests/integration/conftest.py tests/integration/test_canvassing_rls.py tests/integration/test_phone_banking_rls.py tests/integration/test_spatial.py tests/integration/test_volunteer_rls.py tests/integration/test_voter_rls.py
git commit -m "fix: use utcnow() in test batch 2 (11 files)"
```

---

## Chunk 3: Verification

### Task 8: Full verification sweep

- [ ] **Step 1: Verify zero remaining raw `datetime.now(UTC)` calls**

Run: `grep -rn 'datetime\.now(UTC)' --include='*.py' app/ scripts/ tests/`
Expected: Zero matches (or only the `app/core/time.py` implementation itself)

- [ ] **Step 2: Run full unit test suite**

Run: `uv run pytest tests/unit/ -v`
Expected: All tests pass

- [ ] **Step 3: Lint entire codebase**

Run: `uv run ruff check app/ scripts/ tests/`
Expected: No new errors (pre-existing issues in seed.py are acceptable)

- [ ] **Step 4: Rebuild container and run seed**

```bash
cd web && npm run build && cd ..
docker compose up -d --build api
sleep 5
docker compose exec api python -m scripts.seed
```

Expected: Seed runs successfully (or says "Seed data already exists, skipping.")

- [ ] **Step 5: Verify in browser**

Navigate to `http://localhost:8000`, log in, confirm campaigns page loads with no 500 errors.

---

## Summary

| Item | Count |
|------|-------|
| New files | 2 (`app/core/time.py`, `tests/unit/test_core_time.py`) |
| Modified service files | 14 + `app/api/deps.py` + `scripts/seed.py` |
| Modified test files | 22 |
| Total `datetime.now(UTC)` replacements | ~173 |
| Tasks | 8 |
| Estimated commits | 8 |
