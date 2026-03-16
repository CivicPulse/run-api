# Phase 36: Google Maps Navigation Link for Canvassing - Research

**Researched:** 2026-03-16
**Domain:** Google Maps URL integration, React UI components, mobile UX
**Confidence:** HIGH

## Summary

Phase 36 is a pure front-end enhancement phase. The existing `getGoogleMapsUrl()` function in `canvassing.ts` already constructs Google Maps directions URLs from voter addresses. This phase upgrades the UX by replacing the tappable address text in HouseholdCard with a dedicated Navigate button, adding walking mode to the URL, propagating navigation links to DoorListView rows, and adding subtle "View on Map" links to admin-side pages (voter detail and walk list detail).

No new libraries are needed. All work uses existing shadcn/ui components (`Button`, `Tooltip`), Lucide icons, and the established `getGoogleMapsUrl` utility. The changes are localized to 5 files with no backend modifications.

**Primary recommendation:** Refactor `getGoogleMapsUrl` to accept either a `VoterDetail` or a full `Voter` type (both have identical registration address fields), add `&travelmode=walking`, then update each UI location in sequence.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Google Maps only -- no Apple Maps or Waze detection
- Standard web URL (`google.com/maps/dir/?api=1`) -- no platform-specific intent URIs
- Destination-only -- no origin parameter; Google Maps auto-uses device GPS
- Walking directions by default (`&travelmode=walking`) since canvassers are on foot
- Address-based (not lat/long) per existing project feedback
- Replace current tappable address text with a dedicated full-width outline button below the address
- Address displayed as header text (plain, non-interactive), Navigate button below it
- Button text: "Navigate to Address" with map icon from lucide
- Button style: `variant="outline"`, full width, 44px minimum height
- No visual feedback on tap -- OS handles the transition to Google Maps
- Remove the "Tap address to navigate" hint text
- DoorListView: each row gets a small icon button (MapPin) at the end, 44px touch target
- Admin-side: small "View on Map" text link with external-link icon near the address
- Voter detail page: link below registration address
- Walk list detail page: link on each entry's address
- Best-effort URL construction -- build with whatever address components exist
- Disable Navigate button only if ALL address fields are null/empty
- Tooltip on disabled button: "No address available"
- Opens in new tab (`target="_blank"`) -- wizard stays in background
- No confirmation dialog -- Zustand persist ensures no state loss
- No toast or loading state on tap

### Claude's Discretion
- Exact Lucide icon choice (Navigation2 vs MapPin vs Map)
- Button placement relative to address header (spacing, margins)
- How to refactor `getGoogleMapsUrl` to accept address string or voter object
- Walk list detail page layout for the navigation links
- ARIA label text for the Navigate button

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | (existing) | Icons: Navigation2, MapPin, ExternalLink | Already used throughout project |
| shadcn/ui Button | (existing) | Navigate button with outline variant | Project standard for all buttons |
| shadcn/ui Tooltip | (existing) | Disabled button tooltip | Already in `web/src/components/ui/tooltip.tsx` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | - | No new libraries needed |

**Installation:**
```bash
# No installation needed -- all dependencies already present
```

## Architecture Patterns

### Affected Files
```
web/src/
  types/canvassing.ts              # getGoogleMapsUrl refactor + hasAddress helper
  components/field/HouseholdCard.tsx # Replace <a> with plain text + Button
  components/field/DoorListView.tsx  # Add MapPin icon button per row
  routes/campaigns/$campaignId/
    voters/$voterId.tsx             # Add "View on Map" link in Registration Address card
    canvassing/walk-lists/$walkListId.tsx  # Add map link per entry row
```

### Pattern 1: Google Maps URL Construction
**What:** Refactor `getGoogleMapsUrl` to add walking mode and accept broader input
**When to use:** All navigation link locations

Current implementation (line 127-130 of canvassing.ts):
```typescript
export function getGoogleMapsUrl(voter: VoterDetail): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
```

Updated pattern:
```typescript
// Accept any object with registration address fields
type HasRegistrationAddress = Pick<VoterDetail,
  'registration_line1' | 'registration_city' | 'registration_state' | 'registration_zip'
>

export function getGoogleMapsUrl(voter: HasRegistrationAddress): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=walking`
}

