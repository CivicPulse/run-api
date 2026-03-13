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

## Milestone: v1.1 — Local Dev & Deployment Readiness

**Shipped:** 2026-03-10
**Phases:** 4 | **Plans:** 7

### What Was Built
- Three-stage Docker build (node/uv/python-slim) producing 485MB production image with health probes
- Docker Compose full-stack dev environment with auto-migrations, MinIO bootstrap, Vite hot-reload proxy
- Idempotent seed data script with Macon-Bibb County demo data (50 voters, campaigns, turfs, interactions)
- GitHub Actions CI/CD: PR validation gates + GHCR publish with SHA/latest tags and K8s manifest auto-update
- Kubernetes manifests: Deployment with init container migrations, ClusterIP Service, ConfigMap, Secret template
- Traefik IngressRoute and ArgoCD Application for zero-touch GitOps deployment

### What Worked
- Milestone audit caught zero gaps — clean pass on all 15 requirements, 12 integration points, 3 E2E flows
- Cross-phase consistency: same Alembic pattern used in dev-entrypoint (P9) and K8s init container (P11)
- CI infinite-loop prevention designed correctly on first attempt (GITHUB_TOKEN commits don't re-trigger)
- Phase dependencies cleanly layered: P8 → P9 (compose), P8 → P10 (CI), P10 → P11 (K8s)

### What Was Inefficient
- ROADMAP.md Phase 11 plan checkboxes not updated (show `[ ]` despite being complete)
- ROADMAP.md Phase 11 progress table row had malformed columns
- Nyquist validation still not run — phases 9, 10 missing VALIDATION.md entirely
- Summary files lack `one_liner` field, requiring manual extraction during milestone completion

### Patterns Established
- Three-stage Docker build pattern: node frontend → uv Python deps → python-slim runtime
- Dev entrypoint pattern: wait-for-it + alembic upgrade + boto3 bucket init
- CI separation: PR workflow for quality gates, publish workflow for image delivery
- K8s manifest pattern: init container for migrations, envFrom for config/secrets, .yaml.example for templates

### Key Lessons
1. Summary files should include a `one_liner` field for automated extraction during milestone completion
2. ROADMAP.md checkbox and progress table updates should be part of plan completion workflow
3. Infrastructure-as-code phases execute cleanly because they have minimal runtime dependencies to test

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: Same day as v1.0 completion — fast iteration on infra phases
- Notable: 1,512 lines of Docker/CI/K8s config across 7 plans with zero test failures

---

## Milestone: v1.2 — Full UI

**Shipped:** 2026-03-13
**Phases:** 11 | **Plans:** 43

### What Was Built
- Shared UI infrastructure: RequireRole permission gating, useFormGuard navigation protection, reusable DataTable with server-side operations
- Complete voter CRM UI: contacts (phone/email/address), tags, static/dynamic lists, 19-dimension advanced search, interaction notes
- Multi-step CSV import wizard with auto-detected column mapping, preview, progress tracking, and import history
- Campaign settings (edit, delete, ownership transfer) and member management (invite, role change, remove)
- Full phone banking workflow: session management, member picker for caller assignment, active calling screen with claim/record/skip, progress dashboards
- Call list & DNC management: CRUD with DNC filtering, entry status tracking, bulk DNC import with reason column
- Volunteer management: filterable roster, dual-mode self-registration, availability slots, campaign tags, hours tracking
- Shift management: scheduling with date-grouped cards, volunteer signup/assignment, check-in/out, roster view, hours adjustment
- Integration polish: member name resolution across all views, RequireRole gates on all mutation paths

### What Worked
- Shared infrastructure (Phase 12) paid off enormously — RequireRole, DataTable, and useFormGuard used in every subsequent phase
- Milestone audit process caught real integration gaps: INT-01 (claimed_by UUID display), INT-02 (DNC RequireRole gates), PHON-03 (raw UUID in caller picker) — all fixed before shipping
- Nyquist validation enforced from the start — all 11 phases compliant with wave_0_complete
- Pattern consistency: every phase followed the same structure (types → hooks → pages → tests → verification)
- SUMMARY.md files with frontmatter enabled automated milestone completion tooling
- Gap closure phases (19-22) ensured 66/66 requirements verified with 3-source cross-reference

### What Was Inefficient
- Some ROADMAP.md progress table rows had malformed columns (Phase 17, 19, 21, 22)
- 7 SUMMARY frontmatter files missing requirements_completed entries (CAMP-03..07, PHON-09, PHON-10) — documentation completeness gaps
- REQUIREMENTS.md "60 total" label incorrect (should be 66) — off-by-6 from audit-inserted phases
- Orphaned top-level components (ConfirmDialog.tsx, EmptyState.tsx) not cleaned up after shared/ versions created
- Phase 16 inline useQuery for survey script not extracted to dedicated hook — accumulated as tech debt

### Patterns Established
- Popover+Command combobox pattern for searchable pickers (member picker, volunteer assignment)
- it.todo wave 0 test stubs: keep suite green while scaffolding, implement later
- XHR for presigned URL uploads (ky interceptors break MinIO auth)
- Sheet-based dialogs for long forms (VolunteerEditSheet, ShiftDialog) vs Dialog for short ones
- Client-side search with digit stripping for small datasets (DNC phone numbers)
- Backend enrichment pattern: add computed fields (caller_count, call_list_name, claimed_by name) at endpoint layer, not service layer
- VERIFICATION.md as formal evidence document with 3-source cross-reference (code, tests, REQUIREMENTS.md)

### Key Lessons
1. Build shared infrastructure first — the 3-plan Phase 12 investment saved hundreds of lines of duplication across 10 subsequent phases
2. Milestone audit is essential — even after 43 plans, the audit found real integration gaps that needed dedicated fix phases
3. Nyquist wave 0 compliance is worth enforcing — it ensures every requirement has at least one test, catching gaps early
4. Gap closure phases (19-22) are normal and expected — they're a sign of honest verification, not planning failure
5. Backend enrichment at endpoint layer (not service layer) keeps services returning clean models while views get display-ready data

### Cost Observations
- Model mix: Opus for planning/auditing/milestone, sonnet for execution
- Timeline: 4 days from Phase 12 start to milestone completion
- Notable: 61K lines of frontend code across 43 plans; 252 tests passing with zero TypeScript errors

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 20 | Established GSD workflow with phase verification and milestone audit |
| v1.1 | 4 | 7 | Infrastructure-as-code phases; clean milestone audit (zero gaps) |
| v1.2 | 11 | 43 | Full Nyquist compliance, 3-source verification, gap closure phases as standard practice |

### Cumulative Quality

| Milestone | Unit Tests | Integration Tests | LOC | Frontend LOC |
|-----------|------------|-------------------|-----|-------------|
| v1.0 | 236+ passing | 24+ written (not executed) | 56,653 | — |
| v1.1 | 268 passing | — | +1,512 (infra) | — |
| v1.2 | 252 passing (frontend) | 284 passing (backend) | — | 30,691 TypeScript |

### Top Lessons (Verified Across Milestones)

1. Design models and components for cross-phase reuse from the start (survey engine → phone banking; RequireRole/DataTable → all UI phases)
2. Run integration tests against live infrastructure — deferred testing is deferred risk
3. Run milestone audit before declaring done — catches real gaps in every milestone (v1.0: 2 gaps, v1.2: 4 gaps)
4. Keep ROADMAP.md checkboxes and progress table updated during execution — manual fixups during archival are wasteful
5. Build shared infrastructure early — Phase 12's 3-plan investment in RequireRole, DataTable, useFormGuard saved massive duplication across 10 subsequent phases
6. Gap closure phases are healthy — they mean the audit process works, not that planning failed
