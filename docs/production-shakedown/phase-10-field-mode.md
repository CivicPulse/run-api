# Phase 10: Field Mode (Mobile Volunteer Scenarios)

**Prefix:** `FIELD`
**Depends on:** phase-00, phase-04, phase-06, phase-07, phase-08
**Estimated duration:** 60 min
**Agents required:** 1

## Purpose

**This is the user-facing moment of truth.** Prove that a volunteer can pick up a phone, log in, grab an assignment, work door-to-door or through call lists — **including stretches where their connection drops** — and that every knock and call they recorded comes back when the network returns. No silent drops. No duplicated writes. No confusing UI states.

The field experience is not a degraded desktop experience. It is purpose-built for the context: large touch targets, glanceable status, offline-aware patterns, reduced cognitive load. This phase exercises that experience end-to-end at production scale.

## Scenario narrative

The canonical story this phase proves:

> Maria (qa-volunteer) opens her phone at 9:00 AM. She signs in, lands on the field hub, sees two assignments — a canvassing walk list and a phone-banking session. She drives to the neighborhood, starts canvassing, records 3 door knocks. The neighborhood has a dead zone — she records 5 more knocks offline. When she returns to cell coverage, every queued knock syncs and she gets 5 success toasts. She opens phone banking in the afternoon, makes 4 calls, records outcomes + survey answers. The app briefly flaps offline during call 3 — it queues and syncs. At the end of the day, she checks the server — every knock and call is there.

## Threat model / failure modes covered

- **Offline data loss** — did any record fail to make it back to the server?
- **Double-writes** — did any record get sent twice during retry?
- **Stale UI** — did the map/list refresh after sync?
- **Queue pileup** — does the queue drain or stall when 100+ items backlog?
- **Token expiry mid-sync** — what happens when a 401 comes back on replay?
- **Conflict on replay** — what happens when a voter already has a knock recorded?
- **Resume state** — if the app closes mid-session, can the volunteer pick up where they left off?
- **Role boundary** — can a viewer sneak into field mode?
- **Mobile viewport parity** — do the touch targets meet WCAG AAA on real phone sizes?

## Prerequisites

- Phase 00 complete: Org A + campaign + 5 test users exist
- Phase 04 complete: Campaign lifecycle proven
- Phase 06 complete: At least one turf, one walk list with entries, canvassers assigned (including `qa-volunteer@civpulse.org`)
- Phase 07 complete: At least one call list, one phone bank session claimable by qa-volunteer
- Phase 08 complete: At least one survey script attached to the walk list or session
- `${TOKEN_VOLUNTEER_A}` for API probes (see README.md § Obtaining a JWT)
- `${ORG_A_CAMPAIGN_ID}` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`
- Chromium via Playwright, or Chrome DevTools MCP (chrome-devtools-mcp), or real browser with DevTools open
- `${ORG_A_WALK_LIST_ID}` — a walk list assigned to qa-volunteer (from phase-06 results)
- `${ORG_A_SESSION_ID}` — a phone-bank session assigned/claimable by qa-volunteer (from phase-07 results)

---

## Class 1: Field hub entry & redirect

### FIELD-HUB-01 | Volunteer login redirects to field hub

**Purpose:** Confirm `qa-volunteer` lands on `/field/${ORG_A_CAMPAIGN_ID}` after auth, not `/campaigns` or `/org`.

**Steps:**
1. Open a fresh incognito browser context (no prior session/cookies).
2. Navigate to `https://run.civpulse.org`.
3. Log in as `qa-volunteer@civpulse.org` / `${VOLUNTEER_A_PASSWORD}` via ZITADEL.
4. Wait for redirect to complete.

```js
// Playwright
const { chromium } = require('playwright')
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext()
const p = await ctx.newPage()
await p.goto('https://run.civpulse.org')
await p.locator('input').first().fill('qa-volunteer@civpulse.org')
await p.getByRole('button', { name: /continue/i }).click()
await p.locator('input[type=password]').fill(process.env.VOLUNTEER_A_PASSWORD)
await p.getByRole('button', { name: /continue/i }).click()
await p.waitForURL(/\/field\//, { timeout: 15000 })
console.log('URL:', p.url())
```

**Expected:** Final URL matches `/field/{campaignId}` (volunteer post-login callback per `app/api/v1/auth.py` callback logic).

**Pass criteria:** URL contains `/field/` AND contains a valid campaign UUID.

---

### FIELD-HUB-02 | Field hub shows assignment cards

**Steps:** Continuing FIELD-HUB-01, wait for hub content.

```js
await p.waitForSelector('[data-testid="field-hub"], h1:has-text("Field")', { timeout: 10000 })
const cards = await p.locator('[data-testid="assignment-card"]').count()
console.log('assignment cards:', cards)
```

**Expected:** At least 1 assignment card visible — one per assigned walk list and/or phone-bank session.

**Pass criteria:** `cards >= 1`. Each card shows name + type (canvassing or phone banking) + entry/call counts.

---

### FIELD-HUB-03 | Pull-to-refresh reloads assignments