/** Returns true if voter has at least one address component */
export function hasAddress(voter: HasRegistrationAddress): boolean {
  return Boolean(
    voter.registration_line1 || voter.registration_city ||
    voter.registration_state || voter.registration_zip
  )
}
```

The `Voter` type (from `types/voter.ts`) has the same `registration_*` fields as `VoterDetail` (from `types/canvassing.ts`), so using `Pick` on common field names allows both types to work seamlessly.

### Pattern 2: Field Mode Navigate Button (HouseholdCard)
**What:** Replace tappable `<a>` with plain text header + dedicated outline button
**When to use:** HouseholdCard address section

```typescript
// Address header (plain, non-interactive)
<div className="flex items-center gap-2">
  <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
  <span className="text-lg font-semibold">{household.address}</span>
</div>

// Navigate button
<Button
  variant="outline"
  className="w-full min-h-11 mt-2"
  disabled={!addressAvailable}
  asChild={addressAvailable}
  aria-label={`Navigate to ${household.address}`}
>
  {addressAvailable ? (
    <a href={navUrl} target="_blank" rel="noopener noreferrer">
      <Navigation2 className="h-4 w-4 mr-2" />
      Navigate to Address
    </a>
  ) : (
    <span>
      <Navigation2 className="h-4 w-4 mr-2" />
      Navigate to Address
    </span>
  )}
</Button>
```

For the disabled tooltip, wrap with Tooltip from shadcn/ui (conditionally rendered only when disabled).

### Pattern 3: DoorListView Icon Button
**What:** Small MapPin icon button at end of each row
**When to use:** DoorListView household rows

```typescript
// Add after the Badge, before closing </button> of row
<a
  href={getGoogleMapsUrl(household.entries[0].voter)}
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => e.stopPropagation()} // Prevent row jump
  className="inline-flex items-center justify-center min-h-11 min-w-11 p-2 shrink-0"
  aria-label={`Navigate to ${household.address}`}
>
  <MapPin className="h-4 w-4 text-muted-foreground" />
</a>
```

Key: `stopPropagation` prevents the row's `onClick` (jump to address) from firing when the map icon is tapped.

### Pattern 4: Admin Text Link
**What:** Subtle "View on Map" text link with ExternalLink icon
**When to use:** Voter detail page, walk list detail page

```typescript
import { ExternalLink } from "lucide-react"

// Below registration address in voter detail
<a
  href={getGoogleMapsUrl(voter)}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
>
  View on Map
  <ExternalLink className="h-3 w-3" />
</a>
```

### Anti-Patterns to Avoid
- **Platform-specific intent URIs:** Do NOT use `comgooglemaps://` or `geo:` URIs. Standard web URLs work everywhere.
- **Setting origin parameter:** Do NOT set `origin=` in the URL. Google Maps auto-detects GPS location, and setting origin breaks on desktop.
- **Blocking navigation with confirmation dialogs:** Zustand persist guarantees wizard state survival. A confirmation dialog would add unnecessary friction for canvassers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip on disabled button | Custom popover logic | shadcn/ui `Tooltip` wrapping the button | Already exists in project, handles a11y |
| External link behavior | Custom window.open handlers | Native `<a target="_blank">` | Browser handles new tab, more accessible |
| Address validation | Regex-based address parser | Simple null/empty check on address fields | Best-effort is the decision; no need for validation |

## Common Pitfalls

### Pitfall 1: DoorListView click event bubbling
**What goes wrong:** Tapping the MapPin icon also triggers the row's `onJump` handler, navigating the wizard AND opening Google Maps simultaneously.
**Why it happens:** The icon is nested inside a `<button>` element that handles clicks.
**How to avoid:** Use `e.stopPropagation()` on the map link's `onClick`.
**Warning signs:** Tapping map icon causes the wizard to jump to a different address.

### Pitfall 2: Button disabled state with `asChild`
**What goes wrong:** When using `asChild` on a Button wrapping an `<a>`, the `disabled` prop doesn't prevent link navigation.
**Why it happens:** HTML `<a>` tags don't support the `disabled` attribute.
**How to avoid:** Conditionally render: when address exists use `asChild` with `<a>`, when missing render a plain `<span>` child with `disabled` on Button.
**Warning signs:** Disabled-looking button still opens Google Maps.

### Pitfall 3: Walk list detail missing voter address data
**What goes wrong:** The walk list entries endpoint returns `voter_id` and `household_key` but may not include full address fields.
**Why it happens:** The admin walk list detail page uses `useWalkListEntries` which returns minimal entry data (id, voter_id, household_key, sequence, status) -- no registration address fields.
**How to avoid:** For walk list detail, the map link may need to construct a URL from `household_key` if it contains address info, or the link should only appear on entries where address data is available. Check the API response shape.
**Warning signs:** Map links on walk list detail page all point to empty addresses.

