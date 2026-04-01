# Phase 58: E2E Core Tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 58-e2e-core-tests
**Areas discussed:** Spec organization, Test data strategy, RBAC coverage approach, Test isolation vs speed

---

## Spec Organization

### Q1: How should the ~8 requirement groups map to Playwright spec files?

| Option | Description | Selected |
|--------|-------------|----------|
| One file per requirement | 8 spec files: rbac.spec.ts, org-management.spec.ts, campaign-settings.spec.ts, voter-crud.spec.ts, voter-contacts.spec.ts, voter-tags.spec.ts, voter-notes.spec.ts, voter-lists.spec.ts. Clear traceability to requirements. | ✓ |
| Grouped by domain | ~4 files: rbac.spec.ts, org-campaign.spec.ts, voter-crud.spec.ts, voter-lists.spec.ts. Fewer files, less granular CI parallelism. | |
| You decide | Claude picks the file structure based on test count per requirement and CI shard balance. | |

**User's choice:** One file per requirement
**Notes:** None

### Q2: Should the new spec files follow a naming convention different from existing phase-prefixed specs?

| Option | Description | Selected |
|--------|-------------|----------|
| Domain-based names | e.g., rbac.spec.ts, org-management.spec.ts, voter-crud.spec.ts — clear, descriptive, no phase prefix. | ✓ |
| Section-numbered names | e.g., s03-rbac.spec.ts, s04-org-management.spec.ts — matches testing plan section numbers. | |
| You decide | Claude picks naming based on what works best with the role-suffix convention. | |

**User's choice:** Domain-based names
**Notes:** None

### Q3: How should RBAC tests work with the role-suffix convention?

| Option | Description | Selected |
|--------|-------------|----------|
| Split RBAC by role | rbac.viewer.spec.ts, rbac.volunteer.spec.ts, rbac.manager.spec.ts, rbac.admin.spec.ts, rbac.spec.ts (owner). Each runs under that role's auth. | ✓ |
| Single RBAC spec with manual login | One rbac.spec.ts that programmatically switches between stored auth states. | |
| You decide | Claude picks the approach that best fits the existing auth infrastructure. | |

**User's choice:** Split RBAC by role
**Notes:** None

---

## Test Data Strategy

### Q1: How should E2E tests get the data they need to run?

| Option | Description | Selected |
|--------|-------------|----------|
| Seed data + per-test creation | Use seed data as baseline for read/query tests. Create fresh entities for mutation tests. Hybrid approach. | ✓ |
| Fresh data per spec | Each spec creates all data from scratch. Fully isolated but much slower. | |
| Seed data only | All tests use pre-seeded dataset. Faster, but mutation tests can break each other. | |
| You decide | Claude picks the strategy based on what each spec needs. | |

**User's choice:** Seed data + per-test creation
**Notes:** None

### Q2: For voter CRUD tests needing 20+ voters — UI or API creation?

| Option | Description | Selected |
|--------|-------------|----------|
| UI for a few, API for bulk | Test create-voter form for 2-3 voters, use API for remaining 17+. Form is tested, volume is fast. | ✓ |
| All via UI | Every voter through the form. Thorough but very slow. | |
| All via API | Skip UI form testing. Faster but form untested. | |
| You decide | Claude picks per spec based on what's being tested. | |

**User's choice:** UI for a few, API for bulk
**Notes:** None

---

## RBAC Coverage Approach

### Q1: How should RBAC-03 through RBAC-09 map to test structure?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-role permission checklist | Each role's spec runs through every page, verifying buttons visible vs hidden. Matches testing plan structure. | ✓ |
| Per-action cross-role matrix | Spec organized by action tested across all 5 roles. More explicit matrix but requires auth switching. | |
| You decide | Claude picks the structure that gives best coverage with role-suffix system. | |

**User's choice:** Per-role permission checklist
**Notes:** None

### Q2: Should RBAC-01 and RBAC-02 (role assignment) still be tested as E2E UI actions?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip — already provisioned | Phase 57's script assigns roles. Member management UI tested separately in campaign-settings.spec.ts. | ✓ |
| Test role assignment via UI | Include RBAC-01/02 as tests. Redundant with CAMP-02/CAMP-03 but explicitly covers RBAC setup. | |
| You decide | Claude decides based on what's already covered. | |

**User's choice:** Skip — already provisioned
**Notes:** None

---

## Test Isolation vs Speed

### Q1: Should tests within a spec file run in parallel or serially?

| Option | Description | Selected |
|--------|-------------|----------|
| Serial within spec, parallel across specs | test.describe.serial for specs with ordered steps. Different spec files parallel via workers. | ✓ |
| Fully parallel | All tests independent, each creating own data. Maximum speed. | |
| Fully serial | One worker, all tests in order. Slowest but zero interference risk. | |
| You decide | Claude picks isolation level per spec based on dependencies. | |

**User's choice:** Serial within spec, parallel across specs
**Notes:** None

### Q2: Should mutation tests clean up after themselves?

| Option | Description | Selected |
|--------|-------------|----------|
| No cleanup — fresh env per CI run | Docker Compose provides fresh database each CI run. Delete tests naturally clean up creates. | ✓ |
| Explicit cleanup in afterAll | Each spec cleans up via API DELETE calls. More robust for local reruns. | |
| You decide | Claude picks based on test reliability. | |

**User's choice:** No cleanup — fresh env per CI run
**Notes:** None

### Q3: What about the existing 51 phase-verification specs?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep for now | Leave as-is. Still pass, provide regression coverage. Clean up later. | ✓ |
| Archive to e2e/legacy/ | Move old specs to subfolder. Cleaner directory but risks CI disruption. | |
| Remove old specs | Delete old specs. Aggressive but clean. | |
| You decide | Claude decides based on overlap with new specs. | |

**User's choice:** Keep for now
**Notes:** None

---

## Claude's Discretion

- Exact test case implementation details within each spec file
- Edge case handling in RBAC testing (direct URL access to restricted routes)
- Whether to use `test.step()` for sub-steps within serial tests
- Playwright worker count for CI shard balance
- API helper function structure for bulk data creation

## Deferred Ideas

None — discussion stayed within phase scope
