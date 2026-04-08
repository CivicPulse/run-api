---
phase: 93
slug: spend-controls-communication-telemetry
status: draft
shadcn_initialized: true
preset: new-york / neutral
created: 2026-04-07
---

# Phase 93 - UI Design Contract: Spend Controls & Communication Telemetry

> Visual and interaction contract for frontend phases. Generated from the locked phase context and aligned to existing org settings patterns.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui |
| Preset | new-york style, neutral base color, CSS variables enabled |
| Component library | Radix UI (via shadcn) |
| Icon library | lucide-react |
| Font | System font stack (Tailwind default) |

Source: `web/components.json`, `web/src/index.css`

Operational admin surface only. This phase adds spend visibility and threshold controls, not a marketing dashboard.

---

## Layout Contract

The spend controls UI lives inside the existing `org/settings` screen, alongside the Twilio communications and phone-number cards.

| Area | Contract |
|------|----------|
| Primary surface | A dedicated `Twilio Spend & Telemetry` card in org settings |
| Secondary surface | Inline over-budget / nearly-over-budget banners in voice and SMS workflows |
| Admin role split | Org admins can view and edit soft budgets; org owners retain the broader org-settings permissions already established for Twilio configuration, but this card is not owner-only |
| Page density | Compact, card-based, no separate analytics dashboard |

Card order on desktop:
1. General
2. Twilio Communications
3. Twilio Spend & Telemetry
4. Phone Numbers
5. Danger Zone

Mobile behavior:
- Cards stack vertically with 16px gaps.
- Threshold inputs remain full width.
- Recent activity rows collapse into a single-column table or stacked list without horizontal scrolling.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline badge padding |
| sm | 8px | Tight row spacing, status chip gaps |
| md | 16px | Default card padding, form field spacing |
| lg | 24px | Separation between summary area and activity table |
| xl | 32px | Page-section padding between cards |
| 2xl | 48px | Empty-state and loading-state padding |
| 3xl | 64px | Full-page top/bottom breathing room |

Exceptions:
- Budget summary chips, threshold inputs, and action buttons keep minimum 44px touch targets.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label | 14px | 500 | 1.4 |
| Heading | 20px | 600 | 1.2 |
| Display | 28px | 700 | 1.1 |

Budget amounts, usage percentages, timestamps, and provider SID fragments use `font-mono` or `tabular-nums` where values change live.

Section headers should follow the existing org settings style: short, bold, and restrained.

---

## Color

