---
phase: 74
slug: data-integrity-concurrency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 74 — Validation Strategy

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (asyncio_mode=auto), alembic |
| **Quick run** | `uv run pytest tests/integration/test_data_integrity.py -x` |
| **Migration check** | `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` |
| **Full suite** | `uv run pytest tests/` |
| **Runtime** | ~45s quick, ~3min full |

## Per-Task Verification Map

| Task ID | Requirement | Test |
|---------|-------------|------|
| 74-NN-01 | DATA-01 (C9 shift race) | test_concurrent_shift_signup_capacity |
| 74-NN-02 | DATA-02 (C10 DNC race) | test_concurrent_dnc_import |
| 74-NN-03 | DATA-03 (C11 accept_invite) | test_accept_invite_compensates_zitadel_on_db_fail |
| 74-NN-04 | DATA-03 (C11 transfer_ownership) | test_transfer_ownership_compensates |
| 74-NN-05 | DATA-04/05 (C12 indexes + re-invite) | migration + EXPLAIN queries |
| 74-NN-06 | DATA-06 (VoterEmail unique) | test_voter_email_unique_violation |
| 74-NN-07 | DATA-07 (VolunteerTag unique) | test_volunteer_tag_unique_violation |
| 74-NN-08 | DATA-08 (migration) | alembic round-trip |

## Wave 0 Requirements

- [ ] `tests/integration/test_data_integrity.py` — new test file
- [ ] alembic/versions/027_data_integrity.py — new migration
- [ ] Verify DoNotCallEntry has unique constraint on (campaign_id, phone_number)
- [ ] Backfill check: detect duplicate rows before constraint migration
