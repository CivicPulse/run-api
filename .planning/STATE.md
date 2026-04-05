---
gsd_state_version: 1.0
milestone: v1.12
milestone_name: Hardening & Remediation
status: executing
stopped_at: Completed 74-03-PLAN.md
last_updated: "2026-04-05T00:53:09.687Z"
last_activity: 2026-04-05
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 16
  completed_plans: 15
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** Phase 74 — Data Integrity & Concurrency

## Current Position

Phase: 74 (Data Integrity & Concurrency) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-04-05

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- Security requirements execute first: Phase 71 (service scoping) → Phase 72 (RLS) → Phase 73 (frontend guards)
- Split Security category into 3 phases along its natural cleavage: backend service/route scoping, database RLS, frontend guards/OIDC
- Split Reliability category into frontend state (75) and backend infra (76) phases because they touch entirely different codebases
- Data Integrity (74) depends on Phase 71 because several DATA-* fixes live in the same service files as SEC-* fixes
- Quality (77) depends on Phases 73 and 75 because several QUAL-* test-coverage items exercise code paths those phases repair
- [Phase 71]: Use SQLAlchemy Enum member names (STATIC, UPLOADED) in raw SQL inserts for non-native_enum columns
- [Phase 71]: Phase 71 Plan 02: Applied inline campaign_id guards at service layer for list_campaigns, VoterListService, and ImportJob routes — closes IDORs C1/C2/C3 (SEC-01/02/03)
- [Phase 71-tenant-isolation-service-route-scoping]: 404 (not 403) on cross-campaign access, inline guards per service method, route-layer ValueError->HTTPException mapping
- [Phase 72]: Seed organization_members explicitly in two_orgs_with_campaigns since migration 015 only seeds on upgrade
- [Phase 72]: SEC-05 tests pass pre-migration (ENABLE RLS already isolates app_user); red bar is SEC-06 organization tests + reversibility placeholder
- [Phase 72]: Migration 026: FORCE on C5 tables, ENABLE+FORCE+campaign-scoped policies on C6; downgrade uses NO FORCE (C5) + DISABLE (C6) to preserve pre-existing policies
- [Phase 73]: Plan 03: sessionStorage (not OIDC state) as the redirect-preservation vehicle — keeps authStore.login() signature stable per D-07
- [Phase 73]: Plan 03: validate redirect twice (on write in login.tsx AND on read in callback.tsx) + use location.searchStr (raw string) not location.search (parsed object)
- [Phase 73]: Plan 73-02: GET callers/me endpoint returns SessionCallerResponse with computed checked_in boolean; 404 when caller not assigned
- [Phase 73]: Plan 73-05: added isLoading signal to permission hooks (authStore.isInitialized + TanStack Query pending state); guards render null while loading to prevent false-positive <Navigate/> redirects
- [Phase 73]: Plan 73-05: removed manager -> org_admin auto-promotion in app/api/deps.py; manager is campaign-scoped only and should not bypass org_admin gates
- [Phase 73]: 73-06: Guard wrapper + inner component split to keep hook order stable when gating ActiveCallingPage on server check-in
- [Phase 73]: 73-06: 404 from callers/me modeled as notAssigned flag (not error); isError also redirects as fail-safe
- [Phase 74]: Partial unique index via raw op.execute (matches procrastinate 017 pattern)
- [Phase 74]: Duplicate backfill inside migration (DELETE USING self-join, keep MIN(id)) — dev-only DB
- [Phase 74]: C9: Lock at _get_shift_raw (single chokepoint) — all 8 callers are write paths
- [Phase 74]: C10: ON CONFLICT DO NOTHING over DO UPDATE — import semantics leave existing rows intact
- [Phase 74]: C11 invite/transfer compensation: each inverse ZITADEL op isolated in its own try/except; original commit exception always propagates

### Blockers/Concerns

- 16 CRITICAL findings from 2026-04-04 codebase review block production hardening
- Multi-tenant data isolation has 4 IDOR vulnerabilities and RLS gaps on core tables
- Frontend auth guard logic error lets unauthenticated users reach protected routes

## Session Continuity

Last activity: 2026-04-04 — Roadmap created for v1.12 (phases 71-77)
Stopped at: Completed 74-03-PLAN.md
Resume file: None

## Performance Metrics

(Reset for v1.12 — prior metrics archived with v1.11 milestone completion.)
