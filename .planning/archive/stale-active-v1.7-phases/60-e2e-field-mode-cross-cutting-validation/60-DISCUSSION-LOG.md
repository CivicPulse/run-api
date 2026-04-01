# Phase 60: E2E Field Mode, Cross-Cutting & Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 60-e2e-field-mode-cross-cutting-validation
**Areas discussed:** Offline simulation strategy, Field mode viewport & auth, Bug fix cycle process, Old spec cleanup scope

---

## Offline Simulation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| context.setOffline(true) | Playwright's built-in BrowserContext.setOffline(). Simple, reliable, triggers navigator.onLine=false. | ✓ |
| Route-level network interception | page.route('**/*', route => route.abort()). More granular but doesn't trigger offline event. | |
| Service worker simulation | Mock service worker registration. Most realistic but significantly more complex. | |

**User's choice:** context.setOffline(true)
**Notes:** Simplest approach, directly triggers the OfflineBanner's navigator.onLine check.

---

### Queue Verification (OFFLINE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| UI assertion | Assert the visible offline queue count indicator ("N pending"). | ✓ |
| localStorage inspection | Read localStorage directly via page.evaluate(). | |
| Both UI + localStorage | Belt-and-suspenders approach. | |

**User's choice:** UI assertion
**Notes:** Tests what the user actually sees, avoids testing implementation details.

---

### Sync Verification (OFFLINE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for API responses | Use page.waitForResponse() after context.setOffline(false). | ✓ |
| UI state change only | Assert offline banner disappears and queue count goes to 0. | |
| You decide | Claude picks best approach. | |

**User's choice:** Wait for API responses
**Notes:** Confirms actual server sync, not just UI state change.

---

## Field Mode Viewport & Auth

### Viewport

| Option | Description | Selected |
|--------|-------------|----------|
| iPhone 14 (390x844) | Standard modern smartphone. Playwright built-in device profile. | ✓ |
| Generic mobile (375x667) | iPhone SE / small phone. Tests minimum viable mobile experience. | |
| Desktop default (1280x720) | Same as all other specs. Simpler config. | |
| You decide | Claude picks based on responsive breakpoints. | |

**User's choice:** iPhone 14 (390x844)
**Notes:** Real phone viewport catches responsive issues in the mobile-first field mode.

---

### Auth Role

| Option | Description | Selected |
|--------|-------------|----------|
| Volunteer suffix | .volunteer.spec.ts, runs as volunteer1@localhost. | ✓ |
| Owner (default) | No suffix, simplest but doesn't test volunteer permissions. | |
| Both roles in same spec | Test critical paths as volunteer AND verify owner/manager access. | |

**User's choice:** Volunteer suffix
**Notes:** Matches real-world usage — volunteers are the primary field mode users.

---

### Touch Emulation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, enable touch | hasTouch: true via iPhone 14 profile. Tests touch targets. | ✓ |
| No, click-only | Standard click events at mobile viewport. | |
| You decide | Claude decides based on touch-specific handlers. | |

**User's choice:** Yes, enable touch
**Notes:** iPhone 14 profile includes hasTouch by default. Tests 44px touch targets.

---

## Bug Fix Cycle Process

### Cycle Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Write all specs first, then fix | Batch approach — collect all failures, then fix. | ✓ |
| Fix as you go | Run and fix each spec immediately after writing. | |
| Two-pass approach | First pass: write + fix obvious. Second pass: run 3x for flaky tests. | |

**User's choice:** Write all specs first, then fix
**Notes:** Avoids context-switching between writing and fixing.

---

### Bug Fix Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Fix inline in this phase | Fix app bugs during the fix round. | |
| Track bugs separately, fix in sub-phase | Log bugs in tracking doc, create Phase 60.1 for fixes. | ✓ |
| You decide based on severity | Claude triages by severity. | |

**User's choice:** Track bugs separately, fix in a sub-phase
**Notes:** Keeps Phase 60 focused on spec writing. App bug fixes get their own sub-phase.

---

### Bug Tracking Method

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown file in phase dir | 60-BUGS.md with spec name, description, severity. | ✓ |
| GitHub issues | Issue per bug with 'bug' label. | |
| Inline TODO comments | test.skip() with TODO comment. | |

**User's choice:** Markdown file in phase dir
**Notes:** Simple, version-controlled, visible to downstream phases.

---

## Old Spec Cleanup Scope

### Cleanup Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Delete all overlapping | Delete all 11 old specs unconditionally. | |
| Keep as regression, skip in CI | Move old specs to legacy/ folder. | |
| Delete only exact duplicates | Only delete where new spec covers 100% of same assertions. | ✓ |

**User's choice:** Delete only exact duplicates
**Notes:** Conservative approach — don't lose unique coverage.

---

### Partial Coverage Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Absorb unique tests into new specs | Move unique test cases into new canonical spec, then delete old. | ✓ |
| Keep old spec alongside new | Accept overlap, no rework. | |
| You decide per spec | Claude reviews each for overlap. | |

**User's choice:** Absorb unique tests into new specs
**Notes:** No orphaned coverage — unique tests migrate to canonical specs.

---

### Cleanup Timing

| Option | Description | Selected |
|--------|-------------|----------|
| After new specs pass | Safest — never lose coverage. | ✓ |
| Before writing new specs | Reduces confusion but risks coverage gaps. | |
| You decide | Claude picks based on overlap analysis. | |

**User's choice:** After new specs pass
**Notes:** Write new specs, verify passing, then review old specs for unique coverage to absorb.

---

## Claude's Discretion

- Exact spec file organization (number of files, split strategy)
- Which test cases from old specs qualify as "unique coverage"
- Playwright project config for mobile viewport (separate project vs per-spec use())
- Severity classification for 60-BUGS.md entries
- Cross-cutting spec structure (single file or split by concern)

## Deferred Ideas

None — discussion stayed within phase scope