**Steps:**
1. On the field hub, trigger a refresh (keyboard F5, pull-to-refresh gesture, or refresh button).
2. Watch network tab for a fresh `GET /api/v1/campaigns/{id}/walk-lists` and/or `/phone-banks` call.

```js
const [req] = await Promise.all([
  p.waitForRequest(/walk-lists|phone-banks/, { timeout: 5000 }),
  p.reload(),
])
console.log('refreshed via:', req.url())
```

**Expected:** Fresh HTTP 200 response with assignments list.

**Pass criteria:** Network call observed, response 200, cards still visible post-refresh.

---

### FIELD-HUB-04 | Welcome tour auto-triggers for first-time volunteer

**Purpose:** Confirm tour state tracked in `useTourStore` plays once.

**Steps:**
1. Clear tour state in localStorage before login:

```js
await p.evaluate(() => localStorage.removeItem('tour-storage'))
await p.reload()
```
2. Observe welcome tour overlay appears on field hub.
3. Dismiss tour.
4. Inspect `localStorage['tour-storage']` after dismissal.

```js
const tour = await p.evaluate(() => JSON.parse(localStorage.getItem('tour-storage') || '{}'))
console.log('tour state:', JSON.stringify(tour, null, 2))
```

**Expected:** `state.completedTours` or `state.sessionCounts` reflects the welcome tour has been shown.

**Pass criteria:** Tour overlay appears on first load; persisted state shows welcome tour marked dismissed/seen.

---

### FIELD-HUB-05 | Empty state when no assignments

**Purpose:** Volunteer with no assigned work sees helpful empty state.

**Steps:**
1. Via `${TOKEN_OWNER_A}`, temporarily un-assign qa-volunteer from all walk lists + phone banks:
```bash
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN_OWNER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers/$VOLUNTEER_USER_ID"
```
2. Log in as qa-volunteer, navigate to `/field/$ORG_A_CAMPAIGN_ID`.
3. Observe UI.

**Expected:** EmptyState component renders with guidance ("No assignments yet" or similar) and no crash.

**Pass criteria:** No cards rendered; EmptyState visible; no console errors.

**Cleanup:** Re-assign qa-volunteer:
```bash
curl -sS -X POST -H "Authorization: Bearer $TOKEN_OWNER_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_ids\":[\"$VOLUNTEER_USER_ID\"]}" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers"
```

---

### FIELD-HUB-06 | OfflineBanner reflects connectivity state

**Steps:**
1. On the field hub, verify no offline banner.
2. Toggle offline:
```js
await ctx.setOffline(true)
await p.waitForTimeout(1000)
```
3. Observe OfflineBanner appears.
4. Toggle back online:
```js
await ctx.setOffline(false)
```

**Expected:** Banner visible exactly when `navigator.onLine === false`.

**Pass criteria:** Banner appears on offline toggle within 2s; disappears on reconnect.

---

## Class 2: Field canvassing (online path)

### FIELD-CANV-01 | Navigate to /field/{id}/canvassing

**Steps:**
1. From hub, click the canvassing assignment card (or navigate directly).
2. Wait for URL to match `/field/${ORG_A_CAMPAIGN_ID}/canvassing`.

```js
await p.locator('[data-testid="assignment-card"]').filter({ hasText: /canvass/i }).first().click()
await p.waitForURL(/\/canvassing/, { timeout: 10000 })
```

**Expected:** Canvassing route loads, no 4xx/5xx.

**Pass criteria:** URL match + network returns 200 for walk list fetch.

---

### FIELD-CANV-02 | CanvassingMap renders with household markers

**Steps:**
1. Wait for Leaflet map to mount.
2. Count markers on map.

```js
await p.waitForSelector('.leaflet-container', { timeout: 15000 })
const markers = await p.locator('.leaflet-marker-icon').count()
console.log('markers:', markers)
```

**Expected:** Map tile layer rendered; at least 1 household marker visible.

**Pass criteria:** `markers >= 1`; no "Map failed to load" error.

---

### FIELD-CANV-03 | Click household shows voter card

**Steps:**
1. Click the first marker.
2. Confirm voter card / detail panel opens.

```js
await p.locator('.leaflet-marker-icon').first().click()
await p.waitForSelector('[data-testid="voter-card"], [data-testid="door-card"]', { timeout: 5000 })
```

**Expected:** Card shows voter name, address, phone (if present), and outcome buttons.

**Pass criteria:** Voter card visible with populated data.

---

### FIELD-CANV-04 | Record door knock outcome: "home"

**Steps:**
1. With voter card open, click the "Home" outcome button.
2. Watch network tab for `POST /api/v1/campaigns/{id}/walk-lists/{id}/door-knocks`.

```js
const [resp] = await Promise.all([
  p.waitForResponse(/door-knocks/, { timeout: 5000 }),
  p.getByRole('button', { name: /^home$/i }).click(),
])
console.log('status:', resp.status())
```

**Expected:** HTTP 201 response; UI confirms success (toast or card updates).

**Pass criteria:** 201 status; voter card advances or marker updates visibly.

---

### FIELD-CANV-05 | Record each outcome type

**Steps:** Advance to next household and try each outcome in sequence: `home`, `moved`, `not_home`, `refused`, `other`.

