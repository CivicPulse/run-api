# E2E Walkthrough Error Log — 2026-03-15

## Summary
Full manual Playwright walkthrough of https://dev.tailb56d83.ts.net:5173/
**Pages visited:** 25+
**Critical errors:** 0
**Warnings:** 2 (minor)
**UX/Data issues:** 3

---

## Issues Found

### 1. [WARNING] Missing aria-describedby on New List dialog
- **Page:** Voters > Lists > "+ New List" button
- **Details:** Two React warnings: `Warning: Missing 'Description' or 'aria-describedby={undefined}'` from `chunk-3QSXP6LN.js`
- **Severity:** Low — accessibility warning from Radix UI dialog component
- **Fix:** Add `<DialogDescription>` or `aria-describedby={undefined}` to the New List dialog

### 2. [UX] Voter imports stuck in "pending" status
- **Page:** Voters > Imports
- **Details:** 4 out of 5 import jobs show "pending" status with `full-2026-03-11.csv` filename, and the "Imported" column is empty for all rows. One shows "uploaded" status. These appear to be stale/stuck jobs that were never processed.
- **Severity:** Medium — confusing for users, suggests import pipeline may not be running
- **Fix:** Investigate why import jobs aren't being processed; consider adding a "cancel" or "retry" action for stuck imports

### 3. [UX] Volunteers landing page (/volunteers) shows no content
- **Page:** /campaigns/{id}/volunteers (without sub-path)
- **Details:** Navigating to the Volunteers section shows only the sub-nav tabs (Roster, Tags, Register, Shifts) but no content below them. The user must click "Roster" to see anything. Other sections like Voters auto-show their default sub-page content.
- **Severity:** Low — should either redirect to /volunteers/roster or render the roster by default
- **Fix:** Add an index redirect from `/volunteers` to `/volunteers/roster`

### 4. [UX] Pagination buttons always disabled on Voters list
- **Page:** Voters > All Voters
- **Details:** "Previous" and "Next" pagination buttons are visible but permanently disabled, even though the page appears to show all 50 voters in a single unpaginated list. Either remove pagination controls when all results fit, or implement actual pagination.
- **Severity:** Low — cosmetic, doesn't block functionality

---

## Pages Tested (All Passed)

| Section | Pages | Status |
|---------|-------|--------|
| **Login** | OAuth flow via ZITADEL, callback redirect | OK |
| **Campaigns Index** | List, New Campaign form, Campaign Type dropdown | OK |
| **Dashboard** | Stats cards, Canvassing/Phone Banking/Volunteers tabs, charts, tables | OK |
| **Voters** | All Voters table, Filters (party checkbox, chips, clear all), Voter detail (Overview/Contacts/Tags/History tabs), Voter actions menu, Lists (New List dialog: Static/Dynamic), Tags (8 tags with actions), Imports (history table, New Import) | OK |
| **Volunteers** | Roster (search, status filter, skills filter, 20 volunteers), Tags, Register, Shifts (Today/Past sections, Sign Up, Create Shift) | OK |
| **Phone Banking** | Sessions (3 sessions, New Session), Call Lists (4 lists with progress), DNC List (20 entries, search, Add/Import/Remove), My Sessions | OK |
| **Canvassing** | Turfs (5 turfs with status), Walk Lists (4 lists with progress), New Turf link, Generate Walk List | OK |
| **Surveys** | Survey list (1 active survey), New Script button | OK |
| **Settings** | General (name, description, election date, save), Members (table, Invite member), Danger Zone (Transfer ownership, Delete campaign) | OK |

## Console Errors
- **ZITADEL login page only:** 2 errors (Cloudflare Turnstile script 404, favicon 404) — external/auth server, not app code
- **App pages:** 0 console errors across all pages

## Interactive Elements Tested
- Sidebar toggle, User avatar menu (shows user info + Sign out)
- Filter checkboxes, filter chips with dismiss
- Voter actions dropdown (View detail, Edit)
- Campaign Type dropdown (Federal, State, Local, Ballot)
- New List dialog (Static List, Dynamic List)
- Dashboard tab switching (Canvassing, Phone Banking, Volunteers)
- All navigation links (sidebar, top nav, sub-nav tabs)
