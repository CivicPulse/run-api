# Pitfalls Research

**Domain:** Campaign-scoped volunteer self-signup and approval links
**Researched:** 2026-04-09
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Accidental pre-approval access

**What goes wrong:**
Applicants receive a `CampaignMember` row or ZITADEL role before staff approval and can see campaign data despite being “pending.”

**Why it happens:**
Teams try to reuse the old instant-join path or store approval as only a volunteer-status flag while membership already exists.

**How to avoid:**
Create a dedicated pending application state and defer membership plus role assignment until the approval transaction.

**Warning signs:**
Pending applicants appear in permission-gated campaign screens, or approval code only updates a status flag rather than creating access.

**Phase to address:**
Phase 1 or 2, before any public rollout.

---

### Pitfall 2: Link rotation that doesn’t actually revoke old links

**What goes wrong:**
“Regenerated” links still accept applications because the old token remains valid or shares the same public secret.

**Why it happens:**
Developers rotate display text or timestamps without invalidating the underlying token record.

**How to avoid:**
Use immutable link records with explicit active/inactive status, unique opaque tokens, and copied attribution on submit so deactivated links stay dead.

**Warning signs:**
No server-side notion of link state, or regeneration updates a row in place without invalidating previous tokens.

**Phase to address:**
Phase 1, alongside the signup-link data model.

---

### Pitfall 3: Duplicate people records for existing CivicPulse users

**What goes wrong:**
An existing user applies and ends up with a second account or a second volunteer identity disconnected from their real login.

**Why it happens:**
The public flow treats all applicants as brand-new identities and ignores existing auth/session or email matches.

**How to avoid:**
Add explicit existing-account reconciliation and keep account identity separate from campaign membership.

**Warning signs:**
Applications can be submitted with an email already tied to another CivicPulse user without any reconciliation path.

**Phase to address:**
Phase 2, before approval automation and admin review polish.

---

### Pitfall 4: Source attribution drift

**What goes wrong:**
Applicants show the wrong source after a link label is edited or a link is disabled/regenerated.

**Why it happens:**
The application stores only a foreign key to the live link row and reads the current link label later.

**How to avoid:**
Copy the source label/code onto the application at submission time and keep the link reference separately for audit.

**Warning signs:**
Historical applications change source labels when managers edit link metadata.

**Phase to address:**
Phase 1, in the schema and submit path.

---

### Pitfall 5: Public-link abuse overwhelms review queues

**What goes wrong:**
Spam or repeated submissions flood pending applications and bury legitimate volunteers.

**Why it happens:**
Public endpoints are shipped without rate limits, duplicate controls, or easy link deactivation.

**How to avoid:**
Apply rate limiting, duplicate submission checks, and manager-visible disable/regenerate controls from the start.

**Warning signs:**
Many pending applications from the same IP/email/link in a short window or no staff tooling to disable a hot link quickly.

**Phase to address:**
Phase 1 and Phase 3.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing the old `/join/{slug}/register` semantics under the hood | Faster initial coding | Leaves authorization and approval behavior ambiguous | Never for this milestone |
| Storing only “current link” attribution on campaign or volunteer | Minimal schema work | Loses per-link history and analytics usefulness | Never |
| Approving by directly mutating volunteer status without traceability | Less code | Harder support/debugging and no clean audit of who approved what | Only if approval metadata is captured elsewhere in the same transaction |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ZITADEL | Granting campaign role on application submit | Grant only on approval |
| Mailgun / notifications | Treating email delivery as proof of application state | Application and approval state must remain DB-authoritative |
| Existing auth/session | Forcing returning users through net-new account creation | Detect and reuse existing CivicPulse identity where possible |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed pending-application queue | Slow volunteer admin page loads | Index by `campaign_id`, `status`, `created_at` | Noticeable once a campaign has hundreds or thousands of applicants |
| Counting link uses by scanning application history each time | Slow link admin UI | Persist use counters or indexed aggregates, or query by indexed foreign key | Becomes painful when many links and applicants accumulate |
| Re-rendering public join forms off campaign slug alone | Extra lookups and ambiguous caching | Resolve dedicated link token first, then derive campaign context | As soon as multiple links exist per campaign |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Guessable or sequential public link codes | Unauthorized discovery and abuse | Use opaque high-entropy tokens |
| Leaving deactivated links functionally valid | Abuse continues after staff “rotation” | Enforce link status server-side on every lookup and submission |
| Exposing applicant review data to pending users | Privacy breach | No campaign membership or campaign-scoped role before approval |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Asking existing users to fill every field again | Friction and abandonment | Prefill or skip known identity fields and explain what still needs confirmation |
| No feedback after submitting an application | Applicants think the flow failed | Show a clear pending state and next-step message |
| Hiding source labels deep in admin UI | Staff cannot trust or use attribution | Show link label/source clearly in both link management and application review surfaces |

## "Looks Done But Isn't" Checklist

- [ ] **Managed links:** Disable/regenerate actually invalidates old public tokens.
- [ ] **Pending applications:** Pending applicants cannot access campaign routes or field mode.
- [ ] **Existing-account apply:** Existing CivicPulse users do not create duplicate identities.
- [ ] **Approval flow:** Approval creates both campaign membership and the right volunteer/access state.
- [ ] **Attribution:** Historical applications keep the source they originally came from even after link edits.
- [ ] **Abuse controls:** Public endpoints are rate-limited and staff can turn off a bad link quickly.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pre-approval access leak | HIGH | Revoke membership/roles, audit affected applicants, patch approval boundary, add regression tests |
| Old links still work after rotation | MEDIUM | Invalidate tokens in DB, notify staff, add status enforcement tests |
| Duplicate user/application identities | MEDIUM | Merge or relink records, backfill application-to-user references, add reconciliation checks |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Accidental pre-approval access | Phase 1/2 | Access tests prove pending applicants cannot reach campaign data |
| Link rotation not revoking old links | Phase 1 | Old token returns inactive/404 after rotation |
| Duplicate identities for existing users | Phase 2 | Existing-account apply test proves no duplicate account creation |
| Source attribution drift | Phase 1 | Historical applications retain original source after link edits |
| Public-link abuse flood | Phase 3 | Rate-limit and disable-link tests cover repeated submissions |

## Sources

- Existing codebase: `app/services/join.py`, `app/services/volunteer.py`, `app/api/v1/join.py`
- Existing implementation notes: `reports/volunteer-join-flow-backend.md`
- Slack Help Center — https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace
- Slack Help Center — https://slack.com/help/articles/115005912706-Manage-Slack-Connect-channel-approval-settings-and-invitation-requests
- Discord Support — https://support.discord.com/hc/en-us/articles/208866998-Invites-101
- Google for Developers — https://developers.google.com/identity/gsi/web/guides/personalized-button

---
*Pitfalls research for: campaign-scoped volunteer self-signup and approval links*
*Researched: 2026-04-09*