For each:
```js
const [resp] = await Promise.all([
  p.waitForResponse(/door-knocks/),
  p.getByRole('button', { name: new RegExp(outcome, 'i') }).click(),
])
```

**Expected:** Each returns 201 with the correct `outcome` field in payload.

**Pass criteria:** 5/5 outcomes accepted.

---

### FIELD-CANV-06 | InlineSurvey renders post-outcome (if script attached)

**Purpose:** When the walk list has a survey script, the InlineSurvey should render after a "home" outcome.

**Steps:**
1. Ensure walk list has survey attached (from phase-08).
2. Record "home" outcome on a household.
3. Look for inline survey component.

```js
const survey = await p.locator('[data-testid="inline-survey"]').isVisible()
console.log('survey visible:', survey)
```

**Expected:** InlineSurvey appears with questions from the attached script.

**Pass criteria:** Survey component visible when outcome=home AND script attached.

---

### FIELD-CANV-07 | Submit survey answers saves to API

**Steps:**
1. With survey visible, answer all questions.
2. Click submit.
3. Watch for survey-response POST.

```js
const [resp] = await Promise.all([
  p.waitForResponse(/survey-responses|responses/, { timeout: 5000 }),
  p.getByRole('button', { name: /submit|save|next/i }).last().click(),
])
```

**Expected:** 201 with response recorded.

**Pass criteria:** 201 status + UI advances to next household.

---

### FIELD-CANV-08 | Next household advances automatically after outcome

**Steps:** Record outcome, verify voter card updates to next entry without manual navigation.

**Expected:** Progress counter increments (e.g. "3 of 12"); new voter info loaded.

**Pass criteria:** Progress counter increments by 1; voter name/address changed.

---

### FIELD-CANV-09 | Map pans/zooms correctly

**Steps:** Interact with map — drag, scroll to zoom, click zoom controls.

**Expected:** Map responds smoothly; no stuck tiles; markers remain clickable after pan/zoom.

**Pass criteria:** Visual inspection: map pan/zoom works; all markers still render.

---

### FIELD-CANV-10 | DoorListView fallback works

**Steps:** If there is a list/map toggle, switch to list view.

```js
const toggle = p.getByRole('button', { name: /list|map/i })
if (await toggle.count()) { await toggle.first().click() }
```

**Expected:** List of households renders with same outcome buttons.

**Pass criteria:** List view visible and functional.

---

### FIELD-CANV-11 | CanvassingCompletionSummary shows at end

**Steps:** Record outcomes on all remaining entries (or navigate to a nearly-complete list). When last entry is processed, verify completion summary appears.

**Expected:** Summary component shows totals (knocks recorded, outcomes breakdown).

**Pass criteria:** Completion summary visible after final entry; numbers add up.

---

## Class 3: Field canvassing (offline path)

### FIELD-OFFLINE-01 | Door knock queued while offline

**Steps:**
1. On the canvassing route, set offline:
```js
await ctx.setOffline(true)
await p.waitForTimeout(500)
```
2. Click first household, click "Home" outcome.
3. Verify no network request is made.
4. Inspect localStorage queue:

```js
const queue = await p.evaluate(() => {
  const raw = localStorage.getItem('offline-queue')
  return raw ? JSON.parse(raw).state.items : []
})
console.log('queue length:', queue.length, 'items:', JSON.stringify(queue, null, 2))
```

**Expected:** 1 item queued with: `id` (uuid), `type: "door_knock"`, `payload`, `campaignId`, `resourceId` (walk_list_id), `createdAt` (number), `retryCount: 0`.

**Pass criteria:** Queue length == 1; item has all 6 required fields; voter_id present in payload.

---

### FIELD-OFFLINE-02 | OfflineBanner shows "offline" state

**Steps:** Same offline state, verify banner is visible.

**Expected:** OfflineBanner visible with "offline" text and pending count.

**Pass criteria:** Banner text mentions "offline" or pending sync count.

---

### FIELD-OFFLINE-03 | Record 5 knocks offline, all queued

**Steps:** While offline, record outcomes on 5 consecutive households.

```js
for (let i = 0; i < 5; i++) {
  await p.locator('.leaflet-marker-icon, [data-testid="household-item"]').nth(i).click()
  await p.getByRole('button', { name: /home|not_home|refused/i }).first().click()
  await p.waitForTimeout(300)
}
const len = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items.length)
console.log('queue length:', len)
```

**Expected:** Queue length = 5 (+ any from previous test).

**Pass criteria:** Queue contains 5+ items; all `retryCount=0`; all `type="door_knock"`.

---

### FIELD-OFFLINE-04 | Queue persists across page refresh

**Steps:**
1. With 5+ items queued offline, refresh the page (keep offline).
2. Re-inspect queue.

```js
await p.reload()
await p.waitForTimeout(1000)
const len = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items.length)
```

**Expected:** Queue length unchanged after refresh.

**Pass criteria:** Queue length before == after refresh.

---

### FIELD-OFFLINE-05 | Drain queue when connection restored

