# Roadmap: CivicPulse Run API

## Overview

v1.16 adds a transactional email foundation to CivicPulse Run without turning the product into a campaign-email platform or collapsing the boundary between app-owned mail and ZITADEL-owned auth mail. The milestone is organized as six phases that establish a provider seam with Mailgun first, add post-commit async delivery for existing invite flows, reconcile delivery truth through authenticated provider events, configure and document ZITADEL's separate email path, finish with deliverability and operational hardening, and then close the audit-identified invite-admin UI contract gap.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- ✅ **v1.3 Voter Model & Import Enhancement** — Phases 23-29 (shipped 2026-03-15)
- ✅ **v1.4 Volunteer Field Mode** — Phases 30-38 (shipped 2026-03-17)
- ✅ **v1.5 Go Live — Production Readiness** — Phases 39-48 (shipped 2026-03-25)
- ✅ **v1.6 Imports** — Phases 49-55 (shipped 2026-03-29)
- ✅ **v1.10 Import Recovery** — Phases 56-58 (shipped 2026-04-01)
- ✅ **v1.11 Faster Imports** — Phases 59-70 (shipped 2026-04-04)
- ✅ **v1.12 Hardening & Remediation** — Phases 71-77 (shipped 2026-04-05)
- ✅ **v1.13 Production Shakedown Remediation** — Phases 78-83 (shipped 2026-04-06)
- ✅ **v1.14 Voter Search & Lookup** — Phases 84-87 (shipped 2026-04-07)
- ✅ **v1.15 Twilio Communications** — Phases 88-94 (shipped 2026-04-08)
- 🔄 **v1.16 Email Delivery Foundation** — Phases 95-100

