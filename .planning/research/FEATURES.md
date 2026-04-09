# Feature Research

**Domain:** Campaign-scoped volunteer self-signup and approval links
**Researched:** 2026-04-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multiple signup links per campaign | Staff want different links for QR flyers, website buttons, organizers, or events | MEDIUM | Links need labels/source metadata and campaign ownership. |
| Per-link lifecycle controls | Official invite systems commonly allow expiration, disable/deactivate, renewal, or replacement | MEDIUM | Disable/regenerate is core to abuse response; expiration and max uses are natural controls. |
| Pending application queue before access | Staff need approval control before a volunteer sees campaign data or tools | MEDIUM | Application and membership must be separate states. |
| Existing-account apply path | Returning users expect recognition instead of duplicate signup friction | MEDIUM | Known account data should be reused and linked to the pending application. |
| Staff review with approve/reject actions | Pending state is incomplete without explicit review operations | MEDIUM | Approval should create membership/role; rejection should preserve auditability. |
| Attribution of how the applicant found the campaign | The user explicitly wants to track share channel performance | LOW | Best handled as immutable link metadata copied onto the application at submit time. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Link-level reporting inside volunteer operations | Lets campaigns see which outreach channels actually drive approved volunteers | LOW | Strong fit for CivicPulse because campaign organizing depends on measurable field recruitment. |
| Seamless existing-user application flow | Reduces friction for volunteers already using CivicPulse elsewhere | MEDIUM | A practical differentiator because CivicPulse is multi-campaign and multi-tenant. |
| Approval-gated access with no pre-approval visibility | Preserves trust and campaign privacy while still enabling public recruiting | MEDIUM | Stronger operational safety than the current immediate-join model. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Open join with instant campaign access | Feels “easy” and reduces one step | Conflicts with approval requirement and increases abuse/visibility risk | Keep public application easy, but gate campaign membership until approval |
| Unlimited shared link with no controls | Simplest possible sharing model | No attribution, no abuse response, no rotation story | Support multiple managed links with disable/regenerate and optional expiry/usage caps |
| Separate account per campaign application | Seems simpler to implement than account reconciliation | Creates duplicate identities and poor UX for existing CivicPulse users | Bind the application to an existing user when one already exists |

## Feature Dependencies

```
[Per-link attribution]
    └──requires──> [Managed signup link records]

[Pending application queue]
    └──requires──> [Application model distinct from membership]
                       └──requires──> [Approval / rejection actions]

[Existing-account apply flow]
    └──requires──> [Identity reconciliation at apply time]
                       └──requires──> [Approval path that creates membership later]

[Notifications]
    └──enhances──> [Pending application queue]

[Immediate campaign access] ──conflicts──> [Approval-gated membership]
```

### Dependency Notes

- **Per-link attribution requires managed signup link records:** attribution cannot come from a bare campaign slug because multiple sources must coexist.
- **Pending application queue requires a model distinct from membership:** otherwise a “pending” applicant already exists as a campaign member, which conflicts with the privacy goal.
- **Existing-account apply flow requires identity reconciliation:** the system must detect whether the applicant is already known and avoid duplicate account creation.
- **Notifications enhance the queue:** confirmation and approval emails are valuable but not mandatory for the first milestone if core flow is solid.
- **Immediate campaign access conflicts with approval-gated membership:** these two product models are mutually exclusive.

## MVP Definition

### Launch With (v1)

- [ ] Managed campaign-scoped signup links with labels/source attribution
- [ ] Public apply flow for new and existing CivicPulse users
- [ ] Pending volunteer application records separate from campaign membership
- [ ] Staff queue to review, approve, and reject applications
- [ ] Link disable/regenerate controls for abuse response
- [ ] Approval that creates campaign membership and grants access only then

### Add After Validation (v1.x)

- [ ] Optional per-link expiration and max-use limits — add when campaigns want tighter event or QR controls
- [ ] Email confirmations for applicant submitted/approved/rejected states — add if support load shows applicants need stronger feedback
- [ ] Link-level funnel reporting (submitted vs approved vs rejected) — add when campaigns want recruitment analytics beyond source labels

### Future Consideration (v2+)

- [ ] Fully customizable public volunteer forms per campaign — defer until the base approval workflow proves stable
- [ ] Automated approval rules — defer until campaigns show repeated, low-risk approval criteria
- [ ] Cross-campaign volunteer profile reuse controls beyond account reuse — valuable later but not required for this milestone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Managed signup links | HIGH | MEDIUM | P1 |
| Pending application workflow | HIGH | MEDIUM | P1 |
| Approval/rejection actions | HIGH | MEDIUM | P1 |
| Existing-account apply flow | HIGH | MEDIUM | P1 |
| Link disable/regenerate | HIGH | MEDIUM | P1 |
| Optional expiration/max uses | MEDIUM | LOW/MEDIUM | P2 |
| Applicant/manager notifications | MEDIUM | MEDIUM | P2 |
| Link-level conversion analytics | MEDIUM | LOW | P2 |

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Link lifecycle controls | Slack invite links can be viewed, renewed, and deactivated | Discord invites can have expiry, usage caps, and be removed | Campaign managers get multiple managed signup links with disable/regenerate as baseline |
| Pending review | Slack pending invitations can be extended or deleted before acceptance | Slack Connect supports approval and denial flows for pending requests | Campaign managers review volunteer applications before membership exists |
| Returning-user path | Google identity surfaces returning accounts to reduce repeated signup friction | N/A | Reuse existing CivicPulse accounts during apply instead of creating duplicates |

## Sources

- Existing codebase and `reports/volunteer-join-flow-backend.md` — current baseline and current gap: immediate volunteer registration through `/join/{slug}/register`.
- Slack Help Center — https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace
- Slack Help Center — https://slack.com/help/articles/115005912706-Manage-Slack-Connect-channel-approval-settings-and-invitation-requests
- Discord Support — https://support.discord.com/hc/en-us/articles/208866998-Invites-101
- Google for Developers — https://developers.google.com/identity/gsi/web/guides/personalized-button

---
*Feature research for: campaign-scoped volunteer self-signup and approval links*
*Researched: 2026-04-09*
