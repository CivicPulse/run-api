# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CivicPulse Run API MVP

**Shipped:** 2026-03-10
**Phases:** 7 | **Plans:** 20

### What Was Built
- Full campaign management API with ZITADEL OIDC auth, RLS multi-tenancy, and role-based access control
- Voter CRM with CSV import pipeline (RapidFuzz field mapping), composable search/filter, tags, lists, and interaction history
- PostGIS canvassing operations: turf cutting, household-clustered walk lists, door-knock tracking, reusable survey engine
- Phone banking: call lists with DNC filtering, claim-on-fetch, call recording with survey reuse, auto-DNC
- Volunteer management: shift scheduling, waitlists, cross-domain check-in, hours tracking
- Operational dashboards with aggregation endpoints and cursor-paginated drilldowns
- Integration wiring fixes: ZitadelService lifespan init, Alembic model discovery

### What Worked
- Phase-by-phase execution with verifier agents kept quality high — all 7 phases passed verification
- Reusable survey engine pattern (Phase 3 → Phase 4) avoided code duplication
- Composition pattern for services (VoterInteractionService, SurveyService, DNCService) kept coupling clean
- native_enum=False convention avoided future migration pain
- Wave 0 test stubs (Phase 3) established test-first scaffolding pattern
- Milestone audit caught two real integration gaps (INT-01, INT-02) that Phase 7 fixed before shipping

### What Was Inefficient
- ROADMAP.md plan checkboxes not updated during execution (Phases 1-2 show `[ ]` despite being complete)
- Integration tests written but never executed against live infrastructure — 18 tech debt items accumulated
- Phase 2 progress table showed "3/4 In Progress" despite being complete
- Nyquist validation enabled but never run for any phase (all 7 in draft status)

### Patterns Established
- Services compose other services via constructor injection (no inheritance)
- RLS subquery pattern for child tables without direct campaign_id FK
- Late imports at call site for cross-phase model references
- StrEnum columns with native_enum=False for extensibility
- Cursor pagination via UUID comparison (not offset-based)
- Interaction events as shared data backbone across domains

### Key Lessons
1. Run milestone audit before declaring done — it caught real runtime wiring gaps
2. Integration tests need to run against live infrastructure at some point; deferring all of them accumulates significant tech debt
3. The survey engine reuse pattern proved the value of designing Phase 3 models without canvassing-specific FKs

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: 2 days from initial commit to milestone completion
- Notable: 56K LOC across 20 plans with high consistency in patterns

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 20 | Established GSD workflow with phase verification and milestone audit |

### Cumulative Quality

| Milestone | Unit Tests | Integration Tests | LOC |
|-----------|------------|-------------------|-----|
| v1.0 | 236+ passing | 24+ written (not executed) | 56,653 |

### Top Lessons (Verified Across Milestones)

1. Design models for cross-phase reuse from the start (survey engine, interaction events)
2. Run integration tests against live infrastructure — deferred testing is deferred risk
