# Phase 113: Provisioning Step in Email Task + Branched Email Content - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-04-23
**Phase:** 113-provisioning-step-email-task-branched-content
**Mode:** `--interactive` (batched, one turn)
**Areas discussed:** Role-grant placement, Provisioning failure handling, Email template branching, Timestamp semantics

---

## Role-Grant Placement (PROV-05 / PITFALLS Z4)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep at accept-time | Current pattern; task only does `ensure_human_user`. Smallest diff. Orphaned-user risk bounded (no grant = no access). | ✓ |
| Move role-grant into task | Task does user + role. Z4-atomic but enlarges critical section and reshapes accept flow. | |
| Hybrid (pre-grant first-time only) | Branch on `created=True`. Compromise but two code paths to keep consistent. | |

**User's choice:** Keep at accept-time (recommended)

---

## Provisioning Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Raise → Procrastinate retries | Catch, persist `status='failed'` + error, reraise. Procrastinate handles backoff. | ✓ |
| Catch + schedule retry task | Own backoff, decoupled from email retries. More moving parts. | |
| Catch + send best-effort email | Break glass fallback; probably never correct. | |

**User's choice:** Raise → Procrastinate retries (recommended)

---

## Email Template Branching Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Two named templates | Add `CAMPAIGN_MEMBER_INVITE_NEW_USER`; task selects key from `created` bool. | ✓ |
| One template + conditional variables | Single file with `{% if %}`; two plain-text paths can drift. | |
| Two separate `submit_*` functions | Maximum separation, some duplication. | |

**User's choice:** Two named templates (recommended)

---

## `identity_provisioning_at` Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Set on success only | Column reads as "when ZITADEL identity first became usable". | ✓ |
| Set on any terminal state | "Last provisioning attempt finished at". Different semantic. | |
| Set on every attempt start | "Last attempted at". Conflicts with column name. | |

**User's choice:** Set on success only (recommended)

---

## Claude's Discretion

- Exact boolean parameter name on `submit_campaign_invite_email`
- Template file layout consistency with existing templates
- Log field composition at status transitions
- Single-flush vs two-flush pattern for `'provisioning'` transient state

## Deferred Ideas

- Moving role-grant into the task for Z4 atomicity
- Cleanup sweep for orphaned ZITADEL users (expired invites with provisioned users)
- Pre-send re-check for revoke-between-provision-and-email race
- Provisioning path rate-limiting
- Funnel telemetry for the provisioning step (handled in 115's OBS work)