**Steps:**
1. With 5+ items queued, restore connectivity:
```js
await ctx.setOffline(false)
```
2. Wait for sync engine to kick in (triggered by `online` event in useSyncEngine).
3. Monitor network for sequential POSTs.

```js
const requests = []
p.on('request', (req) => {
  if (/door-knocks|phone-bank-sessions.*calls/.test(req.url())) requests.push(req.url())
})
await ctx.setOffline(false)
await p.waitForTimeout(15000)
console.log('replayed requests:', requests.length)
const finalLen = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items.length)
console.log('remaining queue:', finalLen)
```

**Expected:** Each queued item replayed via POST; on 201, removed from queue. Final queue length = 0.

**Pass criteria:** `requests.length >= 5` AND `finalLen == 0`.

---

### FIELD-OFFLINE-06 | Toast notification per successful sync

**Steps:** During drainQueue, observe toast notifications (sonner).

**Expected:** At least one toast indicating sync success (e.g. "5 records synced" or per-item toasts).

**Pass criteria:** Toast visible during/after drain; toast text references sync/synced.

---

### FIELD-OFFLINE-07 | Queries invalidated post-sync (map refreshes)

**Steps:** After drain, verify map markers show updated state (already-knocked households styled differently).

**Expected:** `QueryClient.invalidateQueries` fires; walk-list entries refetched; map updates.

**Pass criteria:** A GET to walk list entries observed post-drain; marker state updated visually.

---

### FIELD-OFFLINE-08 | DB verification — all 5 knocks landed server-side

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT COUNT(*) FROM door_knocks
WHERE walk_list_id = '$WALK_LIST_ID'
  AND canvasser_user_id = '$VOLUNTEER_USER_ID'
  AND created_at > NOW() - INTERVAL '10 minutes';"
```

**Expected:** Count matches or exceeds number of offline knocks.

**Pass criteria:** DB count >= number pushed offline. No data loss.

---

### FIELD-OFFLINE-09 | No duplicate rows after sync

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT voter_id, COUNT(*) FROM door_knocks
WHERE walk_list_id = '$WALK_LIST_ID'
  AND canvasser_user_id = '$VOLUNTEER_USER_ID'
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY voter_id HAVING COUNT(*) > 1;"
```

**Expected:** 0 rows (no voter_id with >1 knock).

**Pass criteria:** Empty result set. No double-writes from sync retry.

---

## Class 4: Field phone banking (online path)

### FIELD-PB-01 | Navigate to /field/{id}/phone-banking

**Steps:** From hub, click phone-banking assignment card OR navigate directly.

