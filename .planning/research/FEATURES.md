# Feature Landscape: Volunteer Field Mode

**Domain:** Campaign field operations -- mobile-first volunteer experience for canvassing and phone banking
**Researched:** 2026-03-15
**Overall confidence:** HIGH (established domain with mature competitors like MiniVAN, Ecanvasser, Qomon; existing backend APIs cover 90%+ of needed functionality)

## Table Stakes

Features volunteers expect from any modern field app. Missing = volunteers confused, slower, or abandon the app.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| **Volunteer landing/hub page** | Volunteers need a single entry point that shows their active assignment and routes them to canvassing or phone banking. Every competitor (MiniVAN, Ecanvasser, Qomon) starts with a "my assignments" view | Low | Existing shift/volunteer APIs, walk list canvasser assignments, session caller assignments | Query shifts where user is signed up + active, then route based on shift type (canvassing vs phone banking) |
| **Linear canvassing wizard** | MiniVAN, Ecanvasser, and every competitor uses a step-by-step flow: see address -> knock -> record outcome -> next. Volunteers should never choose what to do next | Med | Existing walk list entries (sequenced), door-knock recording API, survey engine | State machine: `loading -> at_door -> recording -> surveying -> next`. Reuse existing `WalkListEntry` sequence ordering |
| **Door-knock outcome buttons** | Large, tappable outcome buttons (Not Home, Contact, Refused, etc.) replace the current dropdown Select. Field conditions demand one-tap recording | Low | Existing `DoorKnockCreate` schema, `CanvassService.record_door_knock()` | Current DoorKnockDialog uses a Select dropdown -- field mode needs big tap-friendly buttons instead |
| **Phone banking tap-to-call** | `tel:` links that invoke the native dialer. Every phone banking app does this. Volunteers should not copy-paste numbers | Low | Existing call list entries with `phone_numbers` array | Simple `<a href="tel:+1XXXXXXXXXX">` link. Phone OS shows confirmation before dialing. Already have phone data in ClaimEntry response |
| **Phone banking call flow** | Claim entry -> see voter info -> tap to call -> record outcome -> inline survey -> next voter. Must mirror existing ActiveCallingPage but mobile-optimized | Med | Existing `PhoneBankService.claim_entries_for_session()`, `record_call()`, survey question API | Current call.tsx already has the state machine (idle/claiming/claimed/recording/recorded/complete). Refactor to mobile-stacked layout |
| **Inline survey after contact** | Survey questions appear inline after "Contact Made" or "Answered" outcomes, not in a separate screen. Matches MiniVAN and all competitors | Low | Existing `SurveyPanel` component, `/surveys/{id}/questions` API | Already built in call.tsx's SurveyPanel. Reuse with mobile-responsive layout. Walk list needs `script_id` wired through |
| **Progress indicator** | "You've completed 12 of 45 doors" or "15 calls made". Volunteers need to see progress. MiniVAN shows milestone prompts at 25%, 50%, 75%, 100% | Low | Existing `walk_list.visited_entries/total_entries`, `SessionProgressResponse` | Simple fraction/percentage bar. Data already available from existing APIs |
| **Mobile-optimized touch targets** | Minimum 44x44px (WCAG 2.1 AAA) / 48x48dp (Material Design) tap targets. Field use = gloves, sunlight, walking. Research shows targets smaller than 44px have 3x higher error rates | Low | None (CSS/layout concern) | Apple recommends 44pt, Google recommends 48dp. Current admin UI uses standard shadcn sizes which are too small for field use |
| **Session start/stop controls** | Volunteers need clear "Start Canvassing" / "I'm Done" buttons. Phone banking needs "Start Calling" / "End Session" | Low | Existing session lifecycle APIs (check-in/check-out for phone banking) | Phone banking has check_in/check_out. Canvassing walk list has no session concept -- volunteer just works through entries |
| **Back-to-hub navigation** | Clear way to return to the volunteer hub from any point in the flow. Prevents volunteers feeling trapped in a wizard | Low | None (routing concern) | Persistent header with back arrow or "Exit" button |

## Differentiators

