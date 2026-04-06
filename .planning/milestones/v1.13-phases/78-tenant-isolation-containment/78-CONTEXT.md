# Phase 78: Tenant Isolation Containment - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the six confirmed cross-tenant read/write paths from the 2026-04-05 production shakedown and close the same ownership-check gap class in the directly adjacent service helpers that still resolve tenant-scoped UUIDs without a campaign predicate.

</domain>

<decisions>
## Implementation Decisions

### Ownership enforcement
- **D-01:** Service-layer ownership checks are the primary fix. Every tenant-scoped UUID lookup touched in this phase must either include `campaign_id` in the SQL predicate or verify the resolved row belongs to the path campaign before mutating/returning it.
- **D-02:** Enumeration-safe misses stay fail-closed. Cross-tenant list members, voter interactions, volunteer subresources, turf lookups, and `/field/me` should return `403` or `404`, not partial data.
- **D-03:** Request-body foreign keys are treated as untrusted input. `voter_ids`, `voter_list_id`, and similar references must be validated against the path campaign before insert/update work begins.

### Phase-78 scope anchors
- **D-04:** The six production P0s are the must-close set: list-member body injection, call-list body injection, voter-interaction body injection, turf voter leak, volunteer detail/status/hours/availability leaks, and missing `/field/me` membership gating.
- **D-05:** The ownership-audit pass should cover the same bug class in the volunteer/shift helper paths touched by these endpoints, not just the exact shakedown repro routes.

### Verification posture
- **D-06:** Unit regressions are acceptable as an intermediate verification layer, but the phase is not complete until DB-backed API/integration checks can run.
- **D-07:** Do not mark ROADMAP/STATE phase completion while the local PostgreSQL test database is unavailable.

### the agent's Discretion
Implementation details inside the service/query layer are flexible as long as they preserve existing response contracts outside the containment fixes.

</decisions>

<specifics>
## Specific Ideas

- Reuse the Phase 71 containment pattern: composite `WHERE id = :id AND campaign_id = :campaign_id` whenever possible.
- Keep `/field/me` on route-level membership enforcement via `require_role("volunteer")` instead of bespoke inline checks.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Shakedown evidence
- `docs/production-shakedown/results/SUMMARY.md` — authoritative list of the six P0 tenant-isolation breaches and the recommended audit direction.
- `docs/production-shakedown/results/evidence/phase-03/P0-findings.md` — repro details for list-members, call-lists, and voter-interactions body injection.
- `docs/production-shakedown/results/evidence/phase-06/CANV-TURF-07-P0-writeup.txt` — turf voter leak reproduction and impact.
- `docs/production-shakedown/results/phase-09-results.md` — volunteer detail/status/hours/availability cross-tenant leak evidence.
- `docs/production-shakedown/results/phase-10-results.md` — `/field/me` foreign-campaign membership leak evidence.

### Roadmap and requirements
- `.planning/ROADMAP.md` — Phase 78 goal, success criteria, and three planned workstreams.
- `.planning/REQUIREMENTS.md` — `ISO-01` through `ISO-05` requirements for this phase.

### Prior containment pattern
- `.planning/milestones/v1.12-phases/71-tenant-isolation-service-route-scoping/71-RESEARCH.md` — established scoping pattern for campaign-bound service lookups.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/core/security.py::require_role` — already resolves per-campaign membership and is the right guard for `/field/me`.
- `app/core/errors.py` — existing `VoterNotFoundError`/`VoterListNotFoundError` handlers support enumeration-safe failures.

### Established Patterns
- Phase 71 already standardized service scoping with composite `WHERE` clauses on tenant-bound resources.
- Volunteer and shift services centralize most volunteer UUID lookups, so fixing helper methods closes multiple endpoints at once.

### Integration Points
- `app/services/voter_list.py`
- `app/services/call_list.py`
- `app/services/voter_interaction.py`
- `app/services/turf.py`
- `app/services/volunteer.py`
- `app/services/shift.py`
- `app/api/v1/field.py`
- `app/api/v1/turfs.py`
- `app/api/v1/volunteers.py`

</code_context>

<deferred>
## Deferred Ideas

None. The phase is strictly remediation-focused.

</deferred>

---

*Phase: 78-tenant-isolation-containment*
*Context gathered: 2026-04-05*
