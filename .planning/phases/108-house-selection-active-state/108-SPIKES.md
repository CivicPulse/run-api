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

---

## A2 — L.Icon vs L.DivIcon Pseudo-Element Support

**Question:** Can a CSS `::before` pseudo-element attach to the root
DOM produced by `L.Icon`? If not, must we convert to `L.DivIcon`?

**Evidence:** Inspected the two `createIcon` implementations.

`web/node_modules/leaflet/src/layer/marker/Icon.js`:

```js
// L.91-95 — public createIcon entry point
// @method createIcon(oldIcon?: HTMLElement): HTMLElement
createIcon: function (oldIcon) {
    return this._createIcon('icon', oldIcon);
},

// L.104+ — _createIcon delegates to _createImg for the 'icon' name
_createIcon: function (name, oldIcon) {
    var src = this._getIconUrl(name);
    // ...
    var img = this._createImg(src, oldIcon && oldIcon.tagName === 'IMG' ? oldIcon : null);
    this._setIconStyles(img, name);
    return img;
},

// L.150 — _createImg constructs the void <img>
el = el || document.createElement('img');
```

`L.Icon` produces an **`<img>` element** as the marker root. `<img>`
is a void element in the HTML spec — it has no children and cannot
host `::before` / `::after` pseudo-elements. CSS generated content
boxes are children of the originating element, and the HTML parser
forbids children for void elements, so `::before { content: "" }` on
an `<img>` is silently dropped by every browser engine.

`web/node_modules/leaflet/src/layer/marker/DivIcon.js`:

```js
// L.45-46 — createIcon constructs a <div>
createIcon: function (oldIcon) {
    var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div'),
```

`L.DivIcon` produces a **`<div>` element** as the marker root, with
the user-supplied `html` string injected via `innerHTML`. `<div>` is
a normal element that fully supports `::before` and `::after`
pseudo-elements.

**Decision:** **NO** — `L.Icon`'s `<img>` root CANNOT host a
`::before` pseudo-element. The Contract 2b 44×44 hit area expansion
will silently fail on the current `householdIcon` and
`activeHouseholdIcon` definitions.

**Action for Plan 108-03:** **Convert `householdIcon` and
`activeHouseholdIcon` to `L.DivIcon`** with an inner `<img>` for the
visible PNG art. The visible art is unchanged — only the wrapping
DOM root changes from `<img>` to `<div>`. Leave `volunteerIcon` as
`L.Icon` because Contract 2c excludes it from keyboard activation
and it has no hit-area requirement.

Concrete TypeScript snippet to drop into `CanvassingMap.tsx` (replaces
the existing definitions at lines 18-47):

```typescript
const householdIcon = new L.DivIcon({
  html: '<img src="/leaflet/marker-icon.png" srcset="/leaflet/marker-icon-2x.png 2x" width="25" height="41" alt="" />',
  className: "canvassing-map-household-marker",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const activeHouseholdIcon = new L.DivIcon({
  html: '<img src="/leaflet/marker-icon.png" srcset="/leaflet/marker-icon-2x.png 2x" width="30" height="49" alt="" />',
  className: "canvassing-map-household-marker canvassing-map-active-marker",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
})
```

The new `canvassing-map-household-marker` class is the hook for the
`::before` 44×44 hit area expansion. The existing
`canvassing-map-active-marker` class continues to carry the
`drop-shadow` halo (Contract 2d).

**Rationale:** Verified at the source level — assumption A2 in the
research doc is correct. `L.DivIcon` is the canonical Leaflet escape
hatch for any marker that needs CSS customization beyond what an
`<img>` can offer. Plan 108-03 should commit the conversion as part
of the same task that adds the marker click/keydown handlers and the
`::before` CSS rule, since they are interdependent.

---

## Spike Outcome Summary

| Spike | Decision | Plan 108-03 action |
|---|---|---|
| A1 (Space-key) | NO — Leaflet only routes Enter via `role="button"` | Add `keydown` listener for `event.key === " "` on each marker root |
| A2 (`::before` on `L.Icon`) | NO — `<img>` is a void element | Convert `householdIcon` + `activeHouseholdIcon` to `L.DivIcon`; keep `volunteerIcon` as `L.Icon` |

Both decisions are now locked. Plan 108-03 implements them verbatim.