## Milestone History

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) — completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) — completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) — completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) — completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Local Dev & Deployment Readiness (Phases 8-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 8: Containerization (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Local Dev Environment (2/2 plans) — completed 2026-03-10
- [x] Phase 10: CI/CD Pipeline (1/1 plan) — completed 2026-03-10
- [x] Phase 11: Kubernetes & GitOps (2/2 plans) — completed 2026-03-10

See: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Full UI (Phases 12-22) — SHIPPED 2026-03-13</summary>

See: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Voter Model & Import Enhancement (Phases 23-29) — SHIPPED 2026-03-15</summary>

See: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Volunteer Field Mode (Phases 30-38) — SHIPPED 2026-03-17</summary>

See: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Go Live — Production Readiness (Phases 39-48) — SHIPPED 2026-03-25</summary>

See: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Imports (Phases 49-55) — SHIPPED 2026-03-29</summary>

See: `.planning/milestones/v1.6-ROADMAP.md`

</details>

<details>
<summary>✅ v1.10 Import Recovery (Phases 56-58) — SHIPPED 2026-04-01</summary>

- [x] Phase 56: Schema & Orphan Detection (1/1 plan) — completed 2026-04-01
- [x] Phase 57: Recovery Engine & Completion Hardening (1/1 plan) — completed 2026-04-01
- [x] Phase 58: Test Coverage (1/1 plan) — completed 2026-04-01

See: `.planning/milestones/v1.10-ROADMAP.md`

</details>

<details>
<summary>✅ v1.11 Faster Imports (Phases 59-70) — SHIPPED 2026-04-04</summary>

- [x] Phase 59: Chunk Schema & Configuration — completed 2026-04-03
- [x] Phase 60: Parent Split & Parallel Processing — completed 2026-04-03
- [x] Phase 61: Completion Aggregation & Error Merging — completed 2026-04-03
- [x] Phase 62: Resilience & Cancellation — completed 2026-04-03
- [x] Phase 63: Secondary Work Offloading — completed 2026-04-03
- [x] Phase 64: Frontend Throughput & Status UI — completed 2026-04-03
- [x] Phase 65: Chunk Planning & Concurrency Cap Closure — completed 2026-04-03
- [x] Phase 66: Import Wizard Flow Recovery & Progress Accuracy — completed 2026-04-03
- [x] Phase 67: Chunk Import Cleanup & Deletion Semantics — completed 2026-04-03
- [x] Phase 68: Progress Metric Accuracy & Validation Closeout — completed 2026-04-03
- [x] Phase 69: Queued Cancellation Finalization Closure — completed 2026-04-04
- [x] Phase 70: Reopened Import Restore Flow Closure — completed 2026-04-04

See: `.planning/milestones/v1.11-ROADMAP.md`

</details>

<details>
<summary>✅ v1.12 Hardening & Remediation (Phases 71-77) — SHIPPED 2026-04-05</summary>

- [x] Phase 71: Tenant Isolation — Service & Route Scoping (3/3 plans) — completed 2026-04-04
- [x] Phase 72: Row-Level Security Hardening (3/3 plans) — completed 2026-04-05
- [x] Phase 73: Frontend Auth Guards & OIDC Error Surfacing (6/6 plans) — completed 2026-04-05
- [x] Phase 74: Data Integrity & Concurrency (4/4 plans) — completed 2026-04-05
- [x] Phase 75: Reliability — Frontend State & PII Hygiene (4/4 plans) — completed 2026-04-05
- [x] Phase 76: Reliability — Backend Infrastructure (5/5 plans) — completed 2026-04-05
- [x] Phase 77: Quality, Accessibility & Test Coverage (5/5 plans) — completed 2026-04-05

See: `.planning/milestones/v1.12-ROADMAP.md`

</details>

<details>
<summary>✅ v1.13 Production Shakedown Remediation (Phases 78-83) — SHIPPED 2026-04-06</summary>

- [x] Phase 78: Tenant Isolation Containment (3/3 plans) — completed 2026-04-06
- [x] Phase 79: Error Handling and Edge Security (3/3 plans) — completed 2026-04-06
- [x] Phase 80: Workflow Recovery (3/3 plans) — completed 2026-04-05
- [x] Phase 81: Field, Accessibility, and Mobile Launch Readiness (3/3 plans) — completed 2026-04-06
- [x] Phase 82: Contract Drift, Validation, and Documentation Decisions (3/3 plans) — completed 2026-04-06
- [x] Phase 83: Reverification and Shakedown Cleanup (3/3 plans) — completed 2026-04-06

See: `.planning/milestones/v1.13-ROADMAP.md`

</details>

<details>
<summary>✅ v1.14 Voter Search & Lookup (Phases 84-87) — SHIPPED 2026-04-07</summary>

- [x] Phase 84: Search Contract & Composition — completed 2026-04-07
- [x] Phase 85: Campaign-Scoped Search Data & Freshness — completed 2026-04-07
- [x] Phase 86: Ranked Multi-Field Lookup — completed 2026-04-07
- [x] Phase 87: Search-First Voter Page UX — completed 2026-04-07

See: `.planning/milestones/v1.14-ROADMAP.md`

</details>

<details>
<summary>✅ v1.15 Twilio Communications (Phases 88-94) — SHIPPED 2026-04-08</summary>

- [x] Phase 88: Org Twilio Credentials & Encryption Foundation — completed 2026-04-07
- [x] Phase 89: Phone Number Inventory & Provisioning — completed 2026-04-07
- [x] Phase 90: Webhook Security & Routing Infrastructure — completed 2026-04-07
- [x] Phase 91: Browser Voice Calling — completed 2026-04-07
- [x] Phase 92: Two-Way SMS & Opt-Out Handling — completed 2026-04-07
- [x] Phase 93: Spend Controls & Communication Telemetry — completed 2026-04-08
- [x] Phase 94: Twilio Lookup Validation — completed 2026-04-08

See: `.planning/milestones/v1.15-ROADMAP.md`

</details>

## Current Milestone

### v1.16 Email Delivery Foundation

**Milestone Goal:** Add provider-agnostic transactional email delivery to CivicPulse Run with Mailgun as the first provider, wire existing invite flows onto a durable async send path, reconcile delivery truth through authenticated events, configure/document ZITADEL's separate auth-email path, and close the remaining invite-admin contract and visibility gaps surfaced by the milestone audit.

## Phases

- [x] **Phase 95: Provider Foundation & Secret Hygiene** - Establish the app-owned email provider seam, template ownership model, and secret-safe Mailgun configuration boundary. (completed 2026-04-08)
- [x] **Phase 96: Async Delivery Core & Invite Dispatch** - Make existing invite workflows queue real transactional emails only after durable writes, with stable public links and idempotent retries. (completed 2026-04-08)
- [x] **Phase 97: Webhook Reconciliation & Audit Truth** - Persist support-grade send history and reconcile Mailgun delivery outcomes through authenticated provider events. (completed 2026-04-08)
- [x] **Phase 98: ZITADEL Delivery Setup & Support Boundary** - Configure ZITADEL's auth/system email path separately and document the ownership split between CivicPulse mail and ZITADEL mail. (completed 2026-04-08)
- [x] **Phase 99: Deliverability Hardening & Operations** - Close production readiness with domain/DNS runbooks, monitoring, resend/remediation expectations, and app-vs-ZITADEL operational clarity. (completed 2026-04-08)
- [ ] **Phase 100: Invite Delivery Visibility UI Closure** - Align the pending-invite frontend with the backend contract and surface support-facing delivery outcome details in the admin UI.

## Phase Details

### Phase 95: Provider Foundation & Secret Hygiene
**Goal**: CivicPulse has a reusable, provider-agnostic foundation for app-owned transactional email, with Mailgun configured as the first implementation and no secret leakage across API, logs, or UI.
**Depends on**: Phase 94
**Requirements**: EML-01, EML-02, EML-03, SEC-01
**Success Criteria** (what must be TRUE):
  1. The backend can build a typed app-owned transactional email request through an internal provider seam with Mailgun selected by configuration rather than hard-coded invite logic.
  2. Supported transactional templates render from CivicPulse-owned code as both HTML and plain text without depending on provider-hosted templates.
  3. Operators can configure sender identity, Mailgun domain, region, and credentials per environment without those secrets being echoed back through API responses, logs, or frontend state.
  4. Provider payload construction remains single-recipient and tenant-scoped so no org or campaign data is co-mingled across sends.
**Plans**: TBD

### Phase 96: Async Delivery Core & Invite Dispatch
**Goal**: Existing invite flows create durable domain state first and then dispatch real transactional email through an idempotent background delivery path.
**Depends on**: Phase 95
**Requirements**: EML-04, INV-01, INV-02, INV-03, INV-04
**Success Criteria** (what must be TRUE):
  1. Creating a campaign member invite sends a real transactional email to the invitee without blocking the request on provider latency.
  2. Existing volunteer and staff invitation flows that promise an email invite use the same transactional email path instead of a stub or manual follow-up.
  3. Invite emails clearly tell recipients who invited them, what org or campaign they are joining, what access they will receive, and when the invite expires.
  4. Invite links land on the configured public acceptance/auth flow, and expired, revoked, or already-accepted invites do not keep sending misleading emails.
  5. Retries or resends do not create duplicate invite state or send before the underlying invite write is durable.
**Plans**: TBD
**UI hint**: yes

### Phase 97: Webhook Reconciliation & Audit Truth
**Goal**: CivicPulse has truthful, tenant-safe delivery history for transactional email, including authenticated webhook reconciliation and support-grade outcome visibility.
**Depends on**: Phase 96
**Requirements**: AUD-01, AUD-02, AUD-03, AUD-04, SEC-02
**Success Criteria** (what must be TRUE):
  1. Each transactional email send attempt persists tenant context, template key, recipient, provider identity, timestamps, and provider message identity for later reconciliation.
  2. Mailgun delivery updates are accepted only from authenticated provider events and move message state beyond submission into outcomes such as delivered, failed, bounced, complained, or suppressed.
  3. Delivery history remains unambiguous when the same recipient address is invited by multiple organizations or campaigns because reconciliation does not rely on email address alone.
  4. Staff can inspect the latest invite-email outcome and failure reason well enough to support resend or remediation workflows.
**Plans**: TBD
**UI hint**: yes

### Phase 98: ZITADEL Delivery Setup & Support Boundary
**Goal**: ZITADEL can send its own auth and system email through a production-ready provider path, and operators have a clear runbook for what the app owns versus what ZITADEL owns.
**Depends on**: Phase 95
**Requirements**: ZIT-01, ZIT-02
**Success Criteria** (what must be TRUE):
  1. ZITADEL is configured to send password reset, verification, and other auth/system emails through Mailgun SMTP or an equivalent documented SMTP path without routing those messages through CivicPulse runtime code.
  2. Operators have a runbook covering required sender/domain alignment, secrets, provisioning prerequisites, and smoke tests for ZITADEL-owned email flows.
  3. Support can distinguish whether an email issue belongs to CivicPulse transactional invite delivery or ZITADEL auth/system delivery.
**Plans**: TBD

### Phase 99: Deliverability Hardening & Operations
**Goal**: The transactional email foundation is production-ready, with deliverability prerequisites, monitoring, retry expectations, and operational procedures that separate CivicPulse invite mail from ZITADEL auth mail.
**Depends on**: Phase 97, Phase 98
**Requirements**: OPS-01
**Success Criteria** (what must be TRUE):
  1. Operators have a documented Mailgun domain and DNS setup, including sender identity, SPF, DKIM, DMARC, and region-aware environment configuration.
  2. Monitoring and operational checks distinguish CivicPulse invite mail from ZITADEL auth/system mail so incidents route to the correct system boundary.
  3. Retry, replay, resend, and failure-remediation expectations are documented well enough for operators to recover from transient provider or configuration issues.
  4. Production readiness does not expand into campaign-authored email, bulk email, or analytics-driven email scope.
**Plans**: TBD

### Phase 100: Invite Delivery Visibility UI Closure
**Goal**: The admin pending-invites surface consumes the current invite API contract correctly and exposes support-grade delivery outcome details so the milestone's invite workflows work end to end in the product UI.
**Depends on**: Phase 97, Phase 99
**Requirements**: AUD-04
**Gap Closure**: Closes gaps from `.planning/v1.16-MILESTONE-AUDIT.md`
**Success Criteria** (what must be TRUE):
  1. The pending-invites UI renders records from the current backend response shape instead of assuming a paginated `items` wrapper.
  2. The frontend invite contract includes the latest delivery error and last-event timestamp fields exposed by the backend schema.
  3. Staff can inspect the latest invite-email outcome and failure reason directly in the campaign members settings UI well enough to support resend or remediation workflows.
  4. The admin pending-invite review flow works again end to end after phases 96 and 97, without regressing the public invite acceptance path.
**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 95. Provider Foundation & Secret Hygiene | 2/2 | Complete   | 2026-04-08 |
| 96. Async Delivery Core & Invite Dispatch | 1/1 | Complete   | 2026-04-08 |
| 97. Webhook Reconciliation & Audit Truth | 1/1 | Complete   | 2026-04-08 |
| 98. ZITADEL Delivery Setup & Support Boundary | 1/1 | Complete   | 2026-04-08 |
| 99. Deliverability Hardening & Operations | 1/1 | Complete   | 2026-04-08 |
| 100. Invite Delivery Visibility UI Closure | 0/0 | Pending    | - |

## Coverage

| Requirement | Phase |
|-------------|-------|
| EML-01 | 95 |
| EML-02 | 95 |
| EML-03 | 95 |
| SEC-01 | 95 |
| EML-04 | 96 |
| INV-01 | 96 |
| INV-02 | 96 |
| INV-03 | 96 |
| INV-04 | 96 |
| AUD-01 | 97 |
| AUD-02 | 97 |
| AUD-03 | 97 |
| AUD-04 | 100 |
| SEC-02 | 97 |
| ZIT-01 | 98 |
| ZIT-02 | 98 |
| OPS-01 | 99 |

**Coverage status:** 17/17 v1.16 requirements mapped with no gaps and no duplicate phase ownership.
