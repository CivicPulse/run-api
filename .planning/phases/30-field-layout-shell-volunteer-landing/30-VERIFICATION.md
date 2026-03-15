---
phase: 30-field-layout-shell-volunteer-landing
verified: 2026-03-15T20:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 30: Field Layout Shell & Volunteer Landing Verification Report

**Phase Goal:** Field layout shell and volunteer landing page
**Verified:** 2026-03-15T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | GET /api/v1/campaigns/{id}/field/me returns volunteer name, campaign name, and active assignments | VERIFIED | `app/api/v1/field.py` — full endpoint, delegates to FieldService; 5/5 unit tests pass |
| 2  | At most one canvassing and one phone banking assignment returned (most recent active) | VERIFIED | `app/services/field.py` — both queries use `.order_by(...desc()).limit(1)` |
| 3  | Frontend useFieldMe hook fetches and types the response correctly | VERIFIED | `web/src/hooks/useFieldMe.ts` — queries `api/v1/campaigns/${campaignId}/field/me`, staleTime: 0, enabled: !!campaignId |
| 4  | Navigating to /field/{campaignId} renders a mobile-optimized layout with no sidebar, no admin navigation | VERIFIED | `__root.tsx` L230-238 — `isFieldRoute` check renders bare Outlet with no SidebarProvider |
| 5  | FieldHeader shows back arrow on sub-screens that navigates to hub, no back arrow on hub itself | VERIFIED | `FieldHeader.tsx` L41-54 — conditional on `showBack` prop; layout derives `isHub` from pathname |
| 6  | FieldHeader shows a disabled help button in greyed-out state | VERIFIED | `FieldHeader.tsx` L60-68 — `<Button disabled>` with `HelpCircle` icon using `text-muted-foreground/50` |
| 7  | FieldHeader shows avatar menu with name, email, and sign out | VERIFIED | `FieldHeader.tsx` L70-99 — DropdownMenu with displayName, email, sign out via `useAuthStore` |
| 8  | Placeholder canvassing and phone-banking sub-routes render within the field layout | VERIFIED | Both route files exist and export `Route`; plain text placeholder per plan spec (Phases 31/32) |
| 9  | Volunteer sees personalized greeting and assignment cards on the landing hub | VERIFIED | `index.tsx` L99 — `Hey {firstName}!` heading; renders AssignmentCard for each non-null assignment |
| 10 | Assignment card shows type icon, name, progress count, progress bar, and Tap to start CTA | VERIFIED | `AssignmentCard.tsx` — icon circle, name, `{completed} of {total} {unit}`, Progress bar, "Tap to start" |
| 11 | Volunteer with no assignments sees friendly empty state message | VERIFIED | `index.tsx` L125 — renders `<FieldEmptyState />`; `FieldEmptyState.tsx` shows "No assignment yet" |
| 12 | Volunteer-only users auto-redirect to /field/{campaignId} on login | VERIFIED | `callback.tsx` L69-81 — role check `=== "volunteer"`, fetch campaigns, navigate to `/field/${campaigns[0].campaign_id}` |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `app/api/v1/field.py` | Field me endpoint | VERIFIED | Exports `router`; 48 lines; delegates to FieldService; wired in router.py |
| `app/schemas/field.py` | Pydantic response schemas | VERIFIED | Exports `FieldMeResponse`, `CanvassingAssignment`, `PhoneBankingAssignment` |
| `app/services/field.py` | Assignment aggregation queries | VERIFIED | Exports `FieldService`; 112 lines; real DB queries with joins, ordering, limit |
| `web/src/types/field.ts` | TypeScript types for field API | VERIFIED | Exports all 3 interfaces matching Pydantic schema shape exactly |
| `web/src/hooks/useFieldMe.ts` | React Query hook for field/me endpoint | VERIFIED | Exports `useFieldMe`; correct queryKey, staleTime, enabled flag |
| `web/src/routes/__root.tsx` | Field route detection | VERIFIED | Contains `isFieldRoute` check at L230; placed after auth check, before admin sidebar |
| `web/src/routes/field/$campaignId.tsx` | Field layout route | VERIFIED | Exports `Route`; renders FieldHeader + Outlet; calls useFieldMe for campaign_name |
| `web/src/components/field/FieldHeader.tsx` | Field header component | VERIFIED | Exports `FieldHeader`; sticky header with back arrow, title, disabled help, avatar menu |
| `web/src/routes/field/$campaignId/index.tsx` | Field hub landing page | VERIFIED | Exports `Route`; full hub with greeting, cards, loading/error/empty states, pull-to-refresh |
| `web/src/components/field/AssignmentCard.tsx` | Tappable assignment card | VERIFIED | Exports `AssignmentCard`; Link to sub-route, icon, progress bar, CTA |
| `web/src/components/field/AssignmentCardSkeleton.tsx` | Shimmer loading placeholder | VERIFIED | Exports `AssignmentCardSkeleton`; matches card shape with Skeleton components |
| `web/src/components/field/FieldEmptyState.tsx` | No-assignment message | VERIFIED | Exports `FieldEmptyState`; ClipboardList icon, "No assignment yet" heading |
| `web/src/routes/callback.tsx` | Volunteer auto-redirect | VERIFIED | Contains volunteer role detection and navigate to /field/{campaignId} |
| `tests/test_field_me.py` | Unit tests for FieldService | VERIFIED | 5 tests; all pass — both assignments, canvassing only, phone banking only, no assignments, fallback name |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/v1/field.py` | `app/services/field.py` | `_service.get_field_me(...)` | WIRED | L39: `await _field_service.get_field_me(...)` |
| `app/api/v1/router.py` | `app/api/v1/field.py` | `router.include_router(field.router, ...)` | WIRED | L51: `router.include_router(field.router, tags=["field"])` |
| `web/src/hooks/useFieldMe.ts` | `api/v1/campaigns/{id}/field/me` | `api.get()` | WIRED | L9: `api.get(`api/v1/campaigns/${campaignId}/field/me`)` |
| `web/src/routes/__root.tsx` | field layout shell | `pathname.startsWith('/field')` check | WIRED | L230: `const isFieldRoute = location.pathname.startsWith("/field")` |
| `web/src/routes/field/$campaignId.tsx` | `FieldHeader` | component import and render | WIRED | L2: import, L30: `<FieldHeader .../>` |
| `web/src/components/field/FieldHeader.tsx` | `useAuthStore` | `useAuthStore` for user/logout | WIRED | L12: import; L21-22: `useAuthStore(...)` calls |
| `web/src/routes/field/$campaignId/index.tsx` | `useFieldMe` hook | `useFieldMe(campaignId)` call | WIRED | L5: import; L15: `const { data, isLoading, isError, refetch } = useFieldMe(campaignId)` |
| `web/src/routes/field/$campaignId/index.tsx` | `AssignmentCard` | component rendering | WIRED | L6: import; L104,113: conditionally rendered |
| `web/src/routes/callback.tsx` | `/field/{campaignId}` | `navigate` after role detection | WIRED | L75: `navigate({ to: `/field/${campaigns[0].campaign_id}` })` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NAV-01 | 30-02 | Volunteer sees a dedicated field mode layout with no sidebar or admin navigation | SATISFIED | `__root.tsx` isFieldRoute check bypasses SidebarProvider; FieldLayout renders bare header + Outlet |
| NAV-02 | 30-01, 30-03 | Volunteer sees an assignment-aware landing page that routes to canvassing or phone banking | SATISFIED | `useFieldMe` fetches assignments; hub renders AssignmentCard as Link to canvassing/phone-banking sub-routes |
| NAV-03 | 30-02 | Volunteer can navigate back to the landing hub from any field screen | SATISFIED | `FieldHeader` renders back arrow Link to `/field/${campaignId}` on sub-screens (showBack=true) |
| NAV-04 | 30-02 | Volunteer sees a persistent help button to replay the guided tour | SATISFIED (placeholder) | `FieldHeader` renders disabled HelpCircle button with greyed-out styling; full functionality deferred to Phase 34 per plan spec |

All 4 requirements for Phase 30 are accounted for. NAV-04 is intentionally incomplete (disabled placeholder) — this is the correct state per the phase plan which explicitly defers help overlay wiring to Phase 34.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/src/routes/field/$campaignId/canvassing.tsx` | 6 | "Canvassing mode coming soon" | INFO | Intentional placeholder for Phase 31 per plan spec |
| `web/src/routes/field/$campaignId/phone-banking.tsx` | 6 | "Phone banking mode coming soon" | INFO | Intentional placeholder for Phase 32 per plan spec |

