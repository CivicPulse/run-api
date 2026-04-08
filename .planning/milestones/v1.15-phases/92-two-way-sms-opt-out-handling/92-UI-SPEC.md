---
phase: 92
slug: two-way-sms-opt-out-handling
status: draft
shadcn_initialized: true
preset: new-york / neutral
created: 2026-04-07
---

# Phase 92 - UI Design Contract: Two-Way SMS & Opt-Out Handling

> Visual and interaction contract for frontend phases. Generated from the locked phase context and verified against existing product patterns.

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

Operational tone only. This surface is a work queue, not a marketing page, so keep the layout compact and restrained.

---

## Navigation Contract

- Add a `Messages` entry to the existing `campaigns/$campaignId/phone-banking` module nav.
- Route the inbox to `/campaigns/$campaignId/phone-banking/messages/`.
- Keep the inbox inside the phone-banking module shell. Do not create a separate top-level SMS admin area.
- In field mode, expose a compact `Text` or `Message` action on the voter context card that opens the same conversation surface in a drawer or inline panel.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline badge padding |
| sm | 8px | Tight row spacing, chip gaps, timestamp offsets |
| md | 16px | Default card padding, form spacing |
| lg | 24px | Separation between inbox and thread panels |
| xl | 32px | Page section padding |
| 2xl | 48px | Major panel breaks, empty states |
| 3xl | 64px | Page-level top and bottom spacing |

Exceptions: all conversation rows, composer controls, and bulk-send actions must keep minimum 44px touch targets.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label | 14px | 500 | 1.4 |
| Heading | 20px | 600 | 1.2 |
| Display | 28px | 700 | 1.1 |

Message body copy uses the body size and remains readable at 100% zoom without horizontal scrolling.

Phone numbers, timestamps, and queued-send counts use `font-mono` and `tabular-nums` where the value can change live.

---

## Color

