# Phase 43: Organization UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 43-organization-ui
**Areas discussed:** Org dashboard layout, Multi-org switching, Campaign creation wizard, Member management & settings

---

## Org Dashboard Layout

### Home page relationship

| Option | Description | Selected |
|--------|-------------|----------|
| Replace / with org dashboard | Authenticated users land on org dashboard at / showing org-scoped campaign cards. Simpler navigation. | ✓ |
| Separate /org route | Keep / as flat campaign list, add /org as new top-level route with org admin features. | |
| Conditional home page | / shows org dashboard for org_admin+, campaign list for regular members. | |

**User's choice:** Replace / with org dashboard
**Notes:** Recommended option — simpler navigation, one home page not two.

### Campaign card content

| Option | Description | Selected |
|--------|-------------|----------|
| Status + election date + member count | Badge for active/archived, election date, total member count. Matches ORG-05. | ✓ |
| Add activity summary | Above plus last-activity and recent voter/contact counts. Requires new aggregation. | |
| Minimal — name + status only | Just name and status badge. Fastest, least informative. | |

**User's choice:** Status + election date + member count
**Notes:** Matches ORG-05 requirements exactly.

### Archived campaigns display

| Option | Description | Selected |
|--------|-------------|----------|
| Separate section below active | Active in main grid, collapsed 'Archived' section below. | ✓ |
| Same grid with visual dimming | All campaigns in one grid, archived greyed/faded. | |
| Hidden behind toggle/tab | Only active shown, toggle reveals archived. | |

**User's choice:** Separate section below active
**Notes:** Clear visual separation preferred.

### Stats summary bar

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — campaign count + member count | Simple bar: "N active campaigns · M members". | ✓ |
| No stats bar | Jump straight to grid. | |
| Yes — richer stats | More metrics, requires new aggregation endpoint. | |

**User's choice:** Yes — campaign count + member count
**Notes:** Data available from existing endpoints, no new backend work.

---

## Multi-Org Switching

### Switcher location

| Option | Description | Selected |
|--------|-------------|----------|
| Header bar, top-right near avatar | Dropdown showing current org name + chevron. Always visible. GitHub-like. | ✓ |
| Sidebar header | Org name + switcher at top of sidebar. Only visible when sidebar open. | |
| Dedicated /orgs page | Page listing all orgs, click to select. No persistent switcher. | |

**User's choice:** Header bar, top-right near user avatar
**Notes:** Always accessible, not buried in navigation.

### Switch behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate to org dashboard (/) | Switching redirects to / showing new org's campaigns. Clean reset. | ✓ |
| Stay on current page type | Smart page matching across orgs. Complex. | |
| Full re-auth via ZITADEL | Trigger ZITADEL org switch. Most correct per D-11 but visible redirect. | |

**User's choice:** Navigate to org dashboard (/)
**Notes:** Clean reset, no stale campaign context.

### Re-auth handling

| Option | Description | Selected |
|--------|-------------|----------|
| Silent re-auth with loading state | signinRedirect with org hint. Brief spinner during redirect/callback. | ✓ |
| Explicit interstitial | Full-page "Switching org..." message. More transparent but heavier. | |
| You decide | Let Claude pick during implementation. | |

**User's choice:** Silent re-auth with loading state
**Notes:** Click org → brief spinner → new org dashboard.

---

## Campaign Creation Wizard

### Wizard steps

| Option | Description | Selected |
|--------|-------------|----------|
| 3 steps: basics, confirm, invite | Step 1: fields. Step 2: org confirm + review. Step 3: optional team invite. | ✓ |
| 2 steps: basics + invite | Skip org confirmation step. | |
| Keep single page + invite section | Don't convert to wizard. Add invite section to existing form. | |

**User's choice:** 3 steps: basics, confirm, invite
**Notes:** Matches ORG-08 spec exactly.

### Team invite mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox list of org members | All org members with checkboxes. Per-member role dropdown. Immediate add. | ✓ |
| Search + add individually | Combobox search, add one at a time. Better for large orgs. | |
| Skip — invite after creation | Redirect to campaign settings for invites. Breaks flow. | |

**User's choice:** Checkbox list of org members
**Notes:** ORG-10 — no invite email needed for existing org members.

### Non-admin gating UX

| Option | Description | Selected |
|--------|-------------|----------|
| Hide button entirely | Matches RequireRole pattern (hides vs disables). Consistent. | ✓ |
| Show disabled with tooltip | Visible but greyed out. User knows feature exists. | |
| Show button, block on click | Confusing UX. | |

**User's choice:** Hide the 'New Campaign' button entirely
**Notes:** Consistent with existing project Key Decision on RequireRole behavior.

---

## Member Management & Settings

### Member directory layout (ORG-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Table with campaign columns | Rows=members, columns=campaigns. Role in each cell. | ✓ |
| Member cards with role list | Card per member with campaign+role list underneath. | |
| Expandable rows | Compact list, click to expand per-campaign roles. | |

**User's choice:** Table with campaign columns
**Notes:** Compact and scannable — shows full picture at a glance.

### Add member to campaign (ORG-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Action from member row | Row action opens dialog: pick campaigns, assign role, confirm. | ✓ |
| Bulk action | Select multiple members, bulk add to one campaign. | |
| From campaign settings only | Navigate to campaign member management. Existing flow. | |

**User's choice:** Action from member directory row
**Notes:** Direct from where you're already viewing members.

### Org settings page (ORG-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Name edit + read-only ZITADEL ID | Simple, matches ORG-09 exactly. | |
| Add danger zone section | Above plus Danger Zone for future destructive actions. | ✓ |
| Minimal read-only only | No editing. Doesn't meet ORG-09. | |

**User's choice:** Add danger zone section
**Notes:** Sets up the pattern for future actions even if not all functional yet.

### Campaign archival (ORG-11)

| Option | Description | Selected |
|--------|-------------|----------|
| Archive button on card menu | Three-dot menu with 'Archive campaign'. Confirmation dialog. | ✓ |
| From campaign settings | Navigate into campaign settings to archive. More deliberate. | |
| Bulk archive via checkboxes | Select multiple, archive all. Good for post-election cleanup. | |

**User's choice:** Archive button on campaign card menu
**Notes:** Confirmation dialog with campaign name required.

---

## Claude's Discretion

- Wizard step indicator design
- Role matrix table responsive behavior
- Org switcher dropdown styling
- Loading/skeleton states
- Danger zone visual treatment
- Backend endpoint design for new CRUD operations

## Deferred Ideas

- Org-level aggregate dashboards — Future Requirements
- Org invite link — Future Requirements
- Org activity feed — Future Requirements
- Remove member from all campaigns — Future Requirements
- Billing/subscription placeholder — Future Requirements