```js
await p.goto(`https://run.civpulse.org/field/${CAMPAIGN_ID}/phone-banking`)
```

**Expected:** Phone banking route loads, assignment card visible.

**Pass criteria:** URL match + 200 response for sessions fetch.

---

### FIELD-PB-02 | Claim session flow

**Steps:** Click "Start" or "Claim session" on a session card. Watch for POST to claim endpoint.

```js
const [resp] = await Promise.all([
  p.waitForResponse(/phone-bank-sessions.*claim|sessions.*join/, { timeout: 10000 }),
  p.getByRole('button', { name: /start|claim/i }).first().click(),
])
console.log('claim:', resp.status())
```

**Expected:** 200/201 on claim; UI transitions to active calling screen.

**Pass criteria:** Status 2xx; calling screen visible post-claim.

---

### FIELD-PB-03 | CallingVoterCard loads current voter

**Steps:** Wait for calling UI to load first entry.

```js
await p.waitForSelector('[data-testid="calling-voter-card"], [data-testid="voter-card"]', { timeout: 10000 })
```

**Expected:** Card shows voter name, phone number(s), script guidance.

**Pass criteria:** Voter name + phone number visible.

---

### FIELD-PB-04 | Phone number renders as tel: link

**Steps:** Inspect the phone number anchor.

```js
const tel = await p.locator('a[href^="tel:"]').first().getAttribute('href')
console.log('tel link:', tel)
```

**Expected:** `href="tel:+1..."` format.

**Pass criteria:** href starts with `tel:`.

---

### FIELD-PB-05 | Record call outcome

**Steps:** Click outcome button (e.g. "Answered").

```js
const [resp] = await Promise.all([
  p.waitForResponse(/phone-bank-sessions.*calls|calls$/, { timeout: 5000 }),
  p.getByRole('button', { name: /^answered$/i }).click(),
])
```

**Expected:** 201 POST to `/api/v1/campaigns/{id}/phone-bank-sessions/{sessionId}/calls` with outcome=answered.

**Pass criteria:** 201 status.

---

### FIELD-PB-06 | Record each call outcome type

**Steps:** Advance through voters, trying each outcome: `answered`, `voicemail`, `no_answer`, `busy`, `wrong_number`, `refused`, `bad_number`.

**Expected:** Each outcome recorded with 201.

**Pass criteria:** All outcome buttons functional; 201 per submit.

---

### FIELD-PB-07 | InlineSurvey renders after "answered" outcome

**Steps:** When outcome=answered AND script attached, verify survey appears.

**Expected:** InlineSurvey component visible with script questions.

**Pass criteria:** Survey renders; answer fields interactive.

---

### FIELD-PB-08 | Next voter loads automatically

**Steps:** After recording call, verify next voter auto-loads.

**Expected:** Voter card swaps to new voter; progress counter increments.

**Pass criteria:** Voter name changes; counter increments by 1.

---

### FIELD-PB-09 | FieldProgress tracker updates

**Steps:** Inspect progress indicator.

**Expected:** Shows "X of Y complete" accurately.

**Pass criteria:** Numbers match actual calls recorded during session.

---

### FIELD-PB-10 | CompletionSummary shows when list exhausted

**Steps:** Record outcomes on all remaining session entries (or navigate to nearly-complete session).

**Expected:** Completion summary appears with totals.

**Pass criteria:** Summary visible; counts add up.

---

## Class 5: Field phone banking (offline path)

### FIELD-PB-OFF-01 | Call recorded offline is queued

**Steps:**
1. Mid-session, set offline.
2. Record call outcome.
3. Inspect queue.

```js
await ctx.setOffline(true)
await p.getByRole('button', { name: /answered|voicemail|no.?answer/i }).first().click()
await p.waitForTimeout(500)
const queue = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items)
console.log('call queue items:', queue.filter(i => i.type === 'call_record').length)
```

**Expected:** 1+ items with `type: "call_record"`, `resourceId` = session ID.

**Pass criteria:** Queue contains call_record item with correct campaignId/resourceId.

---

### FIELD-PB-OFF-02 | Multiple calls queued offline

**Steps:** Record 4 more calls offline; verify queue grows.

**Expected:** Queue contains 5 call_record items.

**Pass criteria:** Queue length for call_record == 5.

---

### FIELD-PB-OFF-03 | Drain calls on reconnect

**Steps:**
```js
await ctx.setOffline(false)
await p.waitForTimeout(10000)
const remaining = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('offline-queue')).state.items.filter(i => i.type === 'call_record').length
)
console.log('remaining call queue:', remaining)
```

**Expected:** Queue drains to 0; POSTs replay to `/phone-bank-sessions/{id}/calls`.

**Pass criteria:** `remaining == 0`; network shows 5 POSTs.

---

### FIELD-PB-OFF-04 | Conflict (409) handling on stale replay

**Purpose:** If offline call replays for a voter that already has a call recorded from another device/session, server returns 409; client should remove item and continue.

**Steps:**
1. Record a call online (first voter → answered).
2. Simulate stale state: record another call for same session+voter from a parallel window.
3. Queue a stale replay offline for same voter.
4. Reconnect.

```js
// Inspect console for 409 handling
p.on('console', (msg) => { if (/409|conflict/i.test(msg.text())) console.log('409:', msg.text()) })
```

**Expected:** isConflict(err) returns true → item removed from queue (no infinite retry). No data corruption.

**Pass criteria:** Queue drains despite 409; no loops; no duplicate DB rows.

---

## Class 6: Offline queue edge cases

### FIELD-EDGE-01 | Stress: 100+ queued items

**Steps:** While offline, record outcomes on 100 entries in rapid succession (programmatic clicks).

```js
await ctx.setOffline(true)
// Force-push directly to the store for speed
await p.evaluate((count) => {
  const store = window.__OFFLINE_QUEUE_STORE__ // if exposed, else click loop
  // fallback: loop click
}, 100)
```

Or loop clicks:
```js
for (let i = 0; i < 100; i++) {
  await p.locator('[data-testid="household-item"]').nth(i % 10).click()
  await p.getByRole('button', { name: /home/i }).click()
  await p.waitForTimeout(50)
}
```

**Expected:** Queue accepts 100 items without error or UI freeze.

**Pass criteria:** Queue length == 100; app responsive; no localStorage errors.

---

### FIELD-EDGE-02 | 100-item drain completes

**Steps:** Reconnect and time the drain.

```js
const start = Date.now()
await ctx.setOffline(false)
await p.waitForFunction(() =>
  JSON.parse(localStorage.getItem('offline-queue')).state.items.length === 0,
  { timeout: 120000 }
)
console.log('drain time ms:', Date.now() - start)
```

**Expected:** Drains in < 90s under normal latency.

**Pass criteria:** All 100 synced; no queue residue; drain time < 120s.

---

### FIELD-EDGE-03 | Retry on transient failure (1x, 2x, 3x)

**Purpose:** Verify `MAX_RETRY = 3` in `useSyncEngine.ts`.

**Steps:**
1. Queue 3 items.
2. Force POST failures (route blocking via Playwright):
```js
await ctx.route(/door-knocks/, (r) => r.abort())
await ctx.setOffline(false)
await p.waitForTimeout(15000)
const items = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items)
console.log('retry counts:', items.map(i => i.retryCount))
```

**Expected:** retryCount increments per attempt.

**Pass criteria:** retryCount values observed incrementing across drain cycles.

---

### FIELD-EDGE-04 | Item dropped after MAX_RETRY reached

**Steps:** Continue blocking route through multiple drain attempts.

```js
// Trigger multiple drains by flapping offline
for (let i = 0; i < 5; i++) {
  await ctx.setOffline(true); await p.waitForTimeout(500)
  await ctx.setOffline(false); await p.waitForTimeout(3000)
}
const items = await p.evaluate(() => JSON.parse(localStorage.getItem('offline-queue')).state.items)
console.log('final items:', items.length)
```

**Expected:** After retryCount >= MAX_RETRY (3), item is removed from queue; toast notifies user.

**Pass criteria:** Items with retryCount >= 3 no longer in queue; error toast observed.

**Cleanup:** `await ctx.unroute(/door-knocks/)`

---

### FIELD-EDGE-05 | Network flapping (online/offline rapid)

**Steps:**
```js
for (let i = 0; i < 10; i++) {
  await ctx.setOffline(true); await p.waitForTimeout(200)
  await ctx.setOffline(false); await p.waitForTimeout(200)
}
```

**Expected:** No crash; no duplicate sync attempts (isSyncing flag prevents concurrent drains).

**Pass criteria:** App stable; queue consistency maintained.

---

### FIELD-EDGE-06 | Token expiry mid-sync (401 on replay)

**Steps:**
1. Queue items offline.
2. Manually expire/corrupt the access token in the app's storage.
3. Reconnect; observe 401 responses.

**Expected:** Token refresh triggered OR user redirected to login; queue items preserved for post-auth replay.

**Pass criteria:** No data loss; queue intact OR items auto-replayed after refresh.

---

### FIELD-EDGE-07 | Storage quota exhausted

**Steps:** Fill localStorage intentionally:
```js
await p.evaluate(() => {
  try {
    let i = 0
    while (true) {
      localStorage.setItem(`filler-${i++}`, 'x'.repeat(100000))
    }
  } catch (e) {
    console.log('quota hit at', i)
  }
})
```
Then attempt to queue a knock.

**Expected:** Push either succeeds (trimming filler) OR fails gracefully with user-visible error. No crash.

**Pass criteria:** No uncaught exceptions; user feedback provided on failure.

**Cleanup:** `await p.evaluate(() => { for (let k in localStorage) if (k.startsWith('filler-')) localStorage.removeItem(k) })`

---

### FIELD-EDGE-08 | Queue survives app close/reopen

**Steps:** Queue items offline, close browser context, reopen, re-login.

**Expected:** Queue still persists in localStorage under the same origin.

**Pass criteria:** On reopen, queue contents intact; drain triggers automatically if online.

---

## Class 7: Resume state

### FIELD-RESUME-01 | ResumePrompt appears after mid-session close

**Steps:**
1. Start canvassing, record 2 knocks.
2. Close/navigate away.
3. Reopen /field/{id}/canvassing.

**Expected:** ResumePrompt shows last position (e.g. "Resume where you left off? — Entry 3 of 12").

**Pass criteria:** Prompt visible with specific resume info.

---

### FIELD-RESUME-02 | Accept resume pans map to last household

**Steps:** Click "Resume" button on prompt.

**Expected:** Map centers on the last-viewed entry; voter card shows that entry.

**Pass criteria:** Visible voter matches entry before interruption.

---

### FIELD-RESUME-03 | Dismiss resume starts fresh

**Steps:** Instead of accepting, click "Start fresh" or dismiss.

**Expected:** Session begins from entry 1.

**Pass criteria:** First entry loaded; no resume state reapplied.

---

### FIELD-RESUME-04 | Resume state per campaign (isolation)

**Steps:** If volunteer has 2 campaigns, verify resume state doesn't bleed across campaigns.

**Expected:** Resume in campaign A shows only A's state.

**Pass criteria:** No cross-campaign resume contamination.

---

## Class 8: Tour behavior

### FIELD-TOUR-01 | Welcome tour plays on first hub visit

**Steps:** Clear `tour-storage` in localStorage; navigate to /field hub.

**Expected:** Welcome tour starts.

**Pass criteria:** Tour overlay visible within 2s.

---

### FIELD-TOUR-02 | Canvassing tour plays on first map open

**Steps:** With welcome tour dismissed, navigate to /field/{id}/canvassing for the first time.

**Expected:** Canvassing tour overlay plays.

**Pass criteria:** Tour overlay mentions canvassing concepts (map, outcomes).

---

### FIELD-TOUR-03 | Phone banking tour plays on first session

**Steps:** Navigate to /field/{id}/phone-banking for first time.

**Expected:** Phone banking tour plays.

**Pass criteria:** Tour overlay visible.

---

### FIELD-TOUR-04 | Dismissed tour doesn't replay in same session

**Steps:** Dismiss tour; trigger reopen of same screen.

**Expected:** Tour does NOT replay (sessionCounts tracks dismissal).

**Pass criteria:** No tour overlay on re-entry within same session.

---

### FIELD-TOUR-05 | Tour progress saved to tourStore

**Steps:** Inspect `localStorage['tour-storage']`.

```js
const tour = await p.evaluate(() => JSON.parse(localStorage.getItem('tour-storage')))
console.log(tour)
```

**Expected:** State includes `completedTours`, `sessionCounts`, or similar flags.

**Pass criteria:** Store persists dismissal state.

---

### FIELD-TOUR-06 | Tour accessible re-open via help menu

**Steps:** Find "Replay tour" or "Help" affordance.

**Expected:** User can manually re-trigger tour.

**Pass criteria:** Replay option exists and works.

---

## Class 9: Field role enforcement

### FIELD-ROLE-01 | Viewer cannot access /field/canvassing

**Steps:** Log in as `qa-viewer@civpulse.org` with `${VIEWER_A_PASSWORD}`. Attempt to navigate to `/field/${ORG_A_CAMPAIGN_ID}/canvassing`.

**Expected:** 403 (API door-knocks endpoint requires volunteer+) or UI redirects/shows access denied.

**Pass criteria:** Viewer cannot record a knock; UI or API blocks action.

---

### FIELD-ROLE-02 | Viewer on field hub

**Steps:** Log in as viewer, land on field hub.

**Expected:** Either redirects to campaigns view OR shows read-only view without outcome buttons.

**Pass criteria:** No ability to record knocks/calls. Document exact behavior.

---

### FIELD-ROLE-03 | Volunteer can access field hub

**Steps:** Log in as `qa-volunteer`, confirm hub visible.

**Expected:** Hub loads with assignment cards.

**Pass criteria:** Success (previously verified in FIELD-HUB-01).

---

### FIELD-ROLE-04 | Volunteer sees only assigned campaigns on hub

**Steps:** Inspect assignment cards as volunteer. Verify all cards belong to campaigns volunteer is a member of.

```bash
# Compare against API truth
curl -sS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/users/me/campaigns" | jq '.items[].id'
```

**Expected:** Hub shows only campaigns returned by `/users/me/campaigns` (volunteer's memberships).

**Pass criteria:** No extra campaigns visible.

---

### FIELD-ROLE-05 | Volunteer cannot access admin routes

**Steps:** As volunteer, attempt `GET /api/v1/campaigns/{id}/members` via browser URL or API:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members"
```