No blocker or warning anti-patterns found. The two INFO items are documented, expected placeholder routes.

---

### Human Verification Required

The following behaviors cannot be verified programmatically:

#### 1. Field layout — no admin chrome

**Test:** Log in as any authenticated user and navigate to `/field/{any-campaign-uuid}`.
**Expected:** No sidebar visible, no admin header visible. Only the sticky FieldHeader with back (spacer), campaign name title, disabled help icon, and avatar menu.
**Why human:** Visual rendering cannot be verified via static analysis.

#### 2. Mobile touch targets (WCAG 2.5.5)

**Test:** Open `/field/{campaignId}` on a mobile viewport (375px width). Tap the back arrow, help button, and avatar.
**Expected:** All interactive elements have at least 44px tap area — no mis-taps on adjacent elements.
**Why human:** CSS min-h/min-w values are set but rendered touch area requires visual/device testing.

#### 3. Pull-to-refresh gesture

**Test:** On a mobile viewport, navigate to `/field/{campaignId}`, scroll to top, then pull down past 60px.
**Expected:** RefreshCw spinner appears, then data refetches, then spinner disappears.
**Why human:** Native touch event behavior requires device or browser DevTools touch simulation.

#### 4. Volunteer auto-redirect on login

**Test:** Log in as a user whose highest role is "volunteer".
**Expected:** After OIDC callback, redirected directly to `/field/{campaignId}` (not to `/`).
**Why human:** Requires a real ZITADEL user with volunteer role and an active campaign assignment.

---

### Gaps Summary

No gaps. All 12 observable truths verified across all three artifact levels (exists, substantive, wired). All 4 requirement IDs (NAV-01 through NAV-04) satisfied. Unit tests (5/5) and TypeScript compilation both pass. The two placeholder sub-routes (canvassing, phone-banking) are intentional per plan — they are stubs for Phases 31 and 32, not gaps for this phase.

---

_Verified: 2026-03-15T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
