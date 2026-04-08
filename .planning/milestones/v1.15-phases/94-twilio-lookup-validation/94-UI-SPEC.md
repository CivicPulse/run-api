---
phase: 94
slug: twilio-lookup-validation
status: draft
shadcn_initialized: true
preset: new-york / neutral
created: 2026-04-08
---

# Phase 94 - UI Design Contract: Twilio Lookup Validation

> Visual and interaction contract for frontend phases. Generated from the locked phase context and aligned to existing contact-edit and SMS eligibility patterns.

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

Operational utility surface only. This phase adds validation intelligence, not a new lookup dashboard.

---

## Surface Contract

The primary UI surface is the existing voter contact-edit experience, especially `ContactsTab` and the inline phone edit forms. The same validation summary is reused anywhere the product needs SMS eligibility preflight.

| Surface | Contract |
|---------|----------|
| Primary | Inline phone validation state inside `web/src/components/voters/ContactsTab.tsx` |
| Secondary | SMS eligibility helper/badge surfaces that consume the same cached validation summary |
| Scope | Campaign-scoped validation only; no org-wide lookup console |
| Save behavior | Contact save remains available even when Twilio Lookup is stale or unavailable |
| Preflight behavior | SMS send surfaces can block on `landline`, `voip`, or `review needed` results when the cached summary says the number is not text-safe |

The contact-edit experience should remain calm and fast. Validation is a derived signal, not a new workflow that interrupts editing.

---

## Layout Contract

### Contact Edit

- Show a compact validation badge beside each phone row or directly under the phone input in edit mode.
- Keep the existing phone-type selector and save/cancel controls in place.
- Add a short validation summary line below the phone value with carrier, line type, and freshness.
- If the cached lookup is stale, expose a small `Refresh lookup` action without disabling contact save.
- If lookup fails, leave the form editable and surface the failure as a warning, not a hard stop.

### SMS Preflight

- Reuse the same cached summary object in SMS composer and send-preflight surfaces.
- If the validation says `mobile`, show a textable badge and allow send.
- If the validation says `landline`, `voip`, or unknown, show a blocking SMS warning with the same underlying summary data.
- If the validation is pending or stale, show an informational helper first, then refresh opportunistically.

### Mobile

- Phone validation badges stack under the field label or phone row metadata.
- Helper copy stays single-line where possible and wraps cleanly without horizontal scrolling.
- Validation actions must remain at least 44px high.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Badge padding, icon gaps |
| sm | 8px | Tight row spacing, metadata offsets |
| md | 16px | Field groups, inline summary spacing |
| lg | 24px | Separation between phone rows and helper banners |
| xl | 32px | Card padding and section breaks |
| 2xl | 48px | Empty states and loading states |
| 3xl | 64px | Full-page breathing room |

Exceptions: validation badges, refresh buttons, and SMS-preflight actions must preserve minimum 44px touch targets.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label | 14px | 500 | 1.4 |
| Heading | 20px | 600 | 1.2 |
| Display | 28px | 700 | 1.1 |

Phone numbers, validation ages, and carrier data use `font-mono` or `tabular-nums` when the value changes live.

Validation copy should stay short. The most important signal is the badge state, not the paragraph text.

---

## Color