Features that set the product apart. Not expected by volunteers, but valued by campaign managers and improve field effectiveness.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| **Guided onboarding tour** | First-time volunteers get a step-by-step overlay tour explaining each screen. Eliminates training sessions -- "zero-training UX" is a stated project goal. MiniVAN requires in-person training; this replaces that entirely | Med | Canvassing wizard and/or phone banking mode must exist first (screens to tour) | Use react-joyride (5.1k GitHub stars, mature) or @reactour/tour (2.8k stars, newer API). Store tour completion in localStorage per user. "Revisit tour" option accessible from help button |
| **Contextual tooltips / help** | Persistent `?` icons or info badges that explain what each button does. Goes beyond onboarding tour for ongoing reference | Low | None (frontend-only) | shadcn Tooltip component already available. Add help text to outcome buttons, progress indicators, nav elements |
| **Progressive disclosure** | Show only what's needed at each step. Hide survey until outcome recorded. Hide "next" until current door complete. Reduces cognitive load for untrained volunteers | Low | None (UX pattern) | Already partially implemented in phone banking state machine. Canvassing wizard needs the same pattern |
| **Household grouping in canvass flow** | When multiple voters share an address, present them together: "3 voters at 123 Main St" with individual outcome recording per voter. MiniVAN does this | Med | Existing `household_key` on `WalkListEntry`, entries already sorted by street address | Group consecutive entries with same `household_key`. Show household card with individual voter sub-cards. Existing data supports this fully |
| **Voter context card** | Show voter name, party, age, voting history, propensity scores before the door knock. Helps volunteers have informed conversations | Low | Existing voter model with 22+ columns, voter detail API | Compact mobile card component. Data already exists -- needs lightweight fetch by voter_id from walk list entry |
| **Milestone celebrations** | Toast/modal when volunteer hits 25%, 50%, 75%, 100% completion. MiniVAN does this at checkpoints. Gamification increases volunteer retention | Low | Existing progress data from walk list stats and session progress | Simple percentage check after each recorded outcome. Show celebratory toast |
| **Auto-advance timer** | After recording an outcome, auto-advance to next door/voter after 2-3 seconds with cancel option. Reduces taps per voter | Low | None (frontend timer) | Show countdown with "Go Now" and "Wait" buttons after outcome recording |
| **Address link to native maps** | Each door/address in the canvassing wizard includes a link that opens Google Maps / Apple Maps for walking directions | Low | Existing voter address data (registration_line1, city, state, zip) | `https://maps.google.com/?q=ADDRESS` or `https://maps.apple.com/?q=ADDRESS` -- deep links to native maps apps |

## Anti-Features

Features to explicitly NOT build for v1.4. Either out of scope, premature, or harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Offline mode / service worker** | Requires IndexedDB queue, conflict resolution, sync engine. Massive complexity for a web app. MiniVAN requires manual sync; campaign areas typically have cellular coverage | Note in docs that cellular data is required. The app works as a standard web app. Revisit only if real-world usage shows connectivity gaps |
| **Native mobile app** | Explicitly out of scope per PROJECT.md. PWA/responsive web is sufficient for field use | Responsive web with proper viewport, touch targets, and mobile-first CSS. Add `manifest.json` for "Add to Home Screen" capability |
| **Predictive dialer / auto-dial** | Requires Twilio/TCPA/FCC compliance, telephony infrastructure. Explicitly out of scope | `tel:` links that invoke the native phone dialer. Volunteer manually taps to call. Simple, legal, no infrastructure |
| **GPS turn-by-turn navigation** | Requires mapping SDK license, complex routing algorithms, real-time position tracking | Link to Google Maps/Apple Maps with the next address as destination. Let the native maps app handle navigation |
| **Interactive map view** | Requires map library (Mapbox GL JS or Leaflet), GPS integration, pin rendering, performance optimization for hundreds of pins. High complexity for v1.4 | Defer to v1.5. Address links to native maps provide navigation. The linear wizard sequence is the primary navigation paradigm |
| **Real-time supervisor dashboard** | WebSocket infrastructure explicitly out of scope. SSE could work but adds backend complexity | Existing polling-based dashboard APIs are sufficient. Supervisor refreshes to see updates |
| **Chat/messaging between volunteers** | Scope creep. Not a field operations tool feature | Campaign can use Signal, Slack, or text messages for coordination |
| **Photo/document capture** | Camera integration, image storage, moderation pipeline. Different product category | Notes field is sufficient for recording qualitative observations |
| **Voice recording of conversations** | Legal minefield (two-party consent states), storage costs, privacy concerns | Survey responses and notes capture the structured data campaigns need |
| **Gamification leaderboards** | Competitive metrics can create perverse incentives (rushing through doors, fabricating contacts) | Individual progress only. "You've completed 30 of 45" without comparing to other volunteers |
| **Complex volunteer self-assignment** | Letting volunteers pick their own walk lists or phone bank sessions creates coordination problems -- two volunteers could pick the same turf | Managers assign volunteers to shifts; shifts link to turfs/sessions. The hub page shows what the volunteer is already assigned to |

