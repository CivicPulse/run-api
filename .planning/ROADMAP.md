# Roadmap: CivicPulse Run API

## Overview

Most recently shipped: v1.16 Email Delivery Foundation on 2026-04-08. CivicPulse Run now has app-owned transactional email for invite workflows, authenticated delivery reconciliation, and documented separation between CivicPulse invite mail and ZITADEL auth/system mail. The next milestone has not been defined yet.

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
- ✅ **v1.16 Email Delivery Foundation** — Phases 95-100 (shipped 2026-04-08)

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

<details>
<summary>✅ v1.16 Email Delivery Foundation (Phases 95-100) — SHIPPED 2026-04-08</summary>

See: `.planning/milestones/v1.16-ROADMAP.md`

</details>
