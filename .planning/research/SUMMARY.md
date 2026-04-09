# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** Campaign volunteer self-signup, pending approval, and link attribution
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

This milestone fits the existing CivicPulse platform cleanly. The recommended approach is to keep everything inside the current FastAPI, PostgreSQL, ZITADEL, and React architecture rather than introducing a separate signup system. Public campaign-scoped volunteer links should resolve into mutable link records, submissions should create pending volunteer applications, and staff approval should be the only transition that creates or activates campaign membership.

The main risk is collapsing trusted invite flows and untrusted public signup traffic into the same path. That would blur approval boundaries, leak identity state, and make abuse containment difficult. The safer pattern is a separate volunteer-application domain model with explicit status transitions, immutable attribution snapshots, and a privacy-safe existing-account flow.

## Key Findings

### Recommended Stack

The existing stack is sufficient. FastAPI and SQLAlchemy should own public link resolution, pending application persistence, and approval orchestration. PostgreSQL with RLS remains the right place for campaign-scoped links and application records. React plus TanStack Router/Query should power both the public apply route and the admin review/link-management surfaces. ZITADEL should remain the system of record for identity.

**Core technologies:**
- FastAPI + SQLAlchemy async: public signup and approval services without adding a new backend seam.
- PostgreSQL + RLS: campaign-scoped links, pending applications, and approval audit state.
- React + TanStack Router/Query: public application experience plus admin link/review workflows.
- ZITADEL: centralized identity without duplicate account creation.

### Expected Features

The research points to a focused MVP: multiple campaign-scoped signup links, pending application review, existing-account apply flow, and per-link attribution carried into staff review. Optional controls like expiration windows or usage caps are reasonable extensions, but instant public access and a single global signup link model should stay out of scope.

**Must have (table stakes):**
- Campaign-scoped public signup links with independent labels and controls.
- Pending volunteer applications with explicit approve/reject flow before access.
- Existing-account apply path without duplicate account creation.
- Source attribution from link to application.

**Should have (competitive):**
- Per-link operational controls such as disable/regenerate and possibly expiration or cap.
- Admin review context that shows source and link state directly.

**Defer (v2+):**
- Org-wide signup programs spanning campaigns.
- Rich analytics/reporting beyond basic attribution visibility.

### Architecture Approach

The milestone should be built in four steps: link foundation and data model, public application and identity-resolution flow, admin review and approval management, then operational controls and polish. New components should include durable signup-link and volunteer-application records plus public/admin endpoints. Modified components should include membership activation, volunteer-management UI, and optional transactional email notifications.

**Major components:**
1. Link management foundation — mutable public links, status, labeling, and attribution metadata.
2. Volunteer application service — public submission, pending status, dedupe, and existing-account resolution.
3. Approval and admin review flow — staff review, approve/reject, and campaign membership activation.
4. Operational controls and polish — management UX, optional notifications, and abuse-response hardening.

### Critical Pitfalls

1. **Public links grant more than application access** — keep public signup separate from trusted invite/member flows.
2. **Duplicate identity and fragmented applicant records** — resolve existing identities before creating campaign membership.
3. **Link rotation breaks attribution history** — snapshot attribution on submission, not by reading the live link later.
4. **Public account-existence leakage** — keep public responses neutral and identity resolution server-side.
5. **Approval UI without operational guardrails** — treat admin review and link management as first-class milestone outputs.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Link Foundation and Data Model
**Rationale:** Mutable public links, pending-application records, and attribution snapshots are prerequisites for every other behavior.
**Delivers:** Campaign-scoped link schema, public token validation, and core persistence contracts.
**Addresses:** Labeled links, per-link controls, attribution capture.
**Avoids:** Leaky public access and broken attribution after rotation.

### Phase 2: Public Application and Identity Flow
**Rationale:** Once the data model exists, the milestone needs the actual applicant-facing path and dedupe-safe account handling.
**Delivers:** Public apply UI/API, pending application creation, and existing-account apply logic.
**Uses:** Existing FastAPI, PostgreSQL, React, and ZITADEL stack.
**Implements:** Public application component and approval-gated state machine.

### Phase 3: Admin Review and Activation
**Rationale:** Approval is the business-critical trust boundary and should be implemented after pending records behave correctly.
**Delivers:** Staff review queue, approve/reject actions, and membership activation on approval.

### Phase 4: Operational Controls and Polish
**Rationale:** After the core flow works, tighten the management surface, notifications, and abuse-response ergonomics.
**Delivers:** Link-management UX, optional notification hooks, and verification hardening.

### Phase Ordering Rationale

- Link foundation must precede public submission because attribution and rotation rules belong in the persistence model.
- Public application must precede admin review because staff need real pending records to act on.
- Approval activation should stay distinct from submission to preserve the required trust boundary.
- Operational polish comes last so early phases can lock down correctness before optimization.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Identity-resolution details around existing-account apply flow and privacy-safe UX.
- **Phase 4:** Whether expiration windows, usage caps, or notifications belong in milestone scope or should remain stretch goals.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Standard relational modeling, opaque token management, and campaign-scoped API patterns fit existing conventions.
- **Phase 3:** Approval queue and role-gated admin actions fit existing admin workflow patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack clearly supports the milestone without new infrastructure. |
| Features | HIGH | User goals are clear and align with standard volunteer-acquisition patterns. |
| Architecture | HIGH | Integration points are clear within the existing stack. |
| Pitfalls | HIGH | The main risks are evident from the trust boundary and existing identity model. |

**Overall confidence:** HIGH

### Gaps to Address

- Existing-account apply UX: decide the exact applicant experience that avoids account enumeration while keeping friction low.
- Optional per-link controls: decide whether expiration, caps, or additional abuse controls are committed scope or stretch scope.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — existing product capabilities, constraints, and validated architecture
- `.planning/STATE.md` — current milestone context and prior decisions relevant to identity, membership, and invite delivery

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---
*Research completed: 2026-04-09*
*Ready for roadmap: yes*
