# Phase 46: E2E Testing & Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 46-e2e-testing-integration
**Areas discussed:** E2E flow scope & depth, Integration test approach, RLS isolation dimensions, CI integration, Test data strategy, Flaky test mitigation, Coverage reporting

---

## E2E Flow Scope & Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full CRUD journeys | Each flow tests complete user journey: create → view → edit → verify | ✓ |
| Smoke-level navigation | Page loads, key elements render, basic interactions work | |
| Critical path only | Happy path with one assertion at the end | |

**User's choice:** Full CRUD journeys
**Notes:** None

### Auth Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Stored auth state | Setup project logs in once, saves browser storage, specs reuse | ✓ |
| API-based token injection | Call ZITADEL token endpoint, inject JWT into browser context | |
| Login per test | Each test navigates to login page and authenticates | |

**User's choice:** Stored auth state
**Notes:** None

### E2E Target Environment

| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose stack | Self-contained, reproducible. Matches existing playwright.config.ts | ✓ |
| Running dev environment | Assume docker compose up is already running | |

**User's choice:** Docker Compose stack
**Notes:** None

### File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| One spec per flow | 6 files, clear isolation, easy to run individually | ✓ |
| Grouped by domain | 3 files, fewer files but longer suites | |

**User's choice:** One spec per flow
**Notes:** None

---

## Integration Test Approach

### Live Infrastructure

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL + PostGIS only | Mock MinIO and ZITADEL. Simplest to run | |
| Full Docker Compose stack | PostgreSQL + PostGIS + MinIO + ZITADEL all running | ✓ |
| PostgreSQL + PostGIS + MinIO | Add MinIO for import tests. Mock ZITADEL only | |

**User's choice:** Full Docker Compose stack
**Notes:** User chose the most realistic option over the recommended simpler option

### Tracking Pending Tests

| Option | Description | Selected |
|--------|-------------|----------|
| Grep for stubs, convert in-place | Find all stubs, convert each to real test | ✓ |
| New test files only | Write fresh integration test files | |
| Audit and prioritize | Categorize by risk/value, implement highest-priority | |

**User's choice:** Grep for stubs, convert in-place
**Notes:** None

---

## RLS Isolation Dimensions

### Test Level

| Option | Description | Selected |
|--------|-------------|----------|
| Raw SQL | set_config + SELECT directly. Proves RLS at database level | |
| API-level requests | Authenticated requests, verify scoped responses | |
| Both layers | Raw SQL for policy verification + API smoke tests | ✓ |

**User's choice:** Both layers
**Notes:** User chose the most thorough option over the recommended SQL-only approach

### File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing files | Add missing dimensions to existing test files, add new files for gaps | ✓ |
| One comprehensive suite | Consolidate all 6 dimensions in one file | |
| You decide | Claude picks based on existing code | |

**User's choice:** Extend existing files
**Notes:** None

---

## CI Integration

### Workflow Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single workflow, Docker Compose | One workflow starts Compose, runs both test suites sequentially | ✓ |
| Separate workflows | Dedicated workflow per test type | |
| Integration in existing CI | Add steps to existing publish workflow | |

**User's choice:** Single workflow, Docker Compose
**Notes:** None

### Merge Gating

| Option | Description | Selected |
|--------|-------------|----------|
| Block merges | Required checks, PRs cannot merge with failures | ✓ |
| Advisory only | Report results, don't block merges | |
| Staged rollout | Start advisory, flip to blocking after 1 week | |

**User's choice:** Block merges
**Notes:** None

### Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Screenshots + traces on failure | Upload failure screenshots and Playwright traces | ✓ |
| Full artifacts always | Screenshots, traces, and video for every run | |
| Screenshots only | Just failure screenshots, no replay capability | |

**User's choice:** Screenshots + traces on failure
**Notes:** None

---

## Test Data Strategy

### Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script | Run seed.py, tests assert against known data | |
| Per-test API setup | Each spec creates own data via API calls | |
| Seed + per-test supplements | Seed provides baseline, tests create specific scenarios | ✓ |

**User's choice:** Seed + per-test supplements
**Notes:** None

### Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh DB per suite run | Docker Compose down/up + migrations + seed each run | ✓ |
| Transaction rollback | Wrap each test in transaction, rollback after | |
| No cleanup needed | Rely on idempotent seed and unique data | |

**User's choice:** Fresh DB per suite run
**Notes:** None

---

## Flaky Test Mitigation

### Wait Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-waiting + explicit assertions | Built-in auto-waiting, explicit waitFor for known async ops | ✓ |
| Network idle strategy | Wait for network idle after navigation/actions | |
| Custom wait utilities | Build waitForApiResponse() helper | |

**User's choice:** Auto-waiting + explicit assertions
**Notes:** None

### Retry/Timeout Config

| Option | Description | Selected |
|--------|-------------|----------|
| 2 retries, 30s timeout | Matches existing config, trace on first retry | ✓ |
| 1 retry, 60s timeout | Fewer retries, longer timeout | |
| No retries, strict | Must pass first try | |

**User's choice:** 2 retries, 30s timeout
**Notes:** None

---

## Coverage Reporting

| Option | Description | Selected |
|--------|-------------|----------|
| No coverage enforcement | Focus on test quality over metrics | ✓ |
| Coverage report, no threshold | Generate reports for visibility only | |
| Coverage with threshold | Enforce minimum coverage (e.g., 80%) | |

**User's choice:** No coverage enforcement
**Notes:** None

---

## Claude's Discretion

- Exact E2E test assertions per flow
- Integration test fixture design and helper utilities
- RLS test fixture structure for the 6 isolation dimensions
- GitHub Actions workflow structure and service health-check strategy
- Playwright page object patterns vs inline selectors

## Deferred Ideas

None — discussion stayed within phase scope
