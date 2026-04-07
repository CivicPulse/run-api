# Phase 85 Context

## Goal

Build a campaign-scoped search surface that stays fresh after voter/contact edits and imports
 without introducing external search infrastructure.

## Inputs

- `.planning/ROADMAP.md` Phase 85 requirements and success criteria
- `.planning/REQUIREMENTS.md` `SRCH-02`, `SRCH-04`, `TRST-01`
- Approved freshness boundary:
  - direct voter/contact edits refresh immediately
  - import-driven updates refresh within 5 minutes after import completion
- `app/services/voter.py`
- `app/services/voter_contact.py`
- `app/services/import_service.py`

## Decisions

- Use a PostgreSQL-native denormalized search table keyed by `voter_id`.
- Keep the table campaign-scoped and refresh it from voter, contact, and import write paths.
- Make import refresh eager during batch/secondary work so the implementation beats the SLA rather than only meeting it at the edge.