All color values reference the existing project CSS custom properties from `web/src/index.css`. No new palette is introduced in this phase.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` | Page background and card surroundings |
| Secondary (30%) | `--card` / `--secondary` | Summary cards, tables, recent-activity rows |
| Accent (10%) | `--primary` | Save actions, selected budget scope, active summary emphasis |
| Destructive | `--destructive` | Over-budget blocks and irreversible threshold resets |

Status colors:
- `--status-info` and `--status-info-muted` for pending cost and in-flight usage.
- `--status-success` for healthy spend and confirmed totals.
- `--status-warning` and `--status-warning-muted` for nearing-limit states.
- `--status-error` for over-budget blocking states.

Accent (`--primary`) is reserved for the budget save button, active summary selection, and the most important highlight in the spend summary.

No decorative gradients or finance-dashboard sheen. Keep surfaces flat and operational.

---

## Component Inventory

Existing shadcn components used in this phase:

| Component | Usage |
|-----------|-------|
| `Card` | Spend summary, threshold controls, recent activity |
| `Button` | Save budget, refresh activity, reset to defaults |
| `Badge` | Healthy / near-limit / over-budget / pending states |
| `Input` | Budget thresholds and currency values |
| `Label` | Field labels and helper text blocks |
| `Skeleton` | Org spend loading states |
| `Separator` | Dividers between summary, settings, and activity |
| `Table` or compact list markup | Recent billable activity |
| `Tooltip` | Budget definitions, pending-cost explanation, provider SID hints |

New UI pieces to build from those primitives:

| Component | Location | Description |
|-----------|----------|-------------|
| `OrgSpendCard` | `web/src/components/org/` | Summary card with current spend, budget, and state chips |
| `SpendThresholdForm` | `web/src/components/org/` | Soft-limit inputs and save controls |
| `RecentCommunicationActivity` | `web/src/components/org/` | Compact voice + SMS activity table |
| `SpendStateBanner` | `web/src/components/field/` | Inline block/warning banner for send and call flows |

---

## Interaction States

### Org Settings Spend Card

The spend card is read-first, edit-second.

| State | Trigger | Visual |
|-------|---------|--------|
| Healthy | Current spend below configured soft limit | Green/neutral summary chip with remaining budget emphasized |
| Near limit | Spend is approaching threshold | Warning chip and amber helper text, but no blocking |
| Over budget | Spend exceeds configured soft limit | Destructive banner, blocked send/call hints, and clear next-step copy |
| Pending cost | Provider callbacks have not finalized all costs | Info chip and muted helper text so admins know totals may still change |
| No configuration | Thresholds have never been set | Empty state with one primary CTA to configure limits |

### Threshold Editing

- Org admins can edit daily and monthly soft limits in the same card.
- Use inline inputs instead of a wizard or modal.
- The primary action reads `Save budget`.
- If there are unsaved changes, show a subtle inline indicator and keep the page stable.
- A `Reset to defaults` action may appear only if the org has existing limits.

### Recent Activity

- Show recent billable activity as a compact table or list with channel, amount, status, campaign, and timestamp.
- Include voice and SMS together so admins can compare spend composition quickly.
- Pending rows must be labeled `Pending` until a terminal callback or reconciliation updates the amount.
- Over-budget state must be visible without forcing the admin to leave the page.

### Inline Workflow Blocks

- Over-budget send/call flows should fail fast with an inline destructive banner, not just a toast.
- Near-limit states should use a warning banner that explains the remaining headroom.
- Pending-cost states should use a neutral or info-toned banner so staff do not assume a hard failure.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Card title | `Spend Controls & Telemetry` |
| Summary heading | `Communication spend` |
| Summary helper | `Voice and SMS spend is tracked at the org level.` |
| Budget section heading | `Soft budget` |
| Daily limit label | `Daily soft limit` |
| Monthly limit label | `Monthly soft limit` |
| Save action | `Save budget` |
| Reset action | `Reset to defaults` |
| Activity heading | `Recent billable activity` |
| Activity empty state heading | `No communication activity yet` |
| Activity empty state body | `Voice and SMS spend will appear here after the first billable action.` |
| Healthy state | `Healthy` |
| Near-limit state | `Near limit` |
| Over-budget state | `Over budget` |
| Pending state | `Pending cost` |
| Over-budget banner heading | `Spend limit reached` |
| Over-budget banner body | `New calls and texts are blocked until an admin raises the soft limit.` |
| Near-limit banner heading | `Budget nearly exhausted` |
| Near-limit banner body | `New calls and texts will be blocked soon unless the limit is raised.` |
| Pending-cost banner heading | `Cost still pending` |
| Pending-cost banner body | `Some recent Twilio costs have not finalized yet.` |
| Inline block copy | `This action is blocked by the current communication soft limit.` |

---

## Accessibility Contract

All requirements enforce WCAG AA as already established in the product baseline.

| Requirement | Specification |
|-------------|--------------|
| Touch targets | Budget controls, save actions, refresh actions, and state chips must be at least 44x44px |
| Focus management | When the spend card saves successfully, focus remains on the card and does not jump unexpectedly |
| Keyboard | Inputs and buttons must be reachable in tab order; `Enter` submits the active budget form |
| Screen reader | Over-budget and near-limit banners announce via `role="alert"`; pending-cost updates use `aria-live="polite"` |
| Contrast | Warning/error chips and helper text must remain readable against card surfaces |
| Reduced motion | No animated gauges or charts; if a progress bar is used, it should be static or minimal motion only |
| Live updates | Recent activity refreshes should not spam announcements on every refetch |
| Form clarity | Disabled send/call blocks must say why they are disabled instead of silently preventing action |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | card, button, badge, input, label, skeleton, separator, table, tooltip | not required |

No third-party registries. No new shadcn blocks are introduced in this phase.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-07
