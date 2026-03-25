# Phase 47: Integration Consistency & Documentation Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 47-integration-consistency-documentation-cleanup
**Areas discussed:** Rate limit strategy, RLS fix approach, Traceability cleanup

---

## Rate Limit Strategy

### Q1: Rate limit tiering

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered by type | Different limits by operation type: reads (GET) ~60/min, writes (POST/PUT/DELETE) ~30/min, auth-sensitive (join/invite) 5-20/min | ✓ |
| Uniform limits | Same limit on every endpoint (e.g. 30/minute). Simple but may be too restrictive for reads or too loose for sensitive operations. | |
| You decide | Claude picks appropriate limits based on endpoint sensitivity and common patterns | |

**User's choice:** Tiered by type (Recommended)
**Notes:** None

### Q2: Rate limiting key strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Both IP + per-user | IP-based for all endpoints + per-user for authenticated ones. get_user_or_ip_key function already exists. Fulfills OBS-04. | ✓ |
| IP-only | Simpler — just IP-based everywhere. Doesn't fully satisfy OBS-04. | |
| You decide | Claude picks based on existing infrastructure and requirements | |

**User's choice:** Both (Recommended)
**Notes:** None

### Q3: Bulk endpoint limits

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, stricter | Bulk operations (import, bulk DNC) get tighter limits (e.g. 5-10/min). Standard writes at 30/min. | ✓ |
| Same as writes | Treat bulk operations same as regular writes (30/min). | |
| You decide | Claude picks appropriate limits for bulk vs standard operations | |

**User's choice:** Yes, stricter (Recommended)
**Notes:** None

---

## RLS Fix Approach

### Q1: Verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| Existing E2E coverage | Turf creation E2E spec already exercises these endpoints. No new tests needed. | |
| Add targeted unit test | Write a specific test confirming get_campaign_db is used. Belt-and-suspenders. | ✓ |
| You decide | Claude picks verification approach based on existing test coverage | |

**User's choice:** Add targeted unit test
**Notes:** None

---

## Traceability Cleanup

### Q1: Verification scope

| Option | Description | Selected |
|--------|-------------|----------|
| Verify and close | Quick programmatic check confirming all 48 rows correct. Document verification. | ✓ |
| Skip entirely | Trust current state from grep. Focus on RLS and rate limiting. | |
| Full re-audit | Cross-reference every requirement against actual code/test coverage. | |

**User's choice:** Verify and close (Recommended)
**Notes:** REQUIREMENTS.md already has no TBD/Pending entries — appears updated since milestone audit was written.

---

## Claude's Discretion

- Specific rate limit numbers within tiers
- Rate limit decorator placement pattern
- Unit test structure for RLS verification

## Deferred Ideas

None — discussion stayed within phase scope