All color values reference the existing project CSS custom properties from `web/src/index.css`. No new palette is introduced in this phase.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` | Page background and card surroundings |
| Secondary (30%) | `--card` / `--secondary` | Phone rows, inline summaries, small helper cards |
| Accent (10%) | `--primary` | The main validation badge and refresh affordance when healthy |
| Destructive | `--destructive` | Not SMS-safe, failed lookup, hard SMS blocking states |

Status colors:
- `--status-info` and `--status-info-muted` for pending, refreshing, and stale-but-recoverable states.
- `--status-success` for validated mobile numbers and textable summaries.
- `--status-warning` and `--status-warning-muted` for review-needed or stale cache states.
- `--status-error` for landline, failed lookup, or SMS-blocking states.

Derived classification:
- `mobile` maps to success styling and a `Textable`-style badge.
- `landline` maps to error styling and a `Not SMS-safe` message.
- `voip` and unknown values map to warning styling and a `Review needed` message.

No decorative gradients, glow, or dashboard treatment. Keep the signal compact and operational.

---

## Component Inventory

Existing shadcn components used in this phase:

| Component | Usage |
|-----------|-------|
| `Badge` | Validation state, freshness, and SMS safety labels |
| `Button` | Refresh lookup, retry validation, send preflight actions |
| `Card` | Optional summary blocks in contact edit or SMS helper areas |
| `Input` | Phone value and editable contact fields |
| `Label` | Phone field labels and inline helper anchors |
| `Skeleton` | Pending validation loading state |
| `Tooltip` | Carrier and freshness explanations |
| `Separator` | Optional division between contact data and validation summary |

New UI pieces to build from those primitives:

| Component | Location | Description |
|-----------|----------|-------------|
| `PhoneValidationBadge` | `web/src/components/voters/` | Compact badge showing valid/pending/stale/review-needed state |
| `PhoneValidationSummary` | `web/src/components/voters/` | Inline carrier, line type, and freshness summary next to the phone field |
| `PhoneValidationBanner` | `web/src/components/voters/` | Warning or info banner for stale, failed, or SMS-blocking states |
| `SmsEligibilitySummary` | `web/src/components/field/` | Read-only shared summary consumed by SMS preflight and send gating |

The validation summary must be reusable. Do not create a separate styling system for SMS and contact-edit surfaces.

---

## Interaction States

### Contact Edit

| State | Trigger | Visual |
|-------|---------|--------|
| Validated mobile | Twilio Lookup says the number is mobile and fresh | Success badge with `Textable` or `Mobile` copy and a brief freshness label |
| Landline | Twilio Lookup says landline | Destructive badge with a short `Not SMS-safe` explanation |
| VoIP / unknown | Twilio Lookup is inconclusive or cautious | Warning badge with `Review needed` copy |
| Pending | Lookup is in flight or unavailable on initial load | Info badge with skeleton or subtle spinner state |
| Stale | Cache age exceeds freshness window | Warning badge plus `Refresh lookup` action |
| Failed lookup | Twilio Lookup request failed | Warning banner that says save is still allowed and retry is available |

### SMS Preflight

- The same cached summary should drive SMS helper copy in send surfaces.
- `mobile` should show a green/neutral textable state.
- `landline`, `voip`, and unknown should disable send and explain why.
- Stale cache should trigger a refresh message before the user sends, but not block the contact edit form itself.

### Validation Refresh

- Refresh happens as an explicit action in the contact edit surface.
- If a refresh fails, keep the current cached summary visible and mark it as stale or pending.
- A successful refresh updates the badge and freshness text in place without navigating away.

### Inline Copy

- Keep carrier and line-type details subordinate to the badge.
- Never replace the contact's own `mobile/home/work` label with Twilio lookup data.
- The lookup is derived intelligence, not source-of-truth contact data.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Badge label - mobile | `Textable` |
| Badge label - landline | `Not SMS-safe` |
| Badge label - voip | `Review needed` |
| Badge label - pending | `Validating` |
| Badge label - stale | `Refresh recommended` |
| Summary title | `Phone Validation` |
| Summary helper | `Twilio Lookup helps classify the number without changing the contact record.` |
| Carrier label | `Carrier` |
| Line type label | `Line type` |
| Freshness label | `Validated` |
| Refresh action | `Refresh lookup` |
| Failed lookup heading | `Lookup unavailable` |
| Failed lookup body | `Save the contact now. Validation can be retried later.` |
| SMS helper heading | `Textability` |
| SMS helper body - mobile | `This number can be used for SMS outreach.` |
| SMS helper body - landline | `This number is not safe for SMS outreach.` |
| SMS helper body - review-needed | `This number needs review before texting.` |
| Stale copy | `Cached validation is getting old. Refresh to confirm the current line type.` |
| Pending copy | `Checking Twilio Lookup...` |

---

## Accessibility Contract

All requirements enforce WCAG AA as already established in the product baseline.

| Requirement | Specification |
|-------------|--------------|
| Touch targets | Refresh actions, validation badges, and SMS helper actions must be at least 44x44px |
| Focus management | Refreshing validation should not steal focus from the phone field unless the user triggered a modal or drawer |
| Keyboard | The validation refresh action must be tabbable and activatable with Enter or Space |
| Screen reader | Validation updates announce via `aria-live="polite"`; SMS-blocking states use `role="alert"` only when they actively block sending |
| Contrast | Success, warning, and destructive states must remain readable on card and form surfaces |
| Reduced motion | No animated charts or sweeping transitions; any badge change should be subtle |
| Live updates | Revalidation should announce once, not on every query refetch |
| Form clarity | Saving a contact must remain possible even when validation is pending or failed |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | badge, button, card, input, label, skeleton, separator, tooltip | not required |

No third-party registries. No new shadcn blocks are introduced in this phase.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-08
