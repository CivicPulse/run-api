# Phase 36: Google Maps Navigation Link for Canvassing - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing Google Maps navigation link in the canvassing wizard and extend navigation links to additional locations (DoorListView, voter detail, walk list detail). The basic `getGoogleMapsUrl()` function and tappable address already exist from Phase 31 — this phase upgrades the UX with a dedicated button, adds walking mode, and propagates navigation links across the app.

</domain>

<decisions>
## Implementation Decisions

### Platform & URL strategy
- Google Maps only — no Apple Maps or Waze detection
- Standard web URL (`google.com/maps/dir/?api=1`) — no platform-specific intent URIs
- Destination-only — no origin parameter; Google Maps auto-uses device GPS
- Walking directions by default (`&travelmode=walking`) since canvassers are on foot
- Address-based (not lat/long) per existing project feedback

### Navigation button UX (HouseholdCard)
- Replace current tappable address text with a dedicated full-width outline button below the address
- Address displayed as header text (plain, non-interactive), Navigate button below it
- Button text: "Navigate to Address" with map icon (Navigation/MapPin from lucide)
- Button style: `variant="outline"`, full width, 44px minimum height
- No visual feedback on tap — OS handles the transition to Google Maps
- Remove the "Tap address to navigate" hint text (no longer needed with explicit button)

### DoorListView navigation
- Each row in the All Doors list gets a small icon button (MapPin) at the end
- 44px touch target on the icon button
- Opens same Google Maps URL pattern as the HouseholdCard button

### Admin-side navigation (voter detail, walk list detail)
- Small "View on Map" text link with external-link icon (↗) near the address
- Simpler treatment than field mode — admin pages aren't mobile-first
- Voter detail page: link below registration address
- Walk list detail page: link on each entry's address

### Missing address handling
- Best-effort URL construction — build with whatever address components exist
- Disable Navigate button only if ALL address fields are null/empty
- Tooltip on disabled button: "No address available"

### Link behavior
- Opens in new tab (`target="_blank"`) — wizard stays in background
- No confirmation dialog — Zustand persist ensures no state loss
- No toast or loading state on tap

### Claude's Discretion
- Exact Lucide icon choice (Navigation2 vs MapPin vs Map)
- Button placement relative to address header (spacing, margins)
- How to refactor `getGoogleMapsUrl` to accept address string or voter object
- Walk list detail page layout for the navigation links
- ARIA label text for the Navigate button

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing navigation implementation
- `web/src/types/canvassing.ts` — `getGoogleMapsUrl()` and `formatAddress()` functions (lines 116-130)
- `web/src/components/field/HouseholdCard.tsx` — Current tappable address link implementation

### Field mode components
- `web/src/components/field/DoorListView.tsx` — All Doors list view (needs nav icon per row)
- `web/src/routes/field/$campaignId/canvassing.tsx` — Canvassing wizard route

### Admin pages
- `web/src/routes/campaigns/$campaignId/canvassing/walk-lists/` — Walk list detail pages
- `web/src/components/voters/` — Voter detail components

### Prior context
- `.planning/phases/31-canvassing-wizard/31-CONTEXT.md` — Original canvassing decisions including "Address is tappable — opens Google Maps navigation link using street address"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getGoogleMapsUrl(voter)`: Already builds Google Maps directions URL from voter address — needs `&travelmode=walking` parameter added
- `formatAddress(voter)`: Extracts registration address fields into display string — reusable for all placements
- `MapPin` from lucide-react: Already imported in HouseholdCard
- shadcn/ui `Button`: outline variant with `min-h-11` pattern used throughout field mode
- `TooltipIcon` component: Can be used for disabled button tooltip

### Established Patterns
- Field mode buttons use `min-h-11` (44px) for WCAG 2.5.5 compliance
- External links use `target="_blank" rel="noopener noreferrer"`
- Icon buttons in lists follow the pattern from DoorListView row actions

### Integration Points
- `HouseholdCard.tsx`: Replace `<a>` tag wrapping address with plain text + Button below
- `DoorListView.tsx`: Add icon button to each row
- `VoterDetail` page: Add "View on Map" link near registration address section
- Walk list detail: Add link per entry address
- `canvassing.ts`: Update `getGoogleMapsUrl` to include `travelmode=walking`

</code_context>

<specifics>
## Specific Ideas

- Walking mode is the right default since canvassers are literally going door to door on foot
- The dedicated button should feel like a clear, intentional action — not an accidental tap on the address text
- Admin-side links should be subtle (text link) since managers are at a desk, not in the field

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 36-google-maps-navigation-link-for-canvassing*
*Context gathered: 2026-03-16*