**Expected:** 403 (manager+ only).

**Pass criteria:** 403 status.

---

### FIELD-ROLE-06 | Admin can access field hub (super-role passthrough)

**Steps:** Log in as `qa-admin@civpulse.org`; navigate to `/field/{id}`.

**Expected:** Admin can enter field mode (role >= volunteer).

**Pass criteria:** Hub renders; assignments visible.

---

## Class 10: Mobile viewport tests

### FIELD-MOBILE-01 | iPhone SE viewport (375x667)

**Steps:**
```js
await p.setViewportSize({ width: 375, height: 667 })
await p.goto(`https://run.civpulse.org/field/${CAMPAIGN_ID}`)
```

**Expected:** Hub renders without horizontal scroll; cards stack vertically.

**Pass criteria:** No horizontal scrollbar; all assignment cards fit in viewport width.

---

### FIELD-MOBILE-02 | iPhone 11 viewport (414x896)

**Steps:** Set viewport 414x896. Navigate through hub → canvassing → record knock.

**Expected:** Full flow works; map renders at mobile size; outcome buttons reachable.

**Pass criteria:** End-to-end flow completes without layout issues.

---

### FIELD-MOBILE-03 | Touch targets >= 44x44px (WCAG)

**Steps:**
```js
const btns = await p.locator('button:visible').all()
for (const btn of btns) {
  const box = await btn.boundingBox()
  if (box && (box.width < 44 || box.height < 44)) {
    const text = await btn.textContent()
    console.log('too small:', text, box)
  }
}
```

**Expected:** All interactive buttons ≥ 44x44px on field routes.

**Pass criteria:** 0 buttons flagged under 44px.

---

### FIELD-MOBILE-04 | Mobile sidebar / drawer pattern

**Steps:** At mobile viewport, verify sidebar becomes drawer (hamburger menu) not persistent sidebar.

**Expected:** Hamburger trigger visible; drawer overlays content when opened.

**Pass criteria:** Drawer pattern observed on mobile; persistent sidebar on desktop.

---

### FIELD-MOBILE-05 | Map gestures work on touch

**Steps:** Simulate pinch-zoom + pan on Leaflet map at mobile viewport.

```js
// Playwright touch support
await p.touchscreen.tap(200, 400)
```

**Expected:** Map responds to touch pan; zoom controls remain tappable.

**Pass criteria:** Map navigable via touch; no stuck tiles.

---

### FIELD-MOBILE-06 | Outcome buttons stack vertically on mobile

**Steps:** At 375px width, inspect outcome button group layout.

**Expected:** Buttons stack vertically (or 2-column grid) for thumb reach; not single horizontal row that requires scrolling.

**Pass criteria:** Visual inspection: buttons reachable without horizontal scroll.

---

### FIELD-MOBILE-07 | Text readable at mobile sizes (no cutoff)

**Steps:** Check voter card text at 375px: name, address, phone.

**Expected:** No text clipping; ellipsis handled gracefully where needed.

**Pass criteria:** All voter data readable; no overflow.

---

## Results Template

Save filled to `results/phase-10-results.md`.

### Class 1 — Field hub

| Test ID | Result | Notes |
|---|---|---|
| FIELD-HUB-01 | | |
| FIELD-HUB-02 | | |
| FIELD-HUB-03 | | |
| FIELD-HUB-04 | | |
| FIELD-HUB-05 | | |
| FIELD-HUB-06 | | |

### Class 2 — Canvassing online

| Test ID | Result | Notes |
|---|---|---|
| FIELD-CANV-01 | | |
| FIELD-CANV-02 | | |
| FIELD-CANV-03 | | |
| FIELD-CANV-04 | | |
| FIELD-CANV-05 | | |
| FIELD-CANV-06 | | |
| FIELD-CANV-07 | | |
| FIELD-CANV-08 | | |
| FIELD-CANV-09 | | |
| FIELD-CANV-10 | | |
| FIELD-CANV-11 | | |

### Class 3 — Canvassing offline

| Test ID | Result | Notes |
|---|---|---|
| FIELD-OFFLINE-01 | | |
| FIELD-OFFLINE-02 | | |
| FIELD-OFFLINE-03 | | |
| FIELD-OFFLINE-04 | | |
| FIELD-OFFLINE-05 | | |
| FIELD-OFFLINE-06 | | |
| FIELD-OFFLINE-07 | | |
| FIELD-OFFLINE-08 | | |
| FIELD-OFFLINE-09 | | |

### Class 4 — Phone banking online

| Test ID | Result | Notes |
|---|---|---|
| FIELD-PB-01 | | |
| FIELD-PB-02 | | |
| FIELD-PB-03 | | |
| FIELD-PB-04 | | |
| FIELD-PB-05 | | |
| FIELD-PB-06 | | |
| FIELD-PB-07 | | |
| FIELD-PB-08 | | |
| FIELD-PB-09 | | |
| FIELD-PB-10 | | |

### Class 5 — Phone banking offline

| Test ID | Result | Notes |
|---|---|---|
| FIELD-PB-OFF-01 | | |
| FIELD-PB-OFF-02 | | |
| FIELD-PB-OFF-03 | | |
| FIELD-PB-OFF-04 | | |

### Class 6 — Queue edge cases

| Test ID | Result | Notes |
|---|---|---|
| FIELD-EDGE-01 | | 100-item stress |
| FIELD-EDGE-02 | | drain time |
| FIELD-EDGE-03 | | retry logic |
| FIELD-EDGE-04 | | drop after MAX_RETRY |
| FIELD-EDGE-05 | | flapping |
| FIELD-EDGE-06 | | 401 mid-sync |
| FIELD-EDGE-07 | | quota |
| FIELD-EDGE-08 | | reopen persistence |

### Class 7 — Resume state

| Test ID | Result | Notes |
|---|---|---|
| FIELD-RESUME-01 | | |
| FIELD-RESUME-02 | | |
| FIELD-RESUME-03 | | |
| FIELD-RESUME-04 | | |

### Class 8 — Tour

| Test ID | Result | Notes |
|---|---|---|
| FIELD-TOUR-01 | | |
| FIELD-TOUR-02 | | |
| FIELD-TOUR-03 | | |
| FIELD-TOUR-04 | | |
| FIELD-TOUR-05 | | |
| FIELD-TOUR-06 | | |

### Class 9 — Role enforcement

| Test ID | Result | Notes |
|---|---|---|
| FIELD-ROLE-01 | | |
| FIELD-ROLE-02 | | |
| FIELD-ROLE-03 | | |
| FIELD-ROLE-04 | | |
| FIELD-ROLE-05 | | |
| FIELD-ROLE-06 | | |

### Class 10 — Mobile viewport

| Test ID | Result | Notes |
|---|---|---|
| FIELD-MOBILE-01 | | 375x667 |
| FIELD-MOBILE-02 | | 414x896 |
| FIELD-MOBILE-03 | | WCAG 44px |
| FIELD-MOBILE-04 | | drawer |
| FIELD-MOBILE-05 | | touch gestures |
| FIELD-MOBILE-06 | | button stacking |
| FIELD-MOBILE-07 | | text readability |

### Summary

- Total tests: 57
- PASS: ___ / 57
- **Any FAIL in Class 3 (Canvassing offline) or Class 5 (Phone banking offline) = P0 launch blocker** — data loss in field is non-negotiable.
- Any FAIL in Class 6 (Queue edge cases) = P0 or P1 depending on severity (quota/retry bugs = P1; stall/crash = P0).
- Any FAIL in Class 9 (Role enforcement) = P0 (security).
- Any FAIL in Class 10 (Mobile viewport) with touch target < 44px = P1 (WCAG).

## Cleanup

- Restore qa-volunteer's walk-list/session assignments if FIELD-HUB-05 un-assigned them.
- Remove any test knocks/calls recorded during this phase (optional — campaign is QA Test Campaign, expendable):
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
DELETE FROM door_knocks
WHERE walk_list_id = '$WALK_LIST_ID'
  AND canvasser_user_id = '$VOLUNTEER_USER_ID'
  AND created_at > NOW() - INTERVAL '2 hours';"
```
- Clear localStorage in the test browser context (removes queue, tour, resume state).
- Un-route any Playwright route blockers:
```js
await ctx.unrouteAll()
```
- Close browser contexts.
