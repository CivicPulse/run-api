# Phase 57: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 57-test-infrastructure
**Areas discussed:** Test user identity, Playwright auth structure, CI sharding approach, Provisioning scope

---

## Test User Identity

### Email Domain

| Option | Description | Selected |
|--------|-------------|----------|
| @localhost | Matches existing E2E users. ZITADEL accepts any domain. Simpler. | ✓ |
| @test.civicpulse.local | Per testing plan. More realistic looking but purely cosmetic. | |

**User's choice:** @localhost
**Notes:** Consistency with existing `e2e-orgadmin@localhost` and `e2e-volunteer@localhost` pattern.

### Password Convention

| Option | Description | Selected |
|--------|-------------|----------|
| Role-based pattern | Owner1234!, Admin1234!, etc. Predictable per role. | ✓ |
| Single shared password | All users use same password. Simpler env config. | |
| You decide | Claude picks. | |

**User's choice:** Role-based pattern
**Notes:** None

### Campaign Membership Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Script assigns everything | ZITADEL users + project roles + org membership + campaign membership. | ✓ |
| Script creates users only | ZITADEL users + project roles only. Campaign membership via test fixtures. | |
| You decide | Claude picks. | |

**User's choice:** Script assigns everything
**Notes:** None

---

## Playwright Auth Structure

### Spec Routing Convention

| Option | Description | Selected |
|--------|-------------|----------|
| Filename suffix convention | .owner.spec.ts, .admin.spec.ts, etc. Extends current pattern. | ✓ |
| Directory-per-role | e2e/owner/, e2e/admin/, etc. Physical separation. | |
| Test fixture-based | useRole('admin') fixture at runtime. | |

**User's choice:** Filename suffix convention
**Notes:** None

### Default Auth Role

| Option | Description | Selected |
|--------|-------------|----------|
| Owner | Full permissions. Most tests need full access. Primary actor in testing plan. | ✓ |
| Admin | Close to full access but not campaign owner. | |
| Keep admin@localhost | Don't change existing default user. | |

**User's choice:** Owner
**Notes:** None

### Existing Spec Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate existing specs | Update 3 auth setups to 5-role structure. One unified auth system. | ✓ |
| Run both auth systems | Keep legacy 3-project setup alongside new 5-project. | |
| You decide | Claude picks. | |

**User's choice:** Migrate existing specs
**Notes:** None

---

## CI Sharding Approach

### Parallelization Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright --shard | Built-in --shard N/M with GitHub Actions matrix. Automatic splitting. | ✓ |
| Role-based matrix | One CI job per role. Natural grouping but uneven load. | |
| Single job, more workers | Keep one job, increase workers to 2-4. Simpler but slower. | |

**User's choice:** Playwright --shard
**Notes:** None

### Shard Count

| Option | Description | Selected |
|--------|-------------|----------|
| 4 shards | ~33 specs per shard for ~130 total. | ✓ |
| 2 shards | Minimal parallelism. | |
| You decide | Claude picks based on final spec count. | |

**User's choice:** 4 shards
**Notes:** None

### Report Merging

| Option | Description | Selected |
|--------|-------------|----------|
| Merge into one report | Playwright merge-reports CLI. Single combined artifact. | ✓ |
| Separate per-shard reports | Each shard uploads own artifact. | |

**User's choice:** Merge into one report
**Notes:** None

---

## Provisioning Scope

### Script Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Replace in-place | Expand create-e2e-users.py from 2 to 15 users. | ✓ |
| New script | Create scripts/provision-test-users.py. | |
| You decide | Claude picks. | |

**User's choice:** Replace in-place
**Notes:** None

### Campaign Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Use seed campaign | Assign to existing Macon-Bibb demo campaign. Real data available. | ✓ |
| Create dedicated E2E campaign | New isolated campaign. Empty data. | |
| You decide | Claude picks. | |

**User's choice:** Use seed campaign
**Notes:** None

### Admin User

| Option | Description | Selected |
|--------|-------------|----------|
| Keep separate | admin@localhost stays as ZITADEL instance admin. 15 E2E users are new accounts. | ✓ |
| Replace with owner1 | Phase out admin@localhost. | |

**User's choice:** Keep separate
**Notes:** None

---

## Claude's Discretion

- Auth setup file structure details
- Exact username format
- Campaign membership insertion method
- Shard merge job implementation specifics

## Deferred Ideas

None — discussion stayed within phase scope
