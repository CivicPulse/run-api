# Pitfalls Research

**Domain:** Campaign volunteer signup links with pending approval
**Researched:** 2026-04-09
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Public Links Grant More Than Application Access

**What goes wrong:**
The public link accidentally creates campaign membership, exposes campaign details, or lets an applicant see protected data before approval.

**Why it happens:**
Teams try to reuse trusted invite/member flows for untrusted public traffic.

**How to avoid:**
Create a separate public application flow with explicit pending state and a hard approval transition before any membership or role activation.

**Warning signs:**
Public endpoints touch membership tables directly, or application submission returns an authenticated campaign context.

**Phase to address:**
Phase 101 foundation and data model.

---

### Pitfall 2: Duplicate Identity and Fragmented Applicant Records

**What goes wrong:**
Existing CivicPulse users create second accounts or multiple pending records for the same campaign, making approval and support messy.

**Why it happens:**
The signup flow is built as “always create a user” rather than “resolve identity first, then apply”.

**How to avoid:**
Design an explicit existing-account path, dedupe on campaign + user/email where appropriate, and treat account creation as an approval-side effect for new applicants.

**Warning signs:**
Multiple users share the same email, or approvers see repeated pending applications with slightly different profile data.

**Phase to address:**
Phase 102 public application and identity flow.

---

### Pitfall 3: Link Rotation Breaks Attribution History

**What goes wrong:**
Regenerated or disabled links destroy the source context for already-submitted applications.

**Why it happens:**
Attribution is read live from the current link record instead of copied onto the application at submission time.

**How to avoid:**
Persist link label/source snapshot on the application record when submitted, separate from the mutable current link configuration.

**Warning signs:**
Historic applications change source labels when a link is renamed or rotated.

**Phase to address:**
Phase 101 foundation and data model.

---

### Pitfall 4: Public Account-Existence Leakage

**What goes wrong:**
The flow reveals whether a given email already belongs to a CivicPulse user, enabling enumeration or privacy leaks.

**Why it happens:**
Existing-account convenience is implemented with explicit “email exists / does not exist” public responses.

**How to avoid:**
Use neutral status messaging, authenticated continuation where possible, and server-side account resolution that does not disclose existence to anonymous users.

**Warning signs:**
Different error or success messages appear for known vs unknown emails before authentication.

**Phase to address:**
Phase 102 public application and identity flow.

---

### Pitfall 5: Approval UI Without Operational Guardrails

**What goes wrong:**
Staff cannot tell which applications are pending, which link/source they came from, or whether a link is currently disabled, so manual review becomes error-prone.

**Why it happens:**
The public flow is built first and the review surface is treated as a thin afterthought.

**How to avoid:**
Treat admin review and link management as first-class milestone outputs with explicit status, attribution, and audit fields.

**Warning signs:**
Approvers need to inspect raw DB rows or external notes to make decisions.

**Phase to address:**
Phase 103 admin review and activation.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single boolean `is_active` without explicit application status | Faster initial schema | Approval/rejection/withdrawal logic becomes ambiguous | Never for this milestone |
| Reusing current invite tables for public links | Less schema work | Trusted and untrusted flows become entangled | Rarely; only if schema cleanly supports a separate subtype, which is unlikely |
| Storing only current link ID on application | Less duplication | Historical attribution breaks after rename/rotation | Never if attribution matters |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ZITADEL | Creating identities too early in the public flow | Delay new-account creation until approval, and reuse existing identities safely |
| Mailgun | Making confirmation emails part of the success path | Keep notifications post-commit and non-blocking |
| Campaign membership | Approving by mutating application state only | Approval should also create or activate the actual campaign membership atomically |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed pending-review queries | Slow admin review lists by campaign/status | Index on campaign, status, created_at | Breaks once campaigns accumulate thousands of applications |
| Computing link analytics from raw joins every page load | Laggy management UI | Start with simple counts or paginated history; snapshot attribution on write | Breaks once many links/applications share a campaign |
| Synchronous email/notification work on submit | Slow or flaky public submission | Queue notifications after commit | Breaks under bursty signups or provider hiccups |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Predictable public link identifiers | Abuse, scraping, link harvesting | Use opaque high-entropy tokens and server-side lookup |
| Public endpoints returning campaign-sensitive metadata | Tenant data leakage | Return only safe public-facing campaign/link information |
| Approval endpoints missing strict campaign-role checks | Unauthorized membership changes | Reuse existing role gating and campaign-scoped authorization checks |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Asking existing users to fill every field again | Frustration, duplicate data, abandonment | Prefill known data where safe and ask only for missing campaign-specific fields |
| Ambiguous pending status after submit | Applicants think they are already approved or that submission failed | Show a clear neutral confirmation that review is pending |
| Hidden link-management state | Staff share disabled or rotated links by mistake | Surface status, label, and last-changed state prominently in admin UI |

## "Looks Done But Isn't" Checklist

- [ ] **Public signup link:** Often missing disable/rotate behavior — verify compromised links can be contained without data loss.
- [ ] **Pending application flow:** Often missing rejection or duplicate handling — verify repeat submissions are deterministic.
- [ ] **Existing-account path:** Often missing privacy-safe messaging — verify anonymous users cannot enumerate accounts.
- [ ] **Approval flow:** Often missing atomic membership activation — verify approved applicants gain access exactly once.
- [ ] **Attribution:** Often missing immutable source snapshot — verify historic applications keep original source after link edits.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Public link leaked or abused | MEDIUM | Disable link, regenerate replacement, retain old link history, review recent submissions |
| Duplicate accounts created | HIGH | Merge or manually reconcile identities, then add dedupe guardrails and regression tests |
| Wrong applicants approved into campaign | HIGH | Revoke campaign membership, audit access, and inspect approval authorization logs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Public links grant too much access | Phase 101 | Public flow tests prove no campaign membership/access before approval |
| Duplicate identity / fragmented applications | Phase 102 | Tests cover existing-user, new-user, and duplicate apply scenarios |
| Link rotation breaks attribution | Phase 101 | Rename/rotate link and verify historic applications keep original source snapshot |
| Account-existence leakage | Phase 102 | Manual and automated checks confirm neutral responses for known/unknown identities |
| Weak admin review ergonomics | Phase 103 | Reviewers can approve/reject with visible status, source, and audit fields |

## Sources

- `.planning/PROJECT.md` and `.planning/STATE.md` — existing architecture and milestone context
- Internal product-risk analysis based on the requested workflow and current CivicPulse trust boundaries

---
*Pitfalls research for: campaign volunteer signup links with pending approval*
*Researched: 2026-04-09*