### Pitfall 4: Tooltip not showing on disabled button
**What goes wrong:** Radix UI Tooltip requires pointer events on the trigger element. A disabled button has `pointer-events: none`.
**Why it happens:** CSS `pointer-events: none` on disabled elements prevents tooltip trigger.
**How to avoid:** Wrap the disabled button in a `<span>` that receives the tooltip trigger, or use the existing `TooltipIcon` pattern with Popover instead.
**Warning signs:** Tooltip never appears when hovering/tapping disabled Navigate button.

## Code Examples

### Existing getGoogleMapsUrl (canvassing.ts lines 127-130)
```typescript
export function getGoogleMapsUrl(voter: VoterDetail): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
```

### Existing HouseholdCard address section (HouseholdCard.tsx lines 34-45)
```typescript
<a
  href={getGoogleMapsUrl(household.entries[0].voter)}
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-2 cursor-pointer min-h-11"
>
  <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
  <span className="text-lg font-semibold">{household.address}</span>
</a>
<p className="text-xs text-muted-foreground ml-7">
  Tap address to navigate
</p>
```

### Voter detail Registration Address card (voters/$voterId.tsx lines 236-287)
The "View on Map" link should be inserted after the `</dl>` closing tag inside the Registration Address `<CardContent>`, before the card closes. The voter object has the same `registration_*` fields.

### Walk list detail entries table ($walkListId.tsx lines 123-156)
Currently shows: sequence, voter_id, household_key, status, Knock button. The map link can be added as an additional column or icon, but note the entries data lacks address fields -- will need to handle this gap.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tappable address text | Dedicated Navigate button | Phase 36 | Clearer user intent, less accidental taps |
| No travel mode in URL | `&travelmode=walking` | Phase 36 | Google Maps opens with walking directions immediately |

**Google Maps URL format:** The `https://www.google.com/maps/dir/?api=1` format is the current official Maps URLs standard. It does NOT require an API key and works on all platforms (mobile app opens if installed, browser otherwise).

## Open Questions

1. **Walk list detail address data availability**
   - What we know: `useWalkListEntries` returns minimal fields (voter_id, household_key, sequence, status). No registration_* address fields visible in the entries table.
   - What's unclear: Whether `household_key` contains parseable address data, or if a separate voter fetch would be needed.
   - Recommendation: Check the API response. If address data is unavailable, either skip the map link on walk list detail OR use `household_key` as a best-effort address string. The context says "link on each entry's address" so some address data should be present or fetchable.

2. **Icon choice for Navigate button**
   - What we know: MapPin already imported in HouseholdCard. Options: Navigation2 (arrow pointing up-right, suggests "go here"), MapPin (location marker), Map (full map icon).
   - Recommendation: Use `Navigation2` for the Navigate button (conveys action/direction) and `MapPin` for the DoorListView icon button (conveys location). Use `ExternalLink` for admin text links.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test --grep "phase36"` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P36-01 | HouseholdCard shows Navigate button instead of tappable address | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | No - Wave 0 |
| P36-02 | Navigate button links to Google Maps with travelmode=walking | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | No - Wave 0 |
| P36-03 | Navigate button disabled when no address | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | No - Wave 0 |
| P36-04 | DoorListView rows have map icon button | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | No - Wave 0 |
| P36-05 | Voter detail has "View on Map" link | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x`
- **Per wave merge:** `cd web && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/phase36-navigate.spec.ts` -- covers P36-01 through P36-05
- [ ] Uses page.route() API mocking (established pattern from phases 32, 33, 35)

## Sources

### Primary (HIGH confidence)
- [Google Maps URLs - Get Started](https://developers.google.com/maps/documentation/urls/get-started) - URL parameter format, travelmode options
- Project source code: `web/src/types/canvassing.ts` lines 116-130 - existing getGoogleMapsUrl and formatAddress
- Project source code: `web/src/components/field/HouseholdCard.tsx` - current tappable address implementation
- Project source code: `web/src/components/field/DoorListView.tsx` - current door list row structure
- Project source code: `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` - voter detail registration address card
- Project source code: `web/src/routes/campaigns/$campaignId/canvassing/walk-lists/$walkListId.tsx` - walk list detail entries table

### Secondary (MEDIUM confidence)
- Google Maps URL architecture guide verified URL format and cross-platform behavior

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already in use in project
- Architecture: HIGH - straightforward UI changes to existing components
- Pitfalls: HIGH - identified from direct code review of existing implementations

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- no external dependencies changing)
