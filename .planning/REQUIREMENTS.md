# Requirements: CivicPulse Run API

**Defined:** 2026-04-09
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## Milestone v1.17 Requirements

### Signup Links

- [ ] **LINK-01**: Campaign admins can create multiple volunteer signup links for a campaign, each with a staff-defined label or source name.
- [ ] **LINK-02**: Campaign admins can list all volunteer signup links for a campaign with current status and attribution label.
- [ ] **LINK-03**: Campaign admins can disable a volunteer signup link so new applications can no longer be started from it.
- [ ] **LINK-04**: Campaign admins can regenerate a volunteer signup link so the previous public URL stops working and a new URL can be shared.
- [ ] **LINK-05**: Public visitors opening a valid volunteer signup link can see safe campaign context before submitting an application.

### Applications

- [ ] **APPL-01**: Public visitors can submit a volunteer application through a valid campaign signup link without receiving campaign access immediately.
- [ ] **APPL-02**: Each volunteer application stores the originating signup link so campaign staff can see how the applicant found the campaign.
- [ ] **APPL-03**: The system prevents duplicate pending applications when the same person applies repeatedly to the same campaign.
- [ ] **APPL-04**: An existing authenticated CivicPulse user who is not already a member of the campaign can apply through the same flow without creating a second account.
- [ ] **APPL-05**: Existing authenticated CivicPulse users see their known profile information prefilled or reused so they do not need to re-enter unchanged details.

### Review and Approval

- [ ] **REVW-01**: Campaign admins can view a queue of pending volunteer applications for their campaign.
- [ ] **REVW-02**: Campaign admins can review each application with applicant details, source-link attribution, and duplicate or existing-account context.
- [ ] **REVW-03**: Campaign admins can approve a pending volunteer application.
- [ ] **REVW-04**: Campaign admins can reject a pending volunteer application without granting campaign access.
- [ ] **REVW-05**: Approving an application creates the applicant’s campaign membership and volunteer access only once approval succeeds.
- [ ] **REVW-06**: Applicants in pending or rejected states cannot access campaign data or volunteer-only flows for that campaign.

### Safeguards

- [ ] **SAFE-01**: Disabled, regenerated, expired, or otherwise invalid volunteer signup links fail closed and cannot be used to submit new applications.
- [ ] **SAFE-02**: Public volunteer signup endpoints enforce abuse-resistant behavior with appropriate rate limiting and safe error responses.
- [ ] **SAFE-03**: The approval workflow handles existing members, existing applicants, and approval retries without creating duplicate campaign access records.

## Future Requirements

### Notifications

- **NOTF-01**: Applicants receive a confirmation email after submitting an application.
- **NOTF-02**: Applicants receive an email when their application is approved or rejected.

### Link Analytics

- **ANLT-01**: Campaign admins can see aggregate application counts per signup link.
- **ANLT-02**: Campaign admins can compare conversion trends across volunteer signup links over time.

### Application Customization

- **FORM-01**: Campaign admins can configure link-specific screening questions.
- **FORM-02**: Campaign admins can configure expiration or usage limits per signup link.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic approval for public applicants | Explicitly conflicts with the required pending-review gate |
| Full referral analytics suite | Broader campaign analytics scope than this milestone needs |
| Link-specific custom forms in v1.17 | Adds schema and moderation complexity before the core flow is validated |
| Org-scoped volunteer signup links | User specified campaign-scoped links for this milestone |
| Replacing private member invites with public volunteer links | Private invites and public moderated applications serve different trust models |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LINK-01 | Phase 101 | Pending |
| LINK-02 | Phase 101 | Pending |
| LINK-03 | Phase 101 | Pending |
| LINK-04 | Phase 101 | Pending |
| LINK-05 | Phase 101 | Pending |
| APPL-01 | Phase 102 | Pending |
| APPL-02 | Phase 102 | Pending |
| APPL-03 | Phase 102 | Pending |
| APPL-04 | Phase 102 | Pending |
| APPL-05 | Phase 102 | Pending |
| REVW-01 | Phase 103 | Pending |
| REVW-02 | Phase 103 | Pending |
| REVW-03 | Phase 103 | Pending |
| REVW-04 | Phase 103 | Pending |
| REVW-05 | Phase 103 | Pending |
| REVW-06 | Phase 103 | Pending |
| SAFE-01 | Phase 101 | Pending |
| SAFE-02 | Phase 102 | Pending |
| SAFE-03 | Phase 103 | Pending |

**Coverage:**
- Milestone requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation*
