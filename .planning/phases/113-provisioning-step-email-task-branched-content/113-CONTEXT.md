# Phase 113: Provisioning Step in Email Task + Branched Email Content — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 113 wires the Phase-111 service surface into the durable `send_campaign_invite_email` task and branches email content on whether the invitee is brand-new or returning. It does NOT move role-grant out of the accept-time path, does NOT change the accept flow, and does NOT touch the frontend.

**In scope:**
- Modify `app/tasks/invite_tasks.py` `send_campaign_invite_email` to call `ensure_human_user` guarded by `if invite.zitadel_user_id is None`, write `zitadel_user_id` + `identity_provisioning_status` + (on success) `identity_provisioning_at` to the `invites` row, and raise to let Procrastinate retry on failure.
- Use `urlTemplate` parameter on `create_invite_code` matching EMAIL-03's exact shape: `https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`.
- Add a second transactional template `CAMPAIGN_MEMBER_INVITE_NEW_USER` alongside the existing `CAMPAIGN_MEMBER_INVITE`, each with subject + HTML + plain-text variants.
- Modify `app/services/invite_email.py` `submit_campaign_invite_email` to accept a `first_time: bool` parameter (or equivalent) and select the template + build the correct URL (init-link vs direct-accept).
- Integration tests covering: ZITADEL-down retry, ZITADEL-up happy path (first-time + returning), revoke-between-provision-and-email skip, duplicate-retry idempotency, mid-task-crash recovery.
- Unit tests for template selection and URL construction branching.
- `identity_provisioning_status` transitions: `'not_started'` → `'provisioning'` → `'provisioned'` | `'failed'`.

**Out of scope (belongs to other phases):**
- Moving `assign_project_role` out of `app/services/invite.py` accept-time flow (Phase 113 does NOT change where role-grant runs — D-ROLE-01).
- Frontend query-string parsing, `/login` interstitial, empty-membership gate (Phase 114).
- Admin resend endpoint, expired-init-code re-mint, funnel telemetry, legacy-flow CTA (Phase 115).
- Rate-limiting the provisioning path (deferred per 111-CONTEXT).
- Changing the retry policy on the `communications` queue itself (reuse whatever is configured today).
- Backfilling tests for the existing `send_campaign_invite_email` paths untouched by this phase.

</domain>

<decisions>
## Implementation Decisions

### Role-Grant Placement

