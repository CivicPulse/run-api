# Phase 39: RLS Fix & Multi-Campaign Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 39-rls-fix-multi-campaign-foundation
**Areas discussed:** RLS reset strategy, Multi-campaign resolution, Test-before-fix approach, Settings button fix, Migration strategy, Middleware scope, Pool event implementation, Background task RLS, Frontend campaign switching, Org-aware RLS design, RLS policy audit, Campaign visibility prod bug, Rollback safety

---

## RLS Reset Strategy

### Pool Reset Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Both layers | Fix set_config to transaction-scoped AND add pool checkout event reset | ✓ |
| Transaction-scope only | Just fix set_config 3rd param to true | |
| Pool event only | Keep session-scoped but add pool checkout reset | |

**User's choice:** Both layers (belt-and-suspenders)

### Session Management

| Option | Description | Selected |
|--------|-------------|----------|
| Centralize to middleware | Replace get_db_with_rls() with middleware on main session | ✓ |
| Keep get_db_with_rls() | Fix existing pattern, keep separate session approach | |

**User's choice:** Centralize to middleware

### Fail Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Hard fail with 403 | Reject request if campaign context can't be set | ✓ |
| Log warning, proceed | Log failure but let request continue | |

**User's choice:** Hard fail with 403

---

## Multi-Campaign Resolution

### Membership Creation

| Option | Description | Selected |
|--------|-------------|----------|
| All campaigns in org | Remove .limit(1), loop through all campaigns | ✓ |
| Only matching campaign | Create membership only for current request's campaign | |
| You decide | Claude picks best approach | |

**User's choice:** All campaigns in org

### Campaign Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Require campaign_id in URL | Campaign-scoped endpoints use path parameter | ✓ |
| Header-based selector | Client sends X-Campaign-Id header | |
| Default to most recent | Keep .limit(1) as default fallback | |

**User's choice:** Require campaign_id in URL

### Campaign List Scope

| Option | Description | Selected |
|--------|-------------|----------|
| User's memberships only | Return only campaigns with CampaignMember record | ✓ |
| All org campaigns | Return all campaigns in user's org | |

**User's choice:** User's memberships only

---

## Test-Before-Fix Approach

### Test Order

| Option | Description | Selected |
|--------|-------------|----------|
| Test-first | Write failing tests before fix, verify after | ✓ |
| Fix first, test after | Fix bugs first, then write confirmation tests | |
| You decide | Claude picks approach | |

**User's choice:** Test-first

### Test Infrastructure

| Option | Description | Selected |
|--------|-------------|----------|
| Live PostgreSQL | Integration tests against real PostgreSQL with RLS | |
| Both levels | Unit tests (mocked) + integration tests (live PostgreSQL) | ✓ |
| Mocked only | Faster, no infra dependency | |

**User's choice:** Both levels

---

## Settings Button Fix

| Option | Description | Selected |
|--------|-------------|----------|
| Fix campaign resolution | Root cause fix via get_campaign_from_token | |
| Add defensive guard | UI guard when campaignId unavailable | |
| Both | Fix root cause AND add defensive UI guard | ✓ |

**User's choice:** Both

---

## Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Alembic data migration | Migration to backfill missing CampaignMember records | ✓ |
| Seed script instead | One-time script, not tracked in Alembic | |
| Let ensure_user_synced fix it | Wait for users to re-auth | |

**User's choice:** Alembic data migration

---

## Middleware Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Path-based convention | /campaigns/{campaign_id}/* gets RLS automatically | ✓ |
| Dependency-based opt-in | Endpoints explicitly use require_campaign_context() | |
| Allowlist of non-RLS paths | Default RLS ON, explicit exceptions | |

**User's choice:** Path-based convention

---

## Pool Event Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| checkout event | Reset on connection checkout (before request) | |
| checkin event | Reset on connection return (after request) | |
| You decide | Claude picks based on SQLAlchemy semantics | ✓ |

**User's choice:** Claude's discretion

---

## Background Task RLS

| Option | Description | Selected |
|--------|-------------|----------|
| Same fix everywhere | Transaction-scoped globally, tasks get it automatically | ✓ |
| Different for tasks | Keep session-scoped for tasks that own full lifecycle | |

**User's choice:** Same fix everywhere

---

## Frontend Campaign Switching

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 43 | Phase 39 is backend-only, campaign list page suffices | ✓ |
| Basic switcher now | Minimal dropdown in sidebar header | |
| Campaign list page fix only | Ensure list shows all user's campaigns | |

**User's choice:** Defer to Phase 43

---

## Org-Aware RLS Design

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-compatible design | Support app.current_org_id later without rework | ✓ |
| Campaign-only for now | Only handle campaign_id, add org in Phase 41 | |
| Full org context now | Add app.current_org_id in Phase 39 | |

**User's choice:** Forward-compatible design
**Notes:** User noted org switcher is needed and RLS should handle org switching events

---

## RLS Policy Audit

| Option | Description | Selected |
|--------|-------------|----------|
| Context fix + spot check | Fix context mechanism, spot-check 5-10 high-risk policies | |
| Full policy audit | Review all 51 RLS policies across 6 migrations | ✓ |
| Context fix only | Trust policies are correct, only fix context bug | |

**User's choice:** Full policy audit

---

## Campaign Visibility Prod Bug

| Option | Description | Selected |
|--------|-------------|----------|
| Missing CampaignMember records | .limit(1) bug caused missing memberships | |
| Auth/ZITADEL config mismatch | Prod ZITADEL org_id doesn't match DB | |
| Both — investigate in order | Check memberships first, then ZITADEL config | ✓ |
| Needs investigation | Diagnostic step in plan to identify root cause | |

**User's choice:** Both — investigate in order

---

## Rollback Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Alembic downgrade + deploy revert | Standard GitOps rollback | ✓ |
| Feature flag | Gate behind env var | |
| You decide | Claude picks based on deployment setup | |

**User's choice:** Alembic downgrade + deploy revert

---

## Claude's Discretion

- Pool event type selection (checkout vs checkin vs connect) and DBAPI vs ORM approach

## Deferred Ideas

- Org switcher UI — Phase 43 (ORG-12)
- Frontend campaign switching component — Phase 43
- Org-level RLS policies — Phase 41
