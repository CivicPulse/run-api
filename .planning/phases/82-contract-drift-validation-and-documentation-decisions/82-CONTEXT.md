# Phase 82 Context

## Goal

Resolve the remaining P2/P3 findings by either fixing behavior or recording explicit supported behavior.

## Why This Phase Exists

Phases 78 through 81 addressed the launch-blocking P0/P1 findings, but the production shakedown still recorded medium- and low-severity drift across validation, lifecycle semantics, denormalized field data, and production-surface documentation decisions. Those need to be closed before Phase 83 can do a clean reverification pass.

## Inputs

- `.planning/ROADMAP.md` v1.13 Phase 82 requirements and success criteria
- `.planning/REQUIREMENTS.md` `VAL-01` through `VAL-04`
- `docs/production-shakedown/results/SUMMARY.md`
- `docs/production-shakedown/results/phase-06-results.md`
- `docs/production-shakedown/results/phase-07-results.md`
- `docs/production-shakedown/results/phase-10-results.md`
- `docs/production-shakedown/results/phase-12-results.md`
- `docs/production-shakedown/results/phase-14-results.md`
- `docs/production-shakedown/results/phase-15-results.md`

## Remaining Finding Buckets

- Validation hardening:
  - malformed pagination cursor handling
  - `page_size` contract drift and bounds validation
  - null-byte payload rejection
  - future birth date handling
  - oversized voter string fields
  - out-of-range WGS84 GeoJSON coordinates
- Lifecycle and contract drift:
  - deleted campaign `200 deleted` vs `404`
  - one-way lifecycle semantics such as `completed -> active`
  - phone call negative duration acceptance
  - DNC handling ambiguity
  - stale `field/me` totals
- Documentation and disposition:
  - Swagger/OpenAPI exposure in prod
  - debug/catch-all scanner behavior
  - home/nav landmark semantics
  - explicit table-header semantics
  - desktop-first mobile expectations
  - rate-limit posture
  - `pg_stat_statements` follow-up

## Constraints

- Do not regress the hardened API error contract from Phase 79.
- Prefer validation fixes at the schema/service layer over ad hoc endpoint checks.
- When behavior is intentionally kept, record it explicitly as the supported contract rather than leaving test-plan drift unresolved.
- Keep Phase 83 reverification in mind: every accepted behavior should be easy to point to in code or docs.

## Current 82-01 Status

Initial `82-01` fixes are already landed locally:

- null bytes rejected centrally in `BaseSchema`
- voter create/update now reject future `birth_date`/`date_of_birth`, oversized string fields, and out-of-range latitude/longitude
- voter list accepts validated `page_size` as a compatibility alias for `limit`
- phone-bank call records reject negative durations
- turf polygon validation now rejects out-of-range WGS84 coordinates before PostGIS storage

Focused validation for that initial slice passed:

- `uv run pytest tests/unit/test_api_voters.py tests/unit/test_turfs.py tests/unit/test_phone_bank.py -q`