- **D-ROLE-01:** **Role-grant stays at accept-time in `app/services/invite.py`.** Phase 113 does NOT call `assign_project_role` from the email task. Rationale: (a) aligns with Phase 111's CONTEXT, which scoped the task's critical section to `ensure_human_user` only; (b) smallest diff; (c) Z4 atomicity risk is bounded — a provisioned-but-never-accepted ZITADEL user exists without any campaign access, which is harmless (no grant = no routes).
- **D-ROLE-02:** **PROV-05's "subsequent role-grant or email-send fails" language is interpreted as: on retry, `ensure_human_user`'s search-first path returns the existing user with `created=False`, so no duplicate is created.** The "role-grant" in that sentence refers to the eventual accept-time role-grant (not something in the task). No code in the task calls `assign_project_role`.
- **D-ROLE-03:** **Orphaned ZITADEL users (provisioned but invite expires/revoked before accept) are ACCEPTED as operational overhead this milestone.** A cleanup phase in a later milestone can add a periodic sweep if the cohort grows meaningfully. Telemetry (Phase 115's OBS-01/02) will make this visible.

### Provisioning Failure Handling

- **D-FAIL-01:** **Raise on failure — Procrastinate retries the whole task.** On caught exception from `ensure_human_user` (after Phase 111's `_retry_on_5xx` has exhausted its 3 attempts), the task persists `identity_provisioning_status='failed'` + `identity_provisioning_error=<str(exc)>` + `email_delivery_last_event_at=utcnow()`, commits, then re-raises. Procrastinate's retry policy handles backoff for the whole task. No email is sent on an attempt that fails provisioning.
- **D-FAIL-02:** **`identity_provisioning_status` transitions:** `'not_started'` (default from Phase 112) → set to `'provisioning'` on entering the provisioning block (before calling `ensure_human_user`) → `'provisioned'` on success → `'failed'` on caught exhaustion. The `'provisioning'` transient state is visible on rows where the task was killed mid-call.
- **D-FAIL-03:** **Procrastinate retry policy is unchanged.** Whatever is configured on the `communications` queue today (look at `app/tasks/procrastinate_app.py` during planning) handles the backoff — no new retry config in this phase. If the existing policy is "no retry" (naive re-queue), flag as a risk in PLAN and escalate.
- **D-FAIL-04:** **On failure, `identity_provisioning_at` is NOT set.** Only success sets it. See D-TIMESTAMP-01.
- **D-FAIL-05:** **The existing `if invite.accepted_at or invite.revoked_at` / expiry skip-branches run BEFORE the provisioning block.** A revoked-between-provision-and-email race: if the invite is revoked AFTER provisioning succeeds but BEFORE `submit_campaign_invite_email`, the task's current skip branches won't re-check — so the email sends. This is existing behavior. Phase 113 does NOT add a second pre-send check for symmetry; PROV-05 integration test covers this edge case by asserting no duplicate ZITADEL user on retry, not that the email is skipped.

### Email Template Branching

- **D-TPL-01:** **Two named templates.** Add `CAMPAIGN_MEMBER_INVITE_NEW_USER` to `TransactionalTemplateKey` enum in `app/services/email_types.py` alongside the existing `CAMPAIGN_MEMBER_INVITE`. Each template has subject, HTML, and plain-text variants (EMAIL-02 compliance).
- **D-TPL-02:** **Branch in the task, not in the service layer.** `send_campaign_invite_email` picks the template key from `ensure_human_user.created` and passes it through. `submit_campaign_invite_email` gets a `first_time: bool` parameter (exact name chosen at plan-time) and constructs the correct URL. Rationale: task is the source of truth for "was this a new user?", and passing the boolean through keeps the service layer pure.
- **D-TPL-03:** **Shared variables across both templates:** inviter display name, campaign name, organization name (if present), role, expires_at formatted, support footer. EMAIL-02 requires these + accessibility compliance (semantic HTML, no image-only content, plain-text fallback).
- **D-TPL-04:** **URL construction:**
  - First-time (`created=True`): ZITADEL init link returned by `create_invite_code(user_id, url_template)` with `url_template = "https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}"`. The actual token value is interpolated into the template string BEFORE passing to ZITADEL (ZITADEL only substitutes `{{.Code}}` and `{{.UserID}}`).
  - Returning (`created=False`): existing direct-accept URL `https://run.civpulse.org/invites/<token>` — no ZITADEL `urlTemplate` call needed. The user already has a ZITADEL identity and will redirect through `/login` to accept.
- **D-TPL-05:** **Content tone:** first-time subject says "set your password to accept this invite"; returning subject preserves the existing "accept your invite" wording. Body copy for first-time explicitly explains they'll be asked to create a password; returning users get the existing copy.

### Timestamp Semantics

- **D-TIMESTAMP-01:** **`identity_provisioning_at = utcnow()` only on success.** Reads as "when did this invite first get a usable ZITADEL identity?" Failures set `identity_provisioning_error` and `email_delivery_last_event_at` but leave `identity_provisioning_at` NULL. Matches MIG-01's naming.
- **D-TIMESTAMP-02:** **`utcnow()` is `app.core.time.utcnow`** — already imported at `app/tasks/invite_tasks.py:9`. Uses tz-aware `datetime.now(UTC)` under the hood per SEC-04. No new time imports.

### Queueing Lock & Idempotency

- **D-LOCK-01:** **Preserve the existing `queueing_lock=f"invite-email:{invite.id}"`** (`app/services/invite.py:163`). Phase 113 does NOT introduce a new lock or split the lock per step.
- **D-LOCK-02:** **Idempotency guard is `if invite.zitadel_user_id is None`**, read INSIDE the task after `session.get(Invite, ...)`. A concurrent re-enqueue sees a non-null `zitadel_user_id` and skips `ensure_human_user`, going straight to email-send with the returning-user template. This satisfies PROV-04.
- **D-LOCK-03:** **Legacy-flow rows skip the provisioning block entirely.** If `invite.legacy_flow == True` (Phase 112 backfill), the task does NOT call `ensure_human_user` and sends the existing returning-user email (direct-accept URL). This is what makes MIG-02's "deploy does not couple to ZITADEL availability" real at runtime.

### Test Coverage

- **D-TEST-01:** **Required integration tests (PROV-05 / TEST-02):**
  1. ZITADEL-down: `_retry_on_5xx` exhausts → task raises → row has `status='failed'` and `error` set.
  2. ZITADEL-up first-time: `ensure_human_user.created=True` → new template key in mock; URL built via `create_invite_code`; row has `zitadel_user_id`, `status='provisioned'`, `provisioning_at` set.
  3. ZITADEL-up returning: `ensure_human_user.created=False` → existing template key; direct-accept URL; same row state.
  4. Mid-task crash reuse: task ran once to provision + crash before email-send; second run finds non-null `zitadel_user_id`, skips provisioning, sends email.
  5. Revoke-between-provision-and-email: provisioned successfully; invite revoked; retry — task's existing skip path bypasses send (no duplicate email). Note: no ZITADEL cleanup asserted (D-ROLE-03).
  6. Legacy-flow row: `legacy_flow=True` → task never calls `ensure_human_user`; sends returning-user email.
- **D-TEST-02:** **Required unit tests (TEST-01):** template selection logic from `(created, legacy_flow)` tuple; URL construction for first-time vs returning; `_auth_headers` reuse for `create_invite_code`; edge cases already covered by Phase 111's `ensure_human_user` / `create_invite_code` unit tests are NOT duplicated here.
- **D-TEST-03:** **ZITADEL mocking reuses the unittest.mock pattern** from Phase 111 (`unittest.mock.patch("httpx.AsyncClient")`), not `respx`/`pytest-httpx`. No new dev-deps.

### Claude's Discretion

- **Exact parameter name on `submit_campaign_invite_email`** (`first_time`, `is_new_user`, `invitee_is_new`, etc.) — planner picks at authoring time.
- **Template file layout** — if templates live in `app/templates/email/` or similar, planner reuses existing structure. If the codebase uses an inline Python-string template today, planner decides whether to extract or keep inline for the new template — consistency with existing is the rule.
- **Logging at the transitions** — `loguru` `info` on status transitions, `error` on exhaustion. Planner decides exact log fields (invite_id, zitadel_user_id-if-any, attempt-count from Phase 111's `_retry_on_5xx`).
- **Order of status-write vs. `ensure_human_user` call** — planner picks between (a) set `'provisioning'` → call → set `'provisioned'|'failed'` with a single flush at end, or (b) two flushes (one before, one after) to make the `'provisioning'` transient state durable. Default: (a) — one flush, `'provisioning'` only observable if the process dies between flush and call.

### Folded Todos

None — re-run `gsd-sdk query todo.match-phase 113` at plan-time to confirm.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (load first)
- `.planning/ROADMAP.md` §Phase 113 — success criteria 1–6
- `.planning/REQUIREMENTS.md` §PROV-04, §PROV-05, §EMAIL-01, §EMAIL-02, §EMAIL-03 — exact acceptance wording
- `.planning/REQUIREMENTS.md` §TEST-01, §TEST-02, §TEST-04 — test coverage contract

### Upstream Phase Context
- `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-CONTEXT.md` — `EnsureHumanUserResult(user_id, created)` shape, `create_invite_code(user_id, url_template) -> str` signature, `_retry_on_5xx` scope, `ZitadelUnavailableError` on exhaustion
- `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-01-PLAN.md` — Playwright spike proving exact `urlTemplate` deep-link shape
- `.planning/phases/112-schema-migration-legacy-invite-handling/112-CONTEXT.md` — `identity_provisioning_status` CHECK values, `legacy_flow` semantics, `zitadel_user_id` partial-unique-index constraint

### Research Pack
- `.planning/research/PITFALLS.md` — M1 (pre-created user logs in before accept), Z4 (user+grant+role atomicity — explicitly accepted this phase), O6 (naive-datetime, already prevented in Phase 112)
- `.planning/research/ARCHITECTURE.md` — invite email task integration points
- `.planning/research/SUMMARY.md` — Option B (init-code + urlTemplate) decision record, email branching rationale

### Existing Code the Phase Extends
- `app/tasks/invite_tasks.py` — `send_campaign_invite_email` task this phase modifies. `@procrastinate_app.task(name="send_campaign_invite_email", queue="communications")` decorator is preserved.
- `app/services/invite_email.py` — `submit_campaign_invite_email` gains branching. Preserve existing signature's keyword args; add one new.
- `app/services/email_types.py` — `TransactionalTemplateKey` enum gets `CAMPAIGN_MEMBER_INVITE_NEW_USER`.
- `app/services/email_templates.py` — add new template body/subject/plain-text variants.
- `app/services/email_provider.py` — `EmailProviderError` stays the existing failure contract.
- `app/services/email_delivery.py` — `create_attempt`, `apply_attempt_projection` — reuse as-is; template key threads through.
- `app/services/zitadel.py` — Phase 111 adds `ensure_human_user` and `create_invite_code`; this phase consumes them.
- `app/services/invite.py:163` — `queueing_lock` pattern to preserve.
- `app/core/time.py` `utcnow()` — sole tz-aware time source.
- `app/models/invite.py` — read-only here; Phase 112 already added the columns.
- `tests/integration/` — target directory for new integration tests (folder conventions per `.planning/codebase/TESTING.md`).

### Project Conventions
- `CLAUDE.md` — `uv` ops, ruff line 88, pytest asyncio_mode=auto
- `.planning/codebase/CONVENTIONS.md` — repo patterns
- `.planning/codebase/TESTING.md` — test layout (`tests/unit`, `tests/integration`)

### External Docs
- `https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode` — `urlTemplate` placeholder syntax (`{{.Code}}`, `{{.UserID}}`)
- Procrastinate retry docs (verify exact link during planning against pinned version in `pyproject.toml`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`send_campaign_invite_email` task skeleton** (`app/tasks/invite_tasks.py:23`) — already has session management, context setting, skip branches for accepted/revoked/expired/already-sent, `EmailProviderError` handling. Extend this shape; don't rewrite.
- **`create_attempt` + `apply_attempt_projection`** (`app/services/email_delivery.py`) — existing email-delivery telemetry projection. Threading a new template_key through is additive.
- **`utcnow()` from `app/core/time`** (line 9 of invite_tasks.py) — already imported; used for every new timestamp. SEC-04 clean.
- **`loguru.logger`** — already imported; use for status-transition info logs and exhaustion error logs.
- **Procrastinate `queueing_lock` pattern** (`app/services/invite.py:163`) — the task is already enqueued with this lock; nothing new needed to satisfy PROV-04's concurrency guard.

### Established Patterns
- **Session-per-task with `async_session_factory`** — task opens one session, does everything, commits once (with multiple flushes). Phase 113 keeps this — no new session.
- **Skip-branches early** — accepted/revoked/expired/already-sent all short-circuit before the work starts. Phase 113's provisioning block lives AFTER these branches and BEFORE the attempt creation.
- **`EmailProviderError` is caught-and-reraised** with `apply_attempt_projection` setting status='failed'. Phase 113 mirrors this for ZITADEL: catch `ZitadelUnavailableError`, project failure onto the invite row, reraise so Procrastinate retries.
- **Template keys flow through `TransactionalTemplateKey` enum** — additive: add a new enum member, don't break the existing one.

### Integration Points
- **Task → `ensure_human_user` → `create_invite_code`** — new call sequence inside the task, sandwiched between the expiry-skip branch and the attempt creation.
- **Task → `submit_campaign_invite_email`** — existing call point; gets a new kwarg.
- **`submit_campaign_invite_email` → template selection** — single branch point on the new boolean.
- **Integration tests → dev Postgres + mocked httpx** — existing `tests/integration/` conventions plus the Phase-111-inherited `unittest.mock.patch("httpx.AsyncClient")` pattern.

</code_context>

<specifics>
## Specific Ideas

- **`urlTemplate` string is built on the Python side BEFORE passing to ZITADEL** — i.e., we interpolate the invite token into the template's path segment (`/invites/<token>`), then ZITADEL substitutes `{{.Code}}` and `{{.UserID}}` server-side. This is the ONLY URL shape the Phase 111 spike validates (EMAIL-03 is locked to this shape).
- **No new retry / backoff config** — reuse `_retry_on_5xx` for ZITADEL 5xx, and Procrastinate's existing retry policy for the task as a whole.
- **Logging the ZITADEL user_id AFTER provisioning but NEVER the init code** — init codes are short-lived secrets that unlock password-set. Loguru logs never include them (scrub at the call site).
- **`'provisioning'` transient state is acceptable on dead tasks.** A follow-up stuck-state cleanup is NOT in scope (Phase 115's OBS work may surface this as a metric).

</specifics>

<deferred>
## Deferred Ideas

- **Moving role-grant into the email task for Z4 atomicity** — deferred. If orphaned-ZITADEL-user count grows (Phase 115 telemetry will make this visible), a later milestone can revisit.
- **Cleanup sweep for orphaned ZITADEL users** (`user_id` exists, `invite.expires_at < NOW()` and `accepted_at IS NULL`) — not this phase; candidate for a future ops hardening phase.
- **Pre-send re-check for revoke-between-provision-and-email race** — not added this phase because it complicates the task shape and the existing skip branches at task entry handle the common case.
- **Rate-limiting on the provisioning call path** (ZITADEL 50 req/s — research O1) — deferred per 111-CONTEXT.
- **A/B testing first-time vs returning template copy** — if marketing wants to iterate, the two-template split already enables it without code changes beyond content edits.
- **Funnel telemetry for the provisioning step** (`invite.provisioning.success|failed|skipped_legacy` event counts) — Phase 115's OBS-01/02 work.

</deferred>

---

*Phase: 113-provisioning-step-email-task-branched-content*
*Context gathered: 2026-04-23*
