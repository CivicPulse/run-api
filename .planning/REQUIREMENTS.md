# Requirements: CivicPulse Run API v1.4

**Defined:** 2026-03-15
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.4 Requirements

### Field Layout & Navigation

- [ ] **NAV-01**: Volunteer sees a dedicated field mode layout with no sidebar or admin navigation
- [ ] **NAV-02**: Volunteer sees an assignment-aware landing page that routes to canvassing or phone banking
- [ ] **NAV-03**: Volunteer can navigate back to the landing hub from any field screen
- [ ] **NAV-04**: Volunteer sees a persistent help button to replay the guided tour

### Canvassing Wizard

- [ ] **CANV-01**: Volunteer sees the next address to visit with voter name, party, and propensity context
- [ ] **CANV-02**: Volunteer records a door-knock outcome via large touch-target buttons (Not Home, Contact, Refused, etc.)
- [ ] **CANV-03**: Volunteer advances to the next door automatically after recording an outcome
- [ ] **CANV-04**: Volunteer sees a progress indicator (e.g., "12 of 47 doors")
- [ ] **CANV-05**: Volunteer can answer inline survey questions after a contact outcome (skippable)
- [ ] **CANV-06**: Volunteer sees multiple voters at the same address grouped by household
- [ ] **CANV-07**: Volunteer's wizard state persists across phone interruptions and app switching
- [ ] **CANV-08**: Volunteer sees a resume prompt when returning to an interrupted session

### Phone Banking

- [ ] **PHONE-01**: Volunteer starts and stops a phone banking session with obvious controls
- [ ] **PHONE-02**: Volunteer taps a phone number to initiate a call via native dialer (tel: link)
- [ ] **PHONE-03**: Volunteer records call outcome via large touch-target buttons after a call
- [ ] **PHONE-04**: Volunteer can answer inline survey questions after a contact outcome (skippable)
- [ ] **PHONE-05**: Volunteer sees session progress (calls completed / remaining)
- [ ] **PHONE-06**: Volunteer can copy a phone number to clipboard as fallback when tel: is unsupported
- [ ] **PHONE-07**: Phone numbers are formatted to E.164 for dialing and display-formatted for reading

### Onboarding & Help

- [ ] **TOUR-01**: Volunteer sees a guided step-by-step tour on first visit to field mode
- [ ] **TOUR-02**: Tour is split into segments (welcome, canvassing, phone banking) that run contextually
- [ ] **TOUR-03**: Tour completion state persists so it only runs once per volunteer per campaign
- [ ] **TOUR-04**: Volunteer can replay the tour at any time via the help button
- [ ] **TOUR-05**: Volunteer sees contextual tooltip icons on key actions explaining what they do
- [ ] **TOUR-06**: Volunteer sees brief quick-start instructions before beginning canvassing or phone banking

### Offline & Sync

- [ ] **SYNC-01**: Volunteer can record door-knock outcomes while offline; they queue locally
- [ ] **SYNC-02**: Queued interactions automatically sync when connectivity resumes
- [ ] **SYNC-03**: Volunteer sees a visible offline indicator when connectivity is lost
- [ ] **SYNC-04**: Volunteer receives updated walk list status (houses contacted by others) when connectivity resumes
- [ ] **SYNC-05**: Volunteer can record phone banking outcomes while offline; they queue locally

### Accessibility

- [ ] **A11Y-01**: All field mode screens are navigable via screen reader (ARIA labels, roles, live regions)
- [ ] **A11Y-02**: All interactive elements meet WCAG 2.5.5 minimum touch target size (44x44px)
- [ ] **A11Y-03**: All field mode screens have sufficient color contrast (WCAG AA minimum)
- [ ] **A11Y-04**: Canvassing wizard state transitions are announced to screen readers via live regions
- [ ] **A11Y-05**: Phone banking caller info and outcome buttons are accessible without visual context

### Polish & Celebrations

- [ ] **POLISH-01**: Volunteer sees milestone celebration toasts at 25%, 50%, 75%, and 100% completion
- [ ] **POLISH-02**: Voter context card shows name, party, age, and propensity before each interaction
- [ ] **POLISH-03**: All field mode elements have minimum 44px touch targets verified via audit

## Future Requirements

### v1.5 Candidates

- **MAP-01**: Interactive map view showing walk list pins and volunteer position
- **OFFLINE-01**: Full offline-first mode with IndexedDB storage and conflict resolution
- **AUTO-01**: Auto-advance timer between calls in phone banking
- **NOTIF-01**: Push notifications for shift reminders and assignment updates

## Out of Scope

| Feature | Reason |
|---------|--------|
| Interactive map view | Requires map SDK, GPS integration; address links to Google/Apple Maps sufficient for v1.4 |
| Full offline-first / service worker | IndexedDB + sync engine + conflict resolution is a separate effort; basic queue covers intermittent signal |
| Native mobile app / PWA wrapper | Out of scope per PROJECT.md |
| Auto-advance timer | No architectural dependency; layer on after core flow stable |
| Predictive dialer integration | Requires Twilio/TCPA/FCC compliance per PROJECT.md |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | — | Pending |
| NAV-02 | — | Pending |
| NAV-03 | — | Pending |
| NAV-04 | — | Pending |
| CANV-01 | — | Pending |
| CANV-02 | — | Pending |
| CANV-03 | — | Pending |
| CANV-04 | — | Pending |
| CANV-05 | — | Pending |
| CANV-06 | — | Pending |
| CANV-07 | — | Pending |
| CANV-08 | — | Pending |
| PHONE-01 | — | Pending |
| PHONE-02 | — | Pending |
| PHONE-03 | — | Pending |
| PHONE-04 | — | Pending |
| PHONE-05 | — | Pending |
| PHONE-06 | — | Pending |
| PHONE-07 | — | Pending |
| TOUR-01 | — | Pending |
| TOUR-02 | — | Pending |
| TOUR-03 | — | Pending |
| TOUR-04 | — | Pending |
| TOUR-05 | — | Pending |
| TOUR-06 | — | Pending |
| SYNC-01 | — | Pending |
| SYNC-02 | — | Pending |
| SYNC-03 | — | Pending |
| SYNC-04 | — | Pending |
| SYNC-05 | — | Pending |
| A11Y-01 | — | Pending |
| A11Y-02 | — | Pending |
| A11Y-03 | — | Pending |
| A11Y-04 | — | Pending |
| A11Y-05 | — | Pending |
| POLISH-01 | — | Pending |
| POLISH-02 | — | Pending |
| POLISH-03 | — | Pending |

**Coverage:**
- v1.4 requirements: 38 total
- Mapped to phases: 0
- Unmapped: 38 ⚠️

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after initial definition*