All color values reference the existing project CSS custom properties from `web/src/index.css`. No new palette is introduced in this phase.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` | Page background, inbox shell, empty state backdrop |
| Secondary (30%) | `--card` / `--secondary` | Conversation rows, thread cards, composer containers |
| Accent (10%) | `--primary` | Selected conversation outline, primary send CTA, unread indicator |
| Destructive | `--destructive` | Hard-block banners, failed-send state, destructive dismissals |

Accent (`--primary`) is reserved for: the `Send SMS` button, selected conversation state, unread/active indicators, and progress emphasis on queued bulk jobs.

Status colors:
- `--status-info` and `--status-info-muted` for incoming message highlights, unread badges, and queued job status.
- `--status-success` for sent/delivered confirmations.
- `--status-warning` and `--status-warning-muted` for consent-unclear states and pre-send compliance warnings.
- `--status-error` for opt-out blocks and failed delivery states.

Conversation bubbles:
- Inbound messages use `--secondary` surfaces with neutral text.
- Outbound messages use `--status-info-muted` surfaces with `--status-info-foreground` text.
- System notices for STOP/START handling use warning or error banners, not normal message bubbles.

No decorative gradients, glow, or marketing-style treatment. Keep surfaces flat with subtle borders and status chips.

---

## Component Inventory

Existing shadcn components used in this phase:

| Component | Usage |
|-----------|-------|
| `Button` | Send, queue bulk SMS, retry, filter actions |
| `Badge` | Eligibility, opt-out, unread, delivery, queued status |
| `Card` | Conversation list, thread panel, job summary cards |
| `Dialog` | Bulk send confirmation and send review |
| `Input` | Search, sender selection, recipient filters |
| `Select` | Sender number, segment, recipient scope |
| `Skeleton` | Inbox and thread loading states |
| `Tabs` | Inbox filters on smaller screens if needed |
| `Textarea` | Message composer |
| `Tooltip` | Sender, status, and compliance clarifications |
| `ScrollArea` | Thread history and conversation list overflow |
| `Separator` | Panel and section dividers |
| `Sheet` | Mobile thread drawer or bulk-send panel if needed |

New components to build from those primitives:

| Component | Location | Description |
|-----------|----------|-------------|
| `SmsInboxPage` | `web/src/routes/campaigns/$campaignId/phone-banking/messages/` | Campaign-level reply inbox and send surface |
| `SmsConversationList` | `web/src/components/field/` | Scrollable list of conversations with preview, unread count, and state badges |
| `SmsConversationRow` | `web/src/components/field/` | One selectable conversation row with selected, unread, opted-out, and blocked states |
| `SmsThreadPanel` | `web/src/components/field/` | Thread history, sender selector, and sticky composer |
| `SmsComposer` | `web/src/components/field/` | Individual SMS reply composer with send button and compliance notes |
| `SmsBulkSendDialog` | `web/src/components/field/` | Bulk SMS review, send count, and queue confirmation |
| `SmsSendJobCard` | `web/src/components/field/` | Observable queued-send status card with counts and progress |
| `SmsEligibilityBanner` | `web/src/components/field/` | Warning when SMS consent is unclear or missing |
| `SmsOptOutBanner` | `web/src/components/field/` | Hard block when the conversation is opted out |
| `SmsDeliveryBadge` | `web/src/components/field/` | Sent, delivered, failed, and queued state chip |

---

## Interaction States

### Campaign Messages Page

The inbox page is the primary SMS surface.

| State | Trigger | Visual |
|-------|---------|--------|
| Empty | No conversations exist | Centered empty state with `MessageSquare` icon, heading, and a single `Send Bulk SMS` CTA |
| Loading | Query in progress | Skeleton list on the left, skeleton thread on the right |
| Has conversations | One or more threads available | Left conversation list and right thread panel on desktop; stacked list then detail on mobile |
| Conversation selected | User picks a row | Selected row gets primary outline and secondary background; thread panel scrolls to that conversation |
| Unread conversation | New inbound reply not yet opened | Bold preview text, unread dot, and info badge count |
| Opted out | SMS paused for this voter | Row is muted, send controls disabled, opt-out banner appears above composer |
| Consent unclear | No explicit SMS eligibility signal | Row shows warning badge and composer shows compliance warning; send is blocked until eligibility is clear |
| Failed delivery | Twilio delivery failure or hard bounce | Row and thread display error badge plus retry affordance where appropriate |

### Thread Panel

Thread content reads like an operational chat log, not a consumer messenger.

- Inbound messages align left and use neutral surfaces.
- Outbound messages align right and use info-toned surfaces.
- System messages for STOP, START, delivery failure, or eligibility blocks are centered and visually distinct from human messages.
- Each message shows timestamp and delivery state without crowding the bubble.
- The newest message remains visible after send without forcing a full page reload.

### Composer

- The composer stays pinned to the bottom of the thread panel.
- If the org has multiple valid SMS sender numbers, show a `From` selector inline above the message field.
- If there is only one valid sender, show it as read-only helper text to reduce clutter.
- The primary action reads `Send SMS`.
- If the selected conversation is opted out or consent is unclear, disable send and replace the helper line with the blocking explanation.
- The composer never hides the reason a send is blocked.

### Bulk Send

- Bulk SMS opens in a dialog or sheet from the page header, not as a full new route.
- The dialog shows recipient count, sender number, and the exact message body before the job is queued.
- Submission queues a background job and returns to the inbox immediately.
- The page then shows a `SmsSendJobCard` with queued, running, and completed counts.
- Bulk send uses `Queue SMS` as the confirmation action, not `Send now`, to reflect Procrastinate-backed execution.

### Field Quick Action

- In field mode, SMS appears as a compact secondary action beside the existing phone workflow.
- Tapping the text action opens the same thread view in a drawer or inline panel so staff never leave the campaign context.
- The field quick action is intentionally smaller than the campaign inbox and should not duplicate the full inbox chrome.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Module nav entry | `Messages` |
| Page title | `Messages` |
| Primary CTA | `Send SMS` |
| Bulk send CTA | `Send Bulk SMS` |
| Bulk queue action | `Queue SMS` |
| Empty state heading | `No SMS conversations yet` |
| Empty state body | `Replies and sent texts will appear here once the campaign sends a message or a voter replies.` |
| No thread selected heading | `Select a conversation` |
| No thread selected body | `Choose a voter to read the thread or send a reply.` |
| Eligible badge | `Textable` |
| Consent warning heading | `SMS consent is unclear` |
| Consent warning body | `Imported phone numbers alone do not make a voter textable.` |
| Opt-out warning heading | `SMS paused` |
| Opt-out warning body | `This voter opted out of SMS. Sends are blocked until the voter replies START.` |
| Delivery status - queued | `Queued` |
| Delivery status - sending | `Sending` |
| Delivery status - sent | `Sent` |
| Delivery status - delivered | `Delivered` |
| Delivery status - failed | `Failed` |
| Job card heading | `Bulk SMS in progress` |
| Job card body | `Messages are being sent in the background. You can keep working while the queue runs.` |
| Error state | `SMS could not be sent. Check consent, opt-out state, and the selected sender number.` |
| Retry action | `Try again` |
| System notice for START | `Texting resumed` |
| System notice for STOP | `Texting paused` |
| Confirmation copy | `Queue SMS to this segment? The selected recipients will receive this message from the chosen sender number.` |

---

## Accessibility Contract

All requirements enforce WCAG AA as already established in the product baseline.

| Requirement | Specification |
|-------------|--------------|
| Touch targets | Conversation rows, send buttons, sender selectors, and bulk actions must be at least 44x44px |
| Focus management | Selecting a conversation moves focus to the thread heading; closing a bulk dialog restores focus to the launch button |
| Keyboard | Conversation list supports Tab and Enter selection; composer sends with Cmd/Ctrl+Enter and button click |
| Screen reader | Unread counts, opt-out blocks, and delivery failures announce via `aria-live="polite"`; hard blocks use `role="alert"` |
| Contrast | Status chips and bubble text meet readable contrast against status surfaces in both light and dark mode |
| Reduced motion | Keep motion minimal; use fade or slide transitions only when `prefers-reduced-motion` allows it |
| Live updates | New inbound messages should announce once, not on every rerender |
| Form clarity | Disabled composer controls must explain why they are disabled instead of silently locking the UI |

---

## Layout Contract

### Desktop

- The campaign Messages page uses a two-pane layout inside the existing `ModuleLayout` shell.
- Left pane: filters plus conversation list, fixed width, vertically scrollable.
- Right pane: selected thread, sticky composer, and sender/compliance details.
- The composer stays visible while the thread scrolls.
- Job status cards sit above the list so queued bulk sends remain visible without dominating the thread.

### Mobile

- The layout stacks into a single column.
- Filters appear first, then the conversation list, then the selected thread.
- The thread panel expands to full width and the composer remains pinned to the bottom of the viewport or panel.
- Bulk send uses a sheet or dialog that fills most of the screen but keeps a clear cancel path.

### Density

- Default density is compact but not cramped.
- Thread rows should prioritize scanability over decoration.
- Long messages wrap naturally and should not force horizontal scrolling.
- The conversation list must stay readable on small screens without turning into a dense admin table.

### Empty States

- Use simple icon-led empty states, not illustrations.
- Keep empty-state copy operational and action-oriented.
- Always provide a next step, usually `Send Bulk SMS` or select a conversation.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | button, badge, card, dialog, input, select, skeleton, tabs, textarea, tooltip, scroll-area, separator, sheet | not required |

No third-party registries. No new shadcn blocks are introduced in this phase.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