## Feature Dependencies

```
Volunteer Hub Page
  -> requires: existing volunteer/shift APIs (already built)
  -> requires: "my active assignments" query (new lightweight API endpoint)
  -> enables: Canvassing Wizard, Phone Banking Mode

Canvassing Wizard
  -> requires: Volunteer Hub Page (entry point)
  -> requires: walk list entries API with sequence ordering (already built)
  -> requires: door-knock recording API (already built)
  -> requires: survey questions API (already built)
  -> uses: household_key grouping (data already exists)
  -> uses: voter detail data (API already exists)

Phone Banking Mode (Mobile)
  -> requires: Volunteer Hub Page (entry point)
  -> requires: claim entry API with SKIP LOCKED (already built)
  -> requires: record call API (already built)
  -> requires: tel: link support (browser-native, zero implementation)
  -> uses: survey questions API (already built)

Guided Onboarding Tour
  -> requires: Canvassing Wizard and/or Phone Banking Mode (screens to tour)
  -> independent of backend: localStorage-based, no API changes

Contextual Tooltips
  -> independent: can be added to any screen at any time
  -> pairs with: Onboarding Tour (tour points to same elements tooltips explain)

Progress Indicators
  -> requires: existing walk list stats / session progress APIs (already built)
  -> enables: Milestone Celebrations

Milestone Celebrations
  -> requires: Progress Indicators (percentage tracking)
```

## MVP Recommendation

### Must Build (v1.4 core)

1. **Volunteer Hub Page** -- Entry point that detects active assignment and routes volunteer. Without this, volunteers cannot find their way to the field experience. New lightweight API endpoint: `GET /campaigns/{id}/my-assignments` returns active shift + linked walk list or phone bank session. Low complexity.

2. **Canvassing Wizard** -- Linear step-by-step flow replacing the admin walk list detail table for volunteers. State machine: `loading -> at_door -> knocking -> surveying -> advancing -> at_door`. Reuses 100% of existing backend APIs (`WalkListService.get_entries`, `CanvassService.record_door_knock`, survey questions endpoint). No new backend work beyond the hub endpoint. Medium complexity.

3. **Phone Banking Mobile Mode** -- Mobile-responsive version of existing ActiveCallingPage. Add `tel:` link for tap-to-call. Reuse existing state machine and all backend APIs (`claim_entries_for_session`, `record_call`). Layout changes only -- stack panels vertically instead of side-by-side. Medium complexity.

4. **Mobile-first layout and touch targets** -- 48px minimum touch targets, stacked vertical layout, large outcome buttons, high-contrast text. Applies across all field mode screens. Low complexity (CSS/layout).

5. **Progress indicator** -- Simple bar/fraction on each screen header. Data already available from existing APIs. Low complexity.

### Should Build (v1.4 polish)

6. **Guided onboarding tour** -- react-joyride overlay. Runs once on first visit, skippable, re-triggerable from help button. Frontend-only, no backend changes. Medium complexity.

7. **Contextual tooltips** -- `?` icons with explanations on outcome buttons, progress bar, navigation. Pairs naturally with the tour. Low complexity.

8. **Household grouping in canvass wizard** -- Group entries by `household_key`, show "3 voters at this address" card. Data already exists and is already sorted by street. Medium complexity.

9. **Voter context card** -- Compact card showing name, party, age, propensity before the knock. Needs voter data joined to walk list entries (existing voter detail API or enriched entry response). Low complexity.

### Defer (v1.5+)

