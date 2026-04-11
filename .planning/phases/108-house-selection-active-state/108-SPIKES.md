# Phase 108 — Wave 0 Spikes

Time-boxed (5 min each) DOM/source spikes resolving the two assumptions
(A1, A2) flagged in `108-RESEARCH.md` §Assumptions Log so Wave 2
(Plan 108-03) executes against verified facts instead of guesses.

Spike date: 2026-04-11
Leaflet version on disk: 1.9.4 (verified via `web/node_modules/leaflet/package.json`)

---

## A1 — Leaflet Space-key Activation

**Question:** Does Leaflet 1.9.4's `marker.options.keyboard = true` fire
`click` on Space, or only Enter?

**Evidence:** Inspected `web/node_modules/leaflet/src/layer/marker/Marker.js`
for any keyboard event handling. Total match count for
`keydown|keypress|onKey|key.*Enter|key.*Space` across the entire
`web/node_modules/leaflet/src/layer/marker/` directory: **0**.

The only `keyboard`-related code in `Marker.js`:

```js
// L.37-39 — option declaration + comment
// @option keyboard: Boolean = true
// Whether the marker can be tabbed to with a keyboard and clicked by pressing enter.
keyboard: true,

// L.236-239 — application
if (options.keyboard) {
    icon.tabIndex = '0';
    icon.setAttribute('role', 'button');
}
```

That is the **entirety** of Leaflet's keyboard support for markers.
Leaflet attaches NO `keydown` / `keypress` / `keyup` listener to the
marker root. It relies entirely on the browser's default behavior of
firing `click` on Enter when `role="button"` is set. Browsers do NOT
fire `click` on Space for `role="button"` divs — that synthetic
behavior only applies to native `<button>` elements (per the WAI-ARIA
authoring practice; the
[ARIA button widget pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
explicitly tells authors to handle Space themselves on non-`<button>`
roots).

Leaflet's own inline comment confirms the intent:
*"clicked by pressing enter"* — Space is not mentioned and not wired.

**Decision:** **NO** — Leaflet 1.9.4 does NOT handle Space natively on
markers. Only Enter works through the browser's `role="button"`
synthetic click. Space presses are silently ignored.

**Action for Plan 108-03:** **Attach a `keydown` listener for Space**
on each household marker root in the post-mount `useEffect` that also
applies the rest of the ARIA contract (Contract 2c). The handler must:

1. Match `event.key === " "` (Space key — note: NOT `"Space"` which is
   `event.code`, not `event.key`).
2. Call `event.preventDefault()` to suppress the default page-scroll
   that Space normally triggers when focus is on a non-form element.
3. Invoke the same `handleJumpToAddress(index)` callback that the
   `click` handler uses.

Enter does NOT need a listener — Leaflet's `tabIndex='0'` +
`role='button'` already routes Enter to `click` via the browser, and
the marker's `eventHandlers={{ click: ... }}` will fire normally.

**Rationale:** AAA contract 2c (UI-SPEC) requires both Enter and Space
to activate. Leaflet only delivers Enter. We add the missing Space
listener, ~5 lines of code, no other contract changes.
