# Requirements: CivicPulse Run

**Defined:** 2026-03-29
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.7 Requirements

Requirements for Testing & Validation milestone. Each maps to roadmap phases.

### Feature Gaps

- [x] **FEAT-01**: User can edit a voter interaction note (type="note" only) via the voter detail History tab
- [x] **FEAT-02**: User can delete a voter interaction note (type="note" only) via the voter detail History tab
- [x] **FEAT-03**: User can rename a walk list from the canvassing page or walk list detail page

### Test Infrastructure

- [x] **INFRA-01**: Provisioning script creates 15 ZITADEL test users (3 per campaign role: owner, admin, manager, volunteer, viewer) with verified emails and no password change required
- [x] **INFRA-02**: Playwright config has 5+ auth projects with per-role storageState files (owner, admin, manager, volunteer, viewer)
- [x] **INFRA-03**: CI workflow runs the expanded E2E test suite with appropriate sharding

### E2E Tests — RBAC & Organization

- [x] **E2E-01**: Automated tests verify each of the 5 campaign roles can/cannot access role-gated UI actions (RBAC-01 through RBAC-09)
- [x] **E2E-02**: Automated tests verify org dashboard, campaign creation, archive/unarchive, org settings, and org member management (ORG-01 through ORG-08)
- [x] **E2E-03**: Automated tests verify campaign settings CRUD, member management, ownership transfer, and campaign deletion (CAMP-01 through CAMP-06)

### E2E Tests — Voter Workflows

- [x] **E2E-04**: Automated tests verify L2 voter import with auto-mapping, progress tracking, cancellation, and concurrent import prevention (IMP-01 through IMP-04)
- [x] **E2E-05**: Automated tests verify imported voter data accuracy against the source CSV for 40+ voters (VAL-01, VAL-02)
- [x] **E2E-06**: Automated tests verify all 23 voter filter dimensions individually and in combination (FLT-01 through FLT-05)
- [x] **E2E-07**: Automated tests verify voter create, edit, delete lifecycle for 20+ voters (VCRUD-01 through VCRUD-04)
- [x] **E2E-08**: Automated tests verify voter contact (phone, email, address) CRUD across 20 voters (CON-01 through CON-06)
- [x] **E2E-09**: Automated tests verify voter tag create, assign, remove, and delete lifecycle (TAG-01 through TAG-05)
- [x] **E2E-10**: Automated tests verify voter note create, edit, and delete lifecycle (NOTE-01 through NOTE-03)
- [x] **E2E-11**: Automated tests verify voter list CRUD including static/dynamic lists and add/remove voters (VLIST-01 through VLIST-06)

### E2E Tests — Operations

- [x] **E2E-12**: Automated tests verify turf CRUD with overlap detection, GeoJSON import/export, and boundary editing (TURF-01 through TURF-07)
- [x] **E2E-13**: Automated tests verify walk list generation, canvasser assignment, rename, and deletion (WL-01 through WL-07)
- [x] **E2E-14**: Automated tests verify call list CRUD and DNC list management including enforcement (CL-01 through CL-05, DNC-01 through DNC-06)
- [x] **E2E-15**: Automated tests verify phone banking session CRUD, caller assignment, active calling, and progress tracking (PB-01 through PB-10)
- [x] **E2E-16**: Automated tests verify survey script CRUD, question management, reordering, and status lifecycle (SRV-01 through SRV-08)
- [x] **E2E-17**: Automated tests verify volunteer registration (user and non-user), roster, detail, edit, and delete (VOL-01 through VOL-08)
- [x] **E2E-18**: Automated tests verify volunteer tag and availability CRUD (VTAG-01 through VTAG-05, AVAIL-01 through AVAIL-03)
- [x] **E2E-19**: Automated tests verify shift CRUD, volunteer assignment, availability enforcement, check-in/out, and hours tracking (SHIFT-01 through SHIFT-10)

### E2E Tests — Field Mode & Cross-Cutting

- [x] **E2E-20**: Automated tests verify field mode hub, canvassing wizard, phone banking, offline queue, and onboarding tour (FIELD-01 through FIELD-10, OFFLINE-01 through OFFLINE-03, TOUR-01 through TOUR-03). Phase 64 hardened FIELD-07 with deterministic per-test disposable canvassing fixtures, survey-present assertions, and a strict order-isolation permutation matrix (`--strict-phase64-field07-order`) proving order independence across 4 execution variants
- [x] **E2E-21**: Automated tests verify navigation, empty states, loading skeletons, error boundaries, form guards, and toasts (NAV-01 through NAV-03, UI-01 through UI-03, CROSS-01 through CROSS-03)

### Validation & Production

- [x] **VAL-01**: All E2E tests pass at 100% against local Docker Compose environment
- [x] **VAL-02**: All bugs discovered during testing are fixed and verified
- [x] **PROD-01**: AI-consumable production testing instruction document is created with production-specific URLs, auth, and data considerations

## Future Requirements

None deferred for this milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual regression testing (screenshot comparison) | High maintenance cost, low ROI for this stage |
| Performance/load testing | Different concern than functional E2E validation |
| Page Object Model refactor for existing 51 specs | Would create inconsistency; existing specs work fine |
| Mobile device testing (real devices) | Playwright viewport emulation sufficient for now |
| API-level integration test expansion | This milestone focuses on UI E2E; backend has 66 existing tests |
| Accessibility full audit (beyond spot checks) | v1.5 already achieved WCAG AA with 38-route axe-core scan |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FEAT-01 | Phase 56 | Complete |
| FEAT-02 | Phase 56 | Complete |
| FEAT-03 | Phase 56 | Complete |
| INFRA-01 | Phase 62 | Complete |
| INFRA-02 | Phase 57 | Complete |
| INFRA-03 | Phase 62 | Complete |
| E2E-01 | Phase 58 | Complete |
| E2E-02 | Phase 58 | Complete |
| E2E-03 | Phase 58 | Complete |
| E2E-04 | Phase 59 | Complete |
| E2E-05 | Phase 59 | Complete |
| E2E-06 | Phase 59 | Complete |
| E2E-07 | Phase 58 | Complete |
| E2E-08 | Phase 58 | Complete |
| E2E-09 | Phase 58 | Complete |
| E2E-10 | Phase 58 | Complete |
| E2E-11 | Phase 58 | Complete |
| E2E-12 | Phase 59 | Complete |
| E2E-13 | Phase 59 | Complete |
| E2E-14 | Phase 59 | Complete |
| E2E-15 | Phase 63 | Complete |
| E2E-16 | Phase 59 | Complete |
| E2E-17 | Phase 59 | Complete |
| E2E-18 | Phase 59 | Complete |
| E2E-19 | Phase 59 | Complete |
| E2E-20 | Phase 60 (initial), Phase 64 (isolation hardening: disposable fixtures, order-matrix gate) | Complete |
| E2E-21 | Phase 60 | Complete |
| VAL-01 | Phase 62 | Complete |
| VAL-02 | Phase 60 | Complete |
| PROD-01 | Phase 61 | Complete |

**Coverage:**
- v1.7 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-31 after Phase 64 FIELD-07 order-isolation closure*