- **Interactive map view** -- High complexity (map SDK, GPS, pin rendering). Valuable but not required for functional field mode. Address links to Google Maps serve as workaround.
- **Offline mode** -- Massive infrastructure investment (service worker, IndexedDB, sync). Not justified until real-world usage data shows connectivity issues.
- **Auto-advance timer** -- Nice polish but low priority. Can be added later without architectural changes.
- **Milestone celebrations** -- Fun but not essential. Can layer on after core wizard flow is stable.

## Existing API Surface (No Backend Changes Needed)

The following existing endpoints fully support the volunteer field mode frontend:

| API | Used By | Status |
|-----|---------|--------|
| `GET /campaigns/{id}/walk-lists/{id}` | Canvassing wizard -- walk list metadata + progress stats | Already built |
| `GET /campaigns/{id}/walk-lists/{id}/entries` | Canvassing wizard -- sequenced entries with household_key, voter_id, status | Already built |
| `POST /campaigns/{id}/walk-lists/{id}/door-knocks` | Canvassing wizard -- record knock outcome, updates entry status + walk list stats | Already built |
| `GET /campaigns/{id}/surveys/{id}/questions` | Both modes -- survey questions for inline survey after contact | Already built |
| `POST /campaigns/{id}/phone-banks/{id}/claim` | Phone banking -- claim next voter with SKIP LOCKED | Already built |
| `POST /campaigns/{id}/phone-banks/{id}/calls` | Phone banking -- record call outcome with survey responses | Already built |
| `POST /campaigns/{id}/phone-banks/{id}/release/{entry_id}` | Phone banking -- skip/release entry | Already built |
| `GET /campaigns/{id}/phone-banks/{id}/progress` | Phone banking -- session progress stats | Already built |
| `GET /campaigns/{id}/shifts` | Volunteer hub -- list shifts (filterable) | Already built |
| `GET /campaigns/{id}/volunteers` | Volunteer hub -- volunteer record lookup | Already built |

### New Backend Work Required

| Endpoint | Purpose | Complexity |
|----------|---------|------------|
| `GET /campaigns/{id}/my-assignments` | Return current user's active assignment: active shift + linked walk list (canvassing) or phone bank session (phone banking). Joins `shift_volunteers` -> `shifts` -> resource IDs, filters by user_id and active status | Low |
| Enrich walk list entries with voter name/address | Canvassing wizard needs to display "John Smith, 123 Main St" without a separate voter fetch per entry. Join `Voter` table in `get_entries` query, add `voter_name` and `voter_address` fields to `WalkListEntryResponse` schema | Low |

## Sources

- [MiniVAN Canvassing Guide (NGP VAN)](https://www.ngpvan.com/blog/canvassing-with-minivan/) -- industry standard workflow reference
- [MiniVAN Mobile Canvassing Guide (Indivisible)](https://indivisible.org/resource/minivan/) -- volunteer-facing UX patterns
- [MiniVAN Canvassing (Progress Wiki)](https://wiki.staclabs.io/en/VAN/mini-van-canvassing) -- detailed canvassing workflow
- [Understanding Canvassing Apps (Qomon)](https://qomon.com/blog/understanding-canvassing-apps) -- feature landscape overview
- [Ecanvasser Platform](https://www.ecanvasser.com/) -- competitor feature set, offline mode
- [Phone Banking Setup (Ecanvasser)](https://www.ecanvasser.com/blog/phonebanking) -- phone banking UX patterns
- [Phone Banking Guide (Solidarity Tech)](https://www.solidarity.tech/how-to-run-a-phonebank) -- volunteer UX best practices
- [Phone Banking Volunteer Guide (The Commons)](https://commonslibrary.org/tips-for-phonebanking-or-calling-volunteers/) -- phone banking volunteer tips
- [WCAG 2.5.5 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) -- 44x44px minimum touch targets
- [Accessible Tap Target Sizes (Smashing Magazine)](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/) -- mobile accessibility guide with research data
- [React Joyride (GitHub)](https://github.com/gilbarbara/react-joyride) -- 5.1k stars, recommended tour library
- [Reactour (docs)](https://docs.react.tours/) -- alternative tour library, 2.8k stars
- [5 Best React Onboarding Libraries 2026 (OnboardJS)](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) -- library comparison
- [Click-to-Call Implementation (firt.dev)](https://firt.dev/click-to-call) -- tel: link best practices
- [Best Canvassing Apps for GOTV (Reach)](https://reach.vote/best-canvassing-apps-for-gotv/) -- competitor comparison
