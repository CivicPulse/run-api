# Phase 47: Integration Consistency & Documentation Cleanup - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Close two audit integration gaps (INT-01, INT-02) from the v1.5 milestone audit and verify REQUIREMENTS.md traceability completeness. Specifically: centralize RLS dependency in 2 turf endpoints, apply rate limiting to all API endpoints, and confirm traceability table accuracy.

</domain>

<decisions>
## Implementation Decisions

### Rate Limiting Strategy
- **D-01:** Tiered rate limits by operation type: reads (GET) ~60/min, writes (POST/PUT/DELETE) ~30/min, auth-sensitive (join/invite) 5-20/min
- **D-02:** Bulk/import endpoints (CSV voter import, bulk DNC) get stricter limits (~5-10/min) since they're expensive operations
- **D-03:** Use both IP-based and per-user (JWT sub) rate limiting for authenticated endpoints. The existing `get_user_or_ip_key` function should be wired up to fulfill OBS-04
- **D-04:** IP-only rate limiting for unauthenticated endpoints (join, health)

### RLS Centralization
- **D-05:** Mechanical swap of `Depends(get_db)` + inline `set_campaign_context` to `Depends(get_campaign_db)` in `get_turf_overlaps` (line 117) and `get_turf_voters` (line 166) in `app/api/v1/turfs.py`
- **D-06:** Add targeted unit test confirming `get_campaign_db` is used in both endpoints (not just relying on existing E2E coverage)

### Traceability Verification
- **D-07:** Programmatic verification pass confirming all 48 REQUIREMENTS.md rows have plan references and "Satisfied" status, and all checkboxes are checked. Document the verification — no code changes expected since table already appears correct.

### Claude's Discretion
- Specific rate limit numbers within the tiers (e.g., exact 60 vs 50 for reads)
- Rate limit decorator placement pattern (per-endpoint vs shared decorator helper)
- Unit test structure for RLS verification

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Audit
- `.planning/v1.5-MILESTONE-AUDIT.md` — Defines INT-01 (turf RLS bypass) and INT-02 (rate limiting gaps) that this phase closes

### Rate Limiting Infrastructure
- `app/api/v1/join.py` — Only file with existing `@limiter.limit` decorators (reference pattern)
- `app/core/rate_limit.py` or equivalent — Where `limiter` and `get_user_or_ip_key` are defined

### RLS Centralization
- `app/api/deps.py` — Contains `get_campaign_db` dependency (the centralized pattern)
- `app/api/v1/turfs.py` lines 112-176 — The two endpoints that need fixing
- `app/db/rls.py` — Contains `set_campaign_context` (the inline pattern being replaced)

### Requirements
- `.planning/REQUIREMENTS.md` — Traceability table to verify (48 requirements)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `get_campaign_db` dependency in `app/api/deps.py`: Centralized RLS context setter — already used by 5 other turf endpoints in same file
- `limiter` instance: SlowAPI rate limiter, already initialized and mounted as middleware
- `get_user_or_ip_key`: Key function for per-user rate limiting — exists and is tested but not wired to any endpoint

### Established Patterns
- `@limiter.limit("20/minute")` decorator pattern on route functions (see `join.py`)
- `Depends(get_campaign_db)` for campaign-scoped database sessions with automatic RLS context

### Integration Points
- 24 route files in `app/api/v1/` with ~171 total endpoints need rate limit decorators
- `app/api/v1/turfs.py`: 2 endpoints need `get_db` → `get_campaign_db` swap, `ensure_user_synced` and `set_campaign_context` calls can be removed from those endpoints

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 47-integration-consistency-documentation-cleanup*
*Context gathered: 2026-03-25*
