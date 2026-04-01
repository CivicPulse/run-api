# CivicPulse Run — Comprehensive E2E Testing Plan

**Version:** 1.0
**Created:** 2026-03-29
**Target:** All UI routes, forms, buttons, links, and user-facing actions
**Environment:** Local dev (Docker Compose) and Production
**Data file:** `data/example-2026-02-24.csv` (551 L2 voters, 55 columns, Bibb County GA)

---

## How to Use This Document

Each test is written in plain English so a human tester or an AI agent can follow it step by step. Tests are grouped by feature area and numbered for traceability. Each test includes:

- **Preconditions** — what must be true before starting
- **Steps** — exact actions to perform
- **Expected Results** — what you should observe

When a test says "validate" or "confirm," it means visually verify in the UI (or programmatically assert for automated tests).

---

## Features To Build Before Testing

The following features do not exist yet and must be implemented before the corresponding tests can run:

1. **Voter Interaction (Note) Edit and Delete** — Currently append-only. Add PATCH and DELETE endpoints for interactions of type "note," plus Edit/Delete buttons in the History tab of the voter detail page.
2. **Walk List Rename/Edit UI** — The backend PATCH endpoint exists but no frontend UI to rename a walk list. Add an edit action (inline rename or edit dialog) to the canvassing index page and/or walk list detail page.
3. **In-App Test User Provisioning** — Users are created in ZITADEL. For automated E2E testing, either create a ZITADEL API script to provision test users, or create test users manually in ZITADEL before the test run and document their credentials.

---

## 1. Prerequisites & Setup

### 1.1 Environment Startup
1. Run `docker compose up -d` to start all services (API, PostgreSQL, MinIO, ZITADEL).
2. Confirm the API is healthy at `http://localhost:8000/api/v1/config/public`.
3. Confirm the web UI loads at `http://localhost:8000`.
4. Run the seed script: `docker compose exec api bash -c "PYTHONPATH=/home/app python /home/app/scripts/seed.py"`.

### 1.2 Test User Provisioning

Create the following test users in ZITADEL (or via provisioning script). Each user needs a unique email and password.

| # | Display Name | Email | Intended Campaign Role | Intended Org Role |
|---|---|---|---|---|
| 1 | Test Owner 1 | owner1@test.civicpulse.local | owner | org_owner |
| 2 | Test Owner 2 | owner2@test.civicpulse.local | owner | org_owner |
| 3 | Test Owner 3 | owner3@test.civicpulse.local | owner | org_owner |
| 4 | Test Admin 1 | admin1@test.civicpulse.local | admin | org_admin |
| 5 | Test Admin 2 | admin2@test.civicpulse.local | admin | org_admin |
| 6 | Test Admin 3 | admin3@test.civicpulse.local | admin | org_admin |
| 7 | Test Manager 1 | manager1@test.civicpulse.local | manager | — |
| 8 | Test Manager 2 | manager2@test.civicpulse.local | manager | — |
| 9 | Test Manager 3 | manager3@test.civicpulse.local | manager | — |
| 10 | Test Volunteer 1 | volunteer1@test.civicpulse.local | volunteer | — |
| 11 | Test Volunteer 2 | volunteer2@test.civicpulse.local | volunteer | — |
| 12 | Test Volunteer 3 | volunteer3@test.civicpulse.local | volunteer | — |
| 13 | Test Viewer 1 | viewer1@test.civicpulse.local | viewer | — |
| 14 | Test Viewer 2 | viewer2@test.civicpulse.local | viewer | — |
| 15 | Test Viewer 3 | viewer3@test.civicpulse.local | viewer | — |

**Note:** After each user logs in for the first time, they will be synced to the app. Org roles and campaign roles are assigned via the org member and campaign member management UIs respectively.

### 1.3 Test Campaign Setup
1. Log in as Test Owner 1.
2. Create a new organization (if not using the seed org).
3. Create a test campaign named "E2E Test Campaign" within that org.
4. This campaign will be used for all subsequent tests unless stated otherwise.

---

## 2. Authentication & Login

### AUTH-01: Login with valid credentials
**Steps:**
1. Navigate to the app root URL.
2. Click "Log In" (or get redirected to login page).
3. Enter valid credentials for Test Owner 1.
4. Complete the OIDC flow through ZITADEL.
**Expected:** User is redirected to the org dashboard. Display name appears in the sidebar/header. The org dashboard shows the test campaign.

### AUTH-02: Login each test user
**Steps:**
1. For each of the 15 test users, log in and confirm:
   - The OIDC flow completes without error.
   - The user lands on the org dashboard (or is redirected to campaign if single-campaign).
   - The user's display name is visible.
2. After login, navigate to the test campaign.
**Expected:** All 15 users can log in successfully and access the test campaign (at their respective permission level).

### AUTH-03: Logout
**Steps:**
1. Log in as any test user.
2. Click the user menu / logout button.
3. Confirm the user is logged out and redirected to the login page.
4. Attempt to navigate directly to a protected route (e.g., the campaign dashboard).
**Expected:** The user is redirected to the login page. No campaign data is visible.

### AUTH-04: Repeat logout for 5 different users
**Steps:**
1. Log in as Test Owner 1, log out.
2. Log in as Test Admin 1, log out.
3. Log in as Test Manager 1, log out.
4. Log in as Test Volunteer 1, log out.
5. Log in as Test Viewer 1, log out.
**Expected:** Each login/logout cycle completes cleanly. No session bleed between users.

---

## 3. Role-Based Access Control

### RBAC-01: Assign campaign roles to test users
**Precondition:** Logged in as Test Owner 1 in the test campaign.
**Steps:**
1. Navigate to Campaign Settings > Members.
2. Invite each test user by email and assign their intended campaign role (from the table in 1.2).
3. Confirm each user appears in the member list with the correct role badge.
**Expected:** All 15 users are members of the test campaign with correct roles.

### RBAC-02: Assign org roles
**Precondition:** Logged in as Test Owner 1.
**Steps:**
1. Navigate to Organization > Members.
2. Find each intended org_owner and org_admin user.
3. Set their org role accordingly.
**Expected:** Org role changes are reflected in the member directory. Per-campaign role matrix shows the correct additive resolution.

### RBAC-03: Viewer cannot access mutation actions
**Precondition:** Logged in as Test Viewer 1, navigated to test campaign.
**Steps:**
1. Navigate to Voters page — confirm "Add Voter" button is NOT visible.
2. Navigate to a voter detail page — confirm "Edit" button is NOT visible.
3. Navigate to Canvassing — confirm "New Turf" button is NOT visible.
4. Navigate to Phone Banking > Call Lists — confirm "New Call List" button is NOT visible.
5. Navigate to Surveys — confirm "New Survey" button is NOT visible.
6. Navigate to Volunteers > Roster — confirm no edit/delete actions on volunteer rows.
7. Navigate to Campaign Settings — confirm settings are read-only or the page is inaccessible.
8. Attempt to navigate directly to `/campaigns/{id}/canvassing/turfs/new` via URL.
**Expected:** All mutation buttons are hidden or disabled. Direct URL access either redirects or shows a permission error. The viewer can view data but cannot change anything.

### RBAC-04: Volunteer can record interactions but not manage
**Precondition:** Logged in as Test Volunteer 1.
**Steps:**
1. Navigate to a voter detail page — confirm "Add Interaction" button IS visible but "Edit" (voter data) button is NOT visible.
2. Navigate to Canvassing — confirm no "New Turf" or "Delete" actions.
3. Navigate to Phone Banking > Sessions — if assigned to a session, confirm the calling screen is accessible.
4. Navigate to Campaign Settings — confirm the page is inaccessible or members/danger sections are hidden.
**Expected:** Volunteers can view data and record interactions/outcomes, but cannot create/edit/delete turfs, walk lists, call lists, surveys, or campaign settings.

### RBAC-05: Manager can create and manage operational resources
**Precondition:** Logged in as Test Manager 1.
**Steps:**
1. Navigate to Voters — confirm "Add Voter" button is visible.
2. Navigate to a voter detail — confirm "Edit" button is visible.
3. Navigate to Canvassing — confirm "New Turf" button is visible.
4. Navigate to Phone Banking — confirm "New Call List" and "New Session" buttons are visible.
5. Navigate to Surveys — confirm "New Survey" button is visible.
6. Navigate to Volunteers — confirm registration and management actions are available.
7. Navigate to Campaign Settings — confirm Members section is NOT accessible (admin+ only).
**Expected:** Managers can create and manage all operational resources (voters, turfs, walk lists, call lists, surveys, volunteers, shifts) but cannot manage campaign members or campaign settings.

### RBAC-06: Admin can manage members and settings
**Precondition:** Logged in as Test Admin 1.
**Steps:**
1. Confirm all manager capabilities from RBAC-05 are available.
2. Navigate to Campaign Settings > Members — confirm the page loads and invite/role-change/remove actions are available.
3. Navigate to Campaign Settings > General — confirm campaign name/description can be edited.
4. Navigate to Campaign Settings > Danger Zone — confirm it's visible but ownership transfer and delete campaign may require owner role.
**Expected:** Admins have all manager capabilities plus member management and campaign settings access.

### RBAC-07: Owner has full access including destructive actions
**Precondition:** Logged in as Test Owner 1.
**Steps:**
1. Confirm all admin capabilities from RBAC-06 are available.
2. Navigate to Campaign Settings > Danger Zone — confirm "Transfer Ownership" and "Delete Campaign" buttons are visible and functional (do NOT actually delete the test campaign — test on a separate throwaway campaign).
**Expected:** Owners can do everything including ownership transfer and campaign deletion.

### RBAC-08: Org Admin has admin-equivalent access across all campaigns
**Precondition:** Test Admin 1 has org_admin role. A second campaign exists in the org.
**Steps:**
1. Log in as Test Admin 1.
2. Navigate to the second campaign (which they were not explicitly invited to).
3. Confirm they have admin-level access (can manage members, settings).
**Expected:** Org admin role grants admin-equivalent access to all campaigns within the org via additive role resolution.

### RBAC-09: Org Owner has owner-equivalent access across all campaigns
**Precondition:** Test Owner 1 has org_owner role.
**Steps:**
1. Repeat RBAC-08 steps but as Test Owner 1.
2. Confirm owner-level access on all campaigns including danger zone actions.
**Expected:** Org owner role grants owner-equivalent access across all campaigns.

---

## 4. Organization Management

### ORG-01: View org dashboard
**Precondition:** Logged in as Test Owner 1.
**Steps:**
1. Navigate to the root URL (/).
2. Confirm the org dashboard loads showing:
   - Campaign card grid with the test campaign.
   - Stats bar (total campaigns, active campaigns, members).
   - Organization name in the header.
**Expected:** Dashboard renders with correct campaign cards and stats.

### ORG-02: Create a new campaign from org dashboard
**Steps:**
1. Click "New Campaign" button on the org dashboard.
2. Complete the 3-step campaign creation wizard:
   - **Step 1 (Details):** Enter name "Secondary Test Campaign", description "For E2E testing."
   - **Step 2 (Review):** Confirm details are correct, click Next.
   - **Step 3 (Invite Team):** Optionally add a team member with a role, then click Finish.
3. Confirm redirect to the new campaign's dashboard.
**Expected:** Campaign is created. It appears on the org dashboard. If team members were invited, they appear in the campaign's member list.

### ORG-03: Archive a campaign
**Steps:**
1. On the org dashboard, find the "Secondary Test Campaign" card.
2. Click the archive action (menu or button on the card).
3. Confirm the archive dialog/confirmation.
4. Confirm the campaign card moves to an "Archived" section or is visually marked as archived.
**Expected:** Campaign is archived and visually distinguished from active campaigns.

### ORG-04: Unarchive a campaign
**Steps:**
1. Find the archived "Secondary Test Campaign."
2. Click the unarchive action.
3. Confirm it returns to the active campaign grid.
**Expected:** Campaign is restored to active status.

### ORG-05: Edit organization name
**Steps:**
1. Navigate to Organization > Settings.
2. Change the organization name to "E2E Test Org (Renamed)".
3. Click Save.
4. Confirm the name updates in the header and settings page.
5. Change it back to the original name.
**Expected:** Organization name updates successfully and reflects across the UI.

### ORG-06: View org member directory
**Steps:**
1. Navigate to Organization > Members.
2. Confirm the member list shows all test users who have logged in.
3. For each member, confirm:
   - Display name and email are shown.
   - Org role (if assigned) is displayed.
   - Per-campaign role matrix shows their role in each campaign.
**Expected:** Member directory accurately reflects all users, their org roles, and per-campaign roles.

### ORG-07: Change a member's org role
**Steps:**
1. Navigate to Organization > Members.
2. Find Test Manager 1 (who has no org role).
3. Assign them the org_admin role.
4. Confirm the role badge updates.
5. Log in as Test Manager 1 and confirm they have admin-level access on all campaigns.
6. Remove the org_admin role from Test Manager 1 to restore original state.
**Expected:** Org role changes take effect immediately and affect cross-campaign access.

### ORG-08: Org switcher (multi-org users)
**Precondition:** User belongs to multiple organizations (may need a second org for this test).
**Steps:**
1. Log in as a user who belongs to 2+ organizations.
2. Click the org switcher in the header/sidebar.
3. Switch to a different organization.
4. Confirm the dashboard, campaigns, and member list reflect the selected org.
**Expected:** Org switching is seamless. Data from the previous org is not visible.

---

## 5. Campaign Settings

### CAMP-01: Edit campaign general settings
**Precondition:** Logged in as Test Admin 1, navigated to test campaign.
**Steps:**
1. Navigate to Campaign Settings > General.
2. Change the campaign name to "E2E Test Campaign (Updated)".
3. Update the description.
4. Click Save.
5. Confirm the sidebar/header reflects the new name.
6. Revert the name back to "E2E Test Campaign".
**Expected:** Campaign name and description update and reflect across navigation.

### CAMP-02: Invite a new member
**Steps:**
1. Navigate to Campaign Settings > Members.
2. Click "Invite" or "Add Member."
3. Enter an email address of an existing ZITADEL user not yet in this campaign.
4. Select a role (e.g., "volunteer").
5. Submit the invitation.
6. Confirm the invited user appears in the member list (possibly in a "pending" state).
**Expected:** Invitation is sent. The member appears in the list.

### CAMP-03: Change a member's campaign role
**Steps:**
1. In Campaign Settings > Members, find a test user.
2. Change their role (e.g., volunteer → manager).
3. Confirm the role badge updates.
4. Log in as that user and confirm their access level changed.
**Expected:** Role change is immediate and affects the user's permissions.

### CAMP-04: Remove a member from campaign
**Steps:**
1. In Campaign Settings > Members, find a test user (not the owner).
2. Click Remove / Delete.
3. Confirm the removal dialog.
4. Confirm the user no longer appears in the member list.
5. Log in as that user and confirm they can no longer access the campaign.
6. Re-invite the user to restore state for subsequent tests.
**Expected:** Removed user loses access to the campaign.

### CAMP-05: Transfer campaign ownership
**Precondition:** Create a throwaway campaign for this test.
**Steps:**
1. Log in as the campaign owner.
2. Navigate to Campaign Settings > Danger Zone.
3. Click "Transfer Ownership."
4. Select a target user (e.g., Test Admin 1).
5. Complete the type-to-confirm dialog.
6. Confirm the ownership transfer succeeds.
7. Log in as the previous owner and confirm they are no longer the owner.
8. Log in as the new owner and confirm they have owner access.
**Expected:** Ownership transfers. The previous owner retains whatever role remains (or is removed).

### CAMP-06: Delete a campaign
**Precondition:** Create a throwaway campaign for this test.
**Steps:**
1. Log in as the campaign owner.
2. Navigate to Campaign Settings > Danger Zone.
3. Click "Delete Campaign."
4. Type the campaign name in the confirmation dialog (type-to-confirm).
5. Submit.
6. Confirm redirect to the org dashboard.
7. Confirm the campaign no longer appears in the campaign list.
**Expected:** Campaign is permanently deleted. All associated data is removed.

---

## 6. Campaign Dashboard

### DASH-01: View campaign dashboard KPIs
**Precondition:** Logged in, navigated to the test campaign dashboard. Seed data provides some baseline data.
**Steps:**
1. Navigate to the campaign dashboard.
2. Confirm the following stat cards are displayed:
   - Doors Knocked (canvassing metric)
   - Contacts Made (canvassing metric)
   - Contact Rate (canvassing metric, formatted as percentage)
   - Calls Made (phone banking metric)
   - Contacts Reached (phone banking metric)
   - Active Volunteers (volunteer metric, with total volunteers subtitle)
3. Confirm stat values are numbers (not NaN or undefined).
4. If seed data has values, confirm they are non-zero and plausible.
**Expected:** All 6 stat cards render with valid numeric values.

### DASH-02: Dashboard loads for all roles
**Steps:**
1. Log in as each role (owner, admin, manager, volunteer, viewer).
2. Navigate to the campaign dashboard.
3. Confirm the dashboard loads without errors for all roles.
**Expected:** Dashboard is viewable by all roles.

---

## 7. Voter Import

### IMP-01: Import L2 voter file
**Precondition:** Logged in as Test Manager 1 (or above), in the test campaign.
**Steps:**
1. Navigate to Voters > Imports.
2. Click "New Import" or "Import Voters."
3. On the import wizard:
   - **Step 1 (Upload):** Upload `data/example-2026-02-24.csv`.
   - Confirm the file is accepted and column count is displayed.
4. **Step 2 (Column Mapping):**
   - Confirm the L2 format is auto-detected (banner indicating "L2 format detected").
   - Confirm all 55 columns are auto-mapped with match-type badges (exact/fuzzy).
   - Verify at minimum these mappings are correct:
     - "Voter ID" → voter_file_id
     - "First Name" → first_name
     - "Last Name" → last_name
     - "Registered Party" → party
     - "Cell Phone" → cell phone field
     - "Address" → registration address
     - "General_2024" → voting history
     - "Likelihood to vote" → propensity score
   - Confirm no columns show "unmapped" (all 55 should auto-map for L2).
5. **Step 3 (Preview):** Confirm a preview of the first few rows is shown with mapped field names.
6. **Step 4 (Confirm):** Click "Start Import."
7. Confirm the import job starts and the progress indicator appears.
8. Wait for import to complete (poll progress or watch the progress bar).
9. Confirm final status shows "Complete" with 551 voters imported.
**Expected:** All 551 voters from the example CSV are imported. Import history shows the completed job.

### IMP-02: Validate import progress and history
**Steps:**
1. Navigate to Voters > Imports.
2. Confirm the completed import job appears in the history list.
3. Confirm it shows: file name, row count, status (complete), timestamp.
4. If any rows had errors, confirm the "Download Error Report" link is present.
**Expected:** Import history accurately reflects the completed import.

### IMP-03: Concurrent import prevention
**Steps:**
1. Start a new import (upload a small CSV or re-upload the example file).
2. While the first import is in progress, attempt to start a second import.
3. Confirm the second import is blocked with a 409 Conflict error or a UI message saying an import is already in progress.
**Expected:** Only one import can run at a time per campaign.

### IMP-04: Cancel an import
**Steps:**
1. Start a new import with the full dataset (`data/full-2026-02-24.csv` if available, or re-import `example-2026-02-24.csv`).
2. While the import is in progress, click the "Cancel" button.
3. Confirm a ConfirmDialog appears asking to confirm cancellation.
4. Confirm the cancellation.
5. Confirm the import status changes to "Cancelled."
6. Confirm the voters imported before cancellation are retained.
**Expected:** Import is cancelled gracefully. Partially imported data is preserved.

---

## 8. Voter Data Validation

### VAL-01: Validate imported voter data (40 voters)
**Precondition:** Import from IMP-01 is complete.
**Steps:**
1. Open the example CSV file alongside the app.
2. Select 40 voters from the CSV that represent diverse data:
   - 5 voters from different streets.
   - 5 voters who HAVE a cell phone number.
   - 5 voters who DO NOT have a cell phone number.
   - 5 voters with voting history entries (General/Primary).
   - 5 voters with different party registrations.
   - 5 voters with different age ranges (young, middle, senior).
   - 5 voters with mailing addresses.
   - 5 voters with propensity scores at different levels (high/medium/low/missing).
3. For each voter, search by name in the Voters page.
4. Click into the voter detail page.
5. Verify each field against the CSV:
   - Full name (first, last).
   - Party registration.
   - Age / date of birth.
   - Registration address (street, city, state, zip).
   - Propensity scores (general, primary, combined) displayed as badges.
   - Cell phone (in Contacts tab).
   - Voting history (in Overview tab, year-grouped table).
   - Mailing address (if present in CSV).
   - Gender, ethnicity, spoken language (if displayed).
   - Household data (household size, household party registration).
   - Military status (if present).
**Expected:** All 40 voters' data matches the source CSV exactly. Propensity badges show correct color coding (green >=67, yellow 34-66, red <34).

### VAL-02: Validate missing data (20 voters)
**Steps:**
1. Select 20 voters NOT used in VAL-01 who have some missing fields in the CSV (empty cells).
2. For each voter, navigate to their detail page.
3. For each missing field, confirm:
   - The field shows "N/A", "—", or is absent (not showing false data).
   - The corresponding cell in the CSV is indeed empty or missing.
4. Document at least:
   - 5 voters missing phone numbers → Contacts tab shows no phone.
   - 5 voters missing mailing addresses → no mailing address card.
   - 5 voters missing propensity scores → badges show "N/A."
   - 5 voters missing voting history → no voting history rows.
**Expected:** Missing data is correctly represented as absent, not as zeroes or garbage values.

---

## 9. Voter Search & Filtering

### FLT-01: Text search by name
**Steps:**
1. Navigate to the Voters page.
2. Type a known first name from the CSV into the search box.
3. Confirm matching voters appear in the results.
4. Clear the search.
5. Type a known last name.
6. Confirm matching voters appear.
**Expected:** Text search filters voters by first or last name.

### FLT-02: Test every filter dimension
For each of the following filter dimensions, apply the filter, confirm results are correct against the CSV data, then remove the filter:

1. **Party** — Select "Democrat." Confirm all results are Democrats. Select "Republican." Confirm results change.
2. **Gender** — Select "Male." Confirm results. Select "Female." Confirm results.
3. **Age range** — Set min=25, max=35. Confirm all results are in that age range.
4. **Propensity: General** — Set min=50, max=100. Confirm all results have general propensity >= 50.
5. **Propensity: Primary** — Set min=0, max=30. Confirm low-propensity voters.
6. **Propensity: Combined** — Set a range. Verify results.
7. **Has phone** — Filter for voters with phone numbers. Confirm all results have a cell phone.
8. **Has no phone** — Filter for voters without phone numbers. Confirm none have a cell phone.
9. **Voting history** — Filter for General_2024 voters. Confirm all results voted in 2024 general.
10. **Voting history (primary)** — Filter for Primary_2024. Confirm results.
11. **Voting history (multiple)** — Filter for voters who voted in both 2024 and 2020.
12. **Registration city** — Filter by "Macon" or the city in the CSV.
13. **Registration state** — Filter by "GA."
14. **Registration zip** — Filter by a known zip code from the CSV.
15. **Ethnicity** — Select one or more ethnicity values. Confirm results.
16. **Spoken language** — Filter by a specific language. Confirm results.
17. **Marital status** — Filter by a specific status. Confirm results.
18. **Household size** — Set a range. Confirm results.
19. **Household party registration** — Select a value. Confirm results.
20. **Military status** — Filter for active/veteran. Confirm results.
21. **Party change indicator** — Filter for voters who changed party. Confirm results.
22. **Street number odd/even** — Filter for odd. Confirm results.
23. **Apartment type** — Filter by a type. Confirm results.

### FLT-03: Combined filters
**Steps:**
1. Apply Party = "Democrat" AND Age range 30-50 AND Has Phone = true.
2. Confirm results satisfy ALL three criteria.
3. Confirm filter chips appear for each active filter, with correct category colors.
4. Dismiss one chip (e.g., Age range) by clicking the X.
5. Confirm the results update to reflect only the remaining two filters.
6. Clear all filters.
**Expected:** Filters are composable (AND logic). Filter chips are dismissible and results update in real time.

### FLT-04: Sort voters
**Steps:**
1. On the Voters page, click the "Last Name" column header to sort ascending.
2. Confirm voters are sorted A-Z by last name.
3. Click again to sort descending (Z-A).
4. Repeat for other sortable columns: First Name, Party, Age, City.
**Expected:** Sorting works in both directions for all sortable columns.

### FLT-05: Pagination
**Steps:**
1. With no filters applied (551 voters), confirm the first page loads with a set number of rows.
2. Scroll or click "Load More" / "Next Page" to load additional voters.
3. Continue until all 551 voters have been loaded or the end of the list is reached.
**Expected:** Pagination loads additional results correctly. No duplicate voters. Total count is consistent.

---

## 10. Voter CRUD

### VCRUD-01: Create 20 new voters
**Precondition:** Logged in as Test Manager 1.

Create 20 voters with varying data to test all form fields. Each voter should use a different combination:

| # | First | Last | DOB | Party | Address | City | State | Zip | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Test | Alpha | 1990-01-15 | Democrat | 100 Test St | Macon | GA | 31201 | Full data |
| 2 | Test | Bravo | 1985-06-20 | Republican | 200 Test Ave | Macon | GA | 31201 | Full data |
| 3 | Test | Charlie | 2000-03-10 | Independent | — | — | — | — | No address |
| 4 | Test | Delta | 1975-11-30 | Libertarian | 400 Test Blvd | Warner Robins | GA | 31088 | Different city |
| 5 | Test | Echo | 1960-08-05 | Democrat | 500 Test Dr | Macon | GA | 31204 | Senior voter |
| 6 | Test | Foxtrot | 1998-02-14 | — | 600 Test Ln | Macon | GA | 31201 | No party |
| 7 | Test | Golf | 1982-07-22 | Republican | 700 Test Way | Macon | GA | 31210 | Middle age |
| 8 | Test | Hotel | 2002-12-01 | Democrat | — | — | — | — | Young, no address |
| 9 | Test | India | 1970-04-18 | Green | 900 Test Ct | Macon | GA | 31201 | Minor party |
| 10 | Test | Juliet | 1955-09-25 | Democrat | 1000 Test Pl | Macon | GA | 31201 | Oldest |
| 11 | Test | Kilo | 1992-01-01 | Republican | 1100 Test Rd | Macon | GA | 31201 | Propensity general: 85 |
| 12 | Test | Lima | 1988-05-05 | Democrat | 1200 Test St | Macon | GA | 31201 | Propensity primary: 20 |
| 13 | Test | Mike | 1995-10-10 | Independent | 1300 Test Ave | Macon | GA | 31201 | Propensity combined: 55 |
| 14 | Test | November | 1978-03-15 | Democrat | 1400 Test Blvd | Macon | GA | 31201 | Full propensity set |
| 15 | Test | Oscar | 1965-07-30 | Republican | 1500 Test Dr | Macon | GA | 31201 | Standard |
| 16 | Test | Papa | 2001-11-11 | Democrat | 1600 Test Ln | Macon | GA | 31204 | Youngest adult |
| 17 | Test | Quebec | 1983-06-06 | — | 1700 Test Way | Macon | GA | 31210 | No party, has address |
| 18 | Test | Romeo | 1972-08-20 | Libertarian | 1800 Test Ct | Macon | GA | 31201 | Minor party 2 |
| 19 | Test | Sierra | 1990-12-25 | Democrat | 1900 Test Pl | Macon | GA | 31201 | Birthday edge case |
| 20 | Test | Tango | 1945-01-01 | Republican | 2000 Test Rd | Macon | GA | 31201 | Elderly voter |

**Steps for each voter:**
1. Navigate to Voters page.
2. Click "+ Add Voter" button.
3. Fill in the voter creation sheet with the data from the table above.
4. Click Save/Create.
5. Confirm a success toast appears.
6. Search for the voter by name and confirm they appear in the list.
7. Click into the voter detail page and confirm all entered data is displayed correctly.
**Expected:** All 20 voters are created with correct data. The voter count increases by 20.

### VCRUD-02: Edit 5 created voters
**Steps:**
1. Navigate to the detail page for Test Alpha.
2. Click the "Edit" button (pencil icon, requires manager+ role).
3. In the VoterEditSheet, change the party from "Democrat" to "Independent."
4. Save. Confirm the change is reflected on the detail page.
5. Repeat for 4 more voters, changing different fields each time:
   - Test Bravo: Change address.
   - Test Charlie: Add an address (was empty).
   - Test Delta: Change city.
   - Test Echo: Change DOB.
**Expected:** Edits are saved and immediately reflected in the UI.

### VCRUD-03: Delete 5 imported voters
**Steps:**
1. Navigate to the Voters page.
2. Search for 5 voters from the imported CSV (not the 20 test-created ones). Note their full names.
3. For each voter:
   a. Click the row action menu (three dots / MoreHorizontal icon).
   b. Click "Delete."
   c. Confirm the DestructiveConfirmDialog by typing the required confirmation.
   d. Confirm the success toast.
   e. Search for the deleted voter by name — confirm they no longer appear.
4. Navigate to Voter Lists — confirm deleted voters don't appear in any list.
5. If any deleted voter was in a turf, check that turf's voter count decreased.
**Expected:** All 5 voters are permanently deleted and absent from all views (voter list, voter lists, turfs).

### VCRUD-04: Delete 20 test-created voters
**Steps:**
1. For each of the 20 voters created in VCRUD-01:
   a. Search for them by name.
   b. Delete them using the row action menu > Delete.
   c. Confirm the deletion.
2. After all 20 are deleted, confirm the total voter count returned to the post-import count minus the 5 deleted in VCRUD-03.
3. Search for "Test Alpha", "Test Bravo", etc. — confirm none appear.
**Expected:** All 20 test voters are gone. Total voter count is consistent (551 - 5 = 546).

---

## 11. Voter Contacts

### CON-01: Add phone numbers to 20 voters
**Steps:**
1. For 20 different voters (mix of imported and diverse data):
   a. Navigate to their detail page.
   b. Click the "Contacts" tab.
   c. Click "Add Phone" button.
   d. Enter a test phone number (e.g., 478-555-0001 through 478-555-0020).
   e. Select phone type (mobile, home, work — vary across voters).
   f. Save. Confirm the phone appears in the contacts list.
**Expected:** Phone numbers are added and displayed correctly with type labels.

### CON-02: Add email addresses to 20 voters
**Steps:**
1. For the same or different 20 voters:
   a. Navigate to Contacts tab.
   b. Click "Add Email."
   c. Enter a test email (e.g., voter1@test.com through voter20@test.com).
   d. Save. Confirm the email appears.
**Expected:** Emails are added and displayed correctly.

### CON-03: Add mailing addresses to 20 voters
**Steps:**
1. For 20 voters:
   a. Navigate to Contacts tab.
   b. Click "Add Address" (mailing address).
   c. Enter address fields (line1, city, state, zip).
   d. Save. Confirm the address appears.
**Expected:** Mailing addresses are added and displayed correctly.

### CON-04: Edit contacts
**Steps:**
1. For 10 of the voters with added contacts:
   a. Edit a phone number (change the number or type).
   b. Edit an email (change the address).
   c. Edit a mailing address (change a field).
   d. Save each edit. Confirm changes are reflected.
**Expected:** Contact edits persist and display correctly.

### CON-05: Delete contacts
**Steps:**
1. For 10 voters:
   a. Delete a phone number. Confirm it's removed.
   b. Delete an email. Confirm it's removed.
   c. Delete a mailing address. Confirm it's removed.
**Expected:** Contacts are permanently removed.

### CON-06: Validate imported contact data
**Steps:**
1. Find 5 voters from the CSV who HAVE a cell phone number.
   - Navigate to their Contacts tab.
   - Confirm the phone number matches the CSV's "Cell Phone" column.
2. Find 5 voters from the CSV who DO NOT have a cell phone.
   - Navigate to their Contacts tab.
   - Confirm no phone is listed (or only manually added ones from CON-01).
3. Repeat for mailing addresses:
   - Find 5 voters with mailing address data in CSV → confirm present.
   - Find 5 voters without mailing address data in CSV → confirm absent.
**Expected:** Imported contact data matches the source CSV.

---

## 12. Voter Tags

### TAG-01: Create 10 voter tags
**Precondition:** Logged in as Test Manager 1.
**Steps:**
1. Navigate to Voters > Tags.
2. Click "Create Tag" (or equivalent button).
3. Create 10 tags with descriptive names:
   - "Priority Voter", "Door Knocked", "Phone Contacted", "Supporter", "Undecided",
   - "Opposed", "Moved Away", "Wrong Number", "Spanish Speaker", "Needs Follow-up"
4. Confirm each tag appears in the tag list.
**Expected:** 10 tags are created and listed.

### TAG-02: Add tags to 40 voters (1-10 random tags each)
**Steps:**
1. For 40 different voters:
   a. Navigate to their detail page > Tags tab.
   b. Add between 1 and 10 tags (randomly selected from the 10 created tags).
   c. Confirm the tags appear as badges on the voter's Tags tab.
2. Keep a record of which voters got which tags for validation.
**Expected:** Tags are applied and visible on each voter's detail page.

### TAG-03: Validate tags appear on voters
**Steps:**
1. For 10 of the tagged voters, navigate to their detail page.
2. Confirm the Tags tab shows the exact tags assigned in TAG-02.
3. Navigate to the Voters list page and confirm tagged voters show tag badges (if displayed in the list view).
**Expected:** Tag assignments are persistent and visible.

### TAG-04: Remove tags from all tagged voters
**Steps:**
1. For each of the 40 tagged voters:
   a. Navigate to their Tags tab.
   b. Remove all assigned tags one by one (click X or remove button on each tag badge).
   c. Confirm the Tags tab shows no tags.
**Expected:** All tags are removed from all voters.

### TAG-05: Delete all 10 test tags
**Steps:**
1. Navigate to Voters > Tags.
2. Delete each of the 10 test tags.
3. Confirm the tag list is empty (or back to its pre-test state).
**Expected:** Tags are permanently deleted.

---

## 13. Voter Notes (Interactions)

### NOTE-01: Add 5 notes to 20 voters
**Steps:**
1. For 20 different voters:
   a. Navigate to their detail page.
   b. Click "Add Interaction" button (which switches to the History tab).
   c. Add 5 notes with different text content:
      - "Initial contact - friendly"
      - "Called back, left voicemail"
      - "Spoke about Issue A, very interested"
      - "Requested yard sign"
      - "Confirmed supporter - will volunteer"
   d. Confirm each note appears in the History tab with:
      - Note text
      - Created by (user display name)
      - Timestamp
**Expected:** 100 total notes created (5 per voter x 20 voters). All display correctly in the History tab.

### NOTE-02: Edit notes (REQUIRES FEATURE BUILD)
**Precondition:** Note edit functionality has been implemented.
**Steps:**
1. For 10 of the 20 voters from NOTE-01:
   a. Navigate to their History tab.
   b. Find one of the 5 notes.
   c. Click Edit.
   d. Change the note text (e.g., append " - UPDATED").
   e. Save. Confirm the updated text is displayed.
   f. Confirm the original timestamp is preserved (or an "edited" indicator appears).
**Expected:** Notes can be edited. Edited content persists. Edit history or indicator is shown.

### NOTE-03: Delete notes (REQUIRES FEATURE BUILD)
**Precondition:** Note delete functionality has been implemented.
**Steps:**
1. For all 20 voters from NOTE-01:
   a. Navigate to their History tab.
   b. Delete ALL 5 test notes.
   c. Confirm the History tab no longer shows the deleted notes.
   d. Confirm system-generated interactions (import, tag_added, etc.) are NOT affected.
**Expected:** All 100 test notes are deleted. System interactions remain.

---

## 14. Voter Lists

### VLIST-01: Create a static voter list
**Steps:**
1. Navigate to Voters > Lists.
2. Click "Create List."
3. Enter name "E2E Static Test List", type = Static.
4. Save. Confirm the list appears.
**Expected:** Static list is created and empty.

### VLIST-02: Add voters to a static list
**Steps:**
1. Navigate to the "E2E Static Test List" detail page.
2. Click "+ Add Voters."
3. In the AddVotersDialog, search for and select 20 voters.
4. Confirm. Confirm the list now shows 20 members.
**Expected:** Voters are added to the static list.

### VLIST-03: Remove voters from a static list
**Steps:**
1. On the static list detail page, remove 5 voters.
2. Confirm the list count decreases to 15.
**Expected:** Voters are removed. They still exist as voters but are no longer in this list.

### VLIST-04: Create a dynamic voter list
**Steps:**
1. Navigate to Voters > Lists.
2. Click "Create List."
3. Enter name "E2E Dynamic Test List", type = Dynamic.
4. Define filter criteria (e.g., Party = "Democrat" AND Age > 30).
5. Save.
6. Navigate to the list detail page.
7. Confirm the list shows voters matching the filter criteria.
**Expected:** Dynamic list auto-populates based on filter criteria.

### VLIST-05: Edit a list name
**Steps:**
1. Navigate to Voters > Lists.
2. Find "E2E Static Test List."
3. Click the edit action (pencil icon or menu).
4. Rename to "E2E Static Test List (Renamed)."
5. Save. Confirm the name updates.
**Expected:** List rename persists.

### VLIST-06: Delete voter lists
**Steps:**
1. Delete the "E2E Static Test List (Renamed)."
2. Delete the "E2E Dynamic Test List."
3. Confirm both are removed from the lists page.
**Expected:** Lists are permanently deleted. Voters in those lists are NOT deleted.

---

## 15. Canvassing — Turfs

### TURF-01: Create 5 non-overlapping turfs in Bibb County GA
**Precondition:** Logged in as Test Manager 1.
**Steps:**
1. Navigate to Canvassing > click "New Turf."
2. On the turf creation page (map with Leaflet/Geoman):
   a. Enter turf name: "E2E Turf North"
   b. Draw a polygon boundary in the northern part of Bibb County.
   c. Save the turf.
3. Repeat for 4 more turfs:
   - "E2E Turf South" — southern area, no overlap with North.
   - "E2E Turf East" — eastern area, no overlap.
   - "E2E Turf West" — western area, no overlap.
   - "E2E Turf Central" — central area, no overlap with the other 4.
4. For each turf, confirm:
   - It appears in the turfs table on the canvassing page.
   - It appears on the overview map.
   - Voter count is shown (voters within the polygon).
**Expected:** 5 non-overlapping turfs are created with correct voter counts.

### TURF-02: Create 5 overlapping turfs
**Steps:**
1. Create 5 more turfs that intentionally overlap with the first 5:
   - "E2E Overlap NE" — overlaps North and East.
   - "E2E Overlap NW" — overlaps North and West.
   - "E2E Overlap SE" — overlaps South and East.
   - "E2E Overlap SW" — overlaps South and West.
   - "E2E Overlap Center" — overlaps Central and at least one other turf.
2. For each overlapping turf creation, confirm:
   - The overlap detection highlights the overlapping areas during creation.
   - An overlap warning or visual indicator is shown.
   - The turf can still be saved despite the overlap.
**Expected:** 5 overlapping turfs are created. Overlap detection works and is visually indicated.

### TURF-03: Edit 3 turfs' boundaries
**Steps:**
1. Navigate to the detail page for "E2E Turf North."
2. Click Edit (to enter polygon edit mode on the map).
3. Drag a vertex to slightly adjust the turf boundary.
4. Save. Confirm the updated boundary is reflected on the overview map and voter count may change.
5. Repeat for "E2E Turf East" and "E2E Turf Central."
**Expected:** Turf boundaries update. Voter counts recalculate.

### TURF-04: GeoJSON import
**Steps:**
1. Create a valid GeoJSON Polygon file for a turf boundary.
2. Navigate to New Turf page.
3. Use the GeoJSON import feature to upload the file.
4. Confirm the polygon renders on the map from the GeoJSON data.
5. Save the turf.
**Expected:** GeoJSON import creates a valid turf boundary.

### TURF-05: GeoJSON export
**Steps:**
1. Navigate to an existing turf detail page.
2. Click the GeoJSON export/download button.
3. Confirm a .geojson file is downloaded.
4. Open the file and verify it contains a valid Polygon geometry.
**Expected:** Exported GeoJSON matches the turf's boundary.

### TURF-06: Address search on turf map
**Steps:**
1. Navigate to the turf creation or edit page.
2. Use the address search input.
3. Type "478 Mulberry St, Macon, GA" (or similar Bibb County address).
4. Confirm the map pans/zooms to the searched address.
**Expected:** Address search locates and centers on the searched address.

### TURF-07: Delete 2 turfs
**Steps:**
1. Navigate to the canvassing page.
2. Delete "E2E Overlap SW" and "E2E Overlap Center."
3. Confirm they are removed from the turfs table and the overview map.
**Expected:** Turfs are permanently deleted.

---

## 16. Canvassing — Walk Lists

### WL-01: Generate a walk list from a turf
**Steps:**
1. Navigate to the canvassing page.
2. Click "Generate Walk List" (WalkListGenerateDialog).
3. Select "E2E Turf North" as the source turf.
4. Enter name "E2E Walk List North."
5. Confirm/generate.
6. Confirm the walk list appears in the walk lists table with a voter count.
**Expected:** Walk list is generated with voters from the selected turf, ordered for efficient walking (household clustering).

### WL-02: View walk list details
**Steps:**
1. Click on "E2E Walk List North" to open the detail page.
2. Confirm:
   - Walk list entries are shown with voter names and addresses.
   - Entries are ordered for walking (by street/household).
   - Status indicators show each entry's completion state.
   - Google Maps navigation link is present.
**Expected:** Walk list detail page shows all entries with correct voter data and ordering.

### WL-03: Assign canvassers to walk list
**Steps:**
1. On the walk list detail page, click "Assign Canvasser" (or equivalent).
2. Select Test Volunteer 1 from the member picker.
3. Confirm the canvasser appears in the assignment section.
4. Assign Test Volunteer 2 as well.
**Expected:** Multiple canvassers can be assigned to a walk list.

### WL-04: Unassign a canvasser
**Steps:**
1. Remove Test Volunteer 2 from the walk list assignment.
2. Confirm they are no longer listed as assigned.
**Expected:** Canvasser is unassigned.

### WL-05: Rename a walk list (REQUIRES FEATURE BUILD)
**Precondition:** Walk list rename UI has been implemented.
**Steps:**
1. On the walk list detail page or canvassing index, find the rename/edit action.
2. Rename "E2E Walk List North" to "E2E Walk List North (Updated)."
3. Save. Confirm the name updates.
**Expected:** Walk list name is updated.

### WL-06: Delete a walk list
**Steps:**
1. Navigate to the canvassing page.
2. Delete "E2E Walk List North (Updated)" via the row action menu > Delete.
3. Confirm the deletion dialog.
4. Confirm the walk list is removed from the table.
**Expected:** Walk list is permanently deleted.

### WL-07: Create a walk list for further testing
**Steps:**
1. Generate a new walk list from "E2E Turf East" named "E2E Walk List — Active."
2. Assign Test Volunteer 1 as canvasser.
**Expected:** Walk list ready for field mode and door knock testing.

---

## 17. Phone Banking — Call Lists

### CL-01: Create a call list
**Steps:**
1. Navigate to Phone Banking > Call Lists.
2. Click "New Call List."
3. Enter name "E2E Call List 1."
4. Select a voter list as the source (or use filter criteria).
5. Confirm DNC filtering is applied (any DNC numbers are excluded).
6. Save. Confirm the call list appears with an entry count.
**Expected:** Call list is created with voters, DNC numbers excluded.

### CL-02: View call list details
**Steps:**
1. Click on "E2E Call List 1."
2. Confirm the detail page shows:
   - List of call list entries (voter names, phone numbers).
   - Status tabs or filters (pending, claimed, completed, etc.).
   - Entry count.
**Expected:** Call list detail page displays all entries with correct data.

### CL-03: Edit a call list
**Steps:**
1. Navigate to call list index or detail.
2. Edit the name to "E2E Call List 1 (Updated)."
3. Save. Confirm name update.
**Expected:** Call list name update persists.

### CL-04: Delete a call list
**Steps:**
1. Create a throwaway call list "E2E Call List — Delete Me."
2. Delete it via the row action menu.
3. Confirm it's removed from the list.
**Expected:** Call list is permanently deleted.

### CL-05: Create a call list for further testing
**Steps:**
1. Create "E2E Active Call List" with sufficient voters for phone banking sessions.
**Expected:** Call list ready for session testing.

---

## 18. Phone Banking — DNC (Do Not Call)

### DNC-01: Add a single phone to DNC
**Steps:**
1. Navigate to Phone Banking > DNC.
2. Click "Add Number" (or equivalent).
3. Enter a phone number and a reason (e.g., "Requested removal").
4. Save. Confirm the number appears in the DNC list.
**Expected:** Number is added to DNC.

### DNC-02: Bulk add to DNC
**Steps:**
1. Click "Bulk Import" or "Import DNC."
2. Upload a CSV with 5 phone numbers and reasons.
3. Confirm all 5 numbers appear in the DNC list.
**Expected:** Bulk DNC import works.

### DNC-03: Add 5 known voter phone numbers to DNC
**Steps:**
1. Find 5 voters who have phone numbers in the system.
2. Note their phone numbers.
3. Add all 5 to the DNC list.
4. Confirm they appear in the DNC list.
**Expected:** Voter phone numbers are on the DNC list.

### DNC-04: Verify DNC enforcement in call lists
**Steps:**
1. Create a new call list that would normally include the 5 DNC'd voters.
2. Confirm none of the 5 DNC'd phone numbers appear in the call list entries.
**Expected:** DNC filtering prevents DNC'd numbers from appearing in call lists.

### DNC-05: Delete DNC entries
**Steps:**
1. Delete 3 of the 5 DNC entries added in DNC-03.
2. Confirm they are removed from the DNC list.
3. Create a new call list — confirm the 3 removed numbers NOW appear (they are no longer blocked).
**Expected:** Removing DNC entries re-enables those numbers for call lists.

### DNC-06: Search DNC list
**Steps:**
1. With multiple DNC entries, type a phone number in the DNC search field.
2. Confirm the list filters to show matching entries.
**Expected:** Client-side DNC search works.

---

## 19. Phone Banking — Sessions

### PB-01: Create a phone banking session
**Steps:**
1. Navigate to Phone Banking > Sessions.
2. Click "New Session."
3. Enter name "E2E Session 1."
4. Select "E2E Active Call List" as the source.
5. Optionally select a survey script.
6. Save. Confirm the session appears in the sessions list.
**Expected:** Session is created with status (draft/active).

### PB-02: Assign callers to session
**Steps:**
1. Navigate to the session detail page for "E2E Session 1."
2. Click "Add Caller" (Popover+Command member picker).
3. Search for and select Test Volunteer 1.
4. Add Test Volunteer 2 and Test Manager 1 as well.
5. Confirm all three appear in the callers section.
**Expected:** Three callers assigned to the session.

### PB-03: Remove a caller
**Steps:**
1. Remove Test Manager 1 from the session.
2. Confirm they are no longer listed as a caller.
**Expected:** Caller is removed.

### PB-04: Create 10 phone banking sessions with different test users
**Steps:**
1. Create 10 sessions with varying names: "E2E Session 2" through "E2E Session 11."
2. Assign different combinations of test users as callers:
   - Session 2: Volunteer 1 only
   - Session 3: Volunteer 2 only
   - Session 4: Volunteer 1, Volunteer 2
   - Session 5: Manager 1, Volunteer 1
   - Session 6: Manager 2, Volunteer 2
   - Session 7: Admin 1, Volunteer 1
   - Session 8: All three volunteers
   - Session 9: Manager 1 only
   - Session 10: Volunteer 3 only
   - Session 11: Admin 1, Manager 1, Volunteer 1
**Expected:** 10 sessions created with correct caller assignments.

### PB-05: Verify caller access per user
**Steps:**
1. Log in as Test Volunteer 1.
2. Navigate to Phone Banking > My Sessions.
3. Confirm only sessions where Volunteer 1 is assigned appear (Sessions 1, 2, 4, 5, 7, 8, 11).
4. Log in as Test Volunteer 2.
5. Confirm only their assigned sessions appear (Sessions 3, 4, 6, 8).
6. Log in as Test Volunteer 3.
7. Confirm only Session 10 appears.
**Expected:** Each user sees only their assigned sessions in My Sessions.

### PB-06: Active calling — claim and record a call
**Precondition:** Logged in as Test Volunteer 1, session "E2E Session 1" is active.
**Steps:**
1. Navigate to Session 1 detail page.
2. Click "Start Calling" (or navigate to the call screen).
3. Confirm the calling screen shows:
   - Voter name and phone number for the claimed call.
   - Outcome buttons grouped by category (e.g., Contact Made, No Contact, Other).
   - Survey questions (if a script is attached).
4. Select an outcome (e.g., "Supporter").
5. If survey is present, answer the survey questions.
6. Submit the outcome.
7. Confirm the screen advances to the next call (auto-advance).
**Expected:** Call is claimed, outcome is recorded, screen advances to the next entry.

### PB-07: Skip a call
**Steps:**
1. On the calling screen, click "Skip."
2. Confirm the screen advances to the next call without recording an outcome.
**Expected:** Call is skipped and remains available for later.

### PB-08: Session progress
**Steps:**
1. Make several calls in Session 1 (record outcomes for 5-10 calls).
2. Confirm the progress indicator updates (e.g., "8/50 calls completed").
3. Navigate back to the session detail page.
4. Confirm the progress is reflected there as well.
**Expected:** Progress tracking is accurate and consistent.

### PB-09: Edit a session
**Steps:**
1. Navigate to Sessions list.
2. Edit "E2E Session 1" — change the name to "E2E Session 1 (Updated)."
3. Save. Confirm the name updates.
**Expected:** Session edit persists.

### PB-10: Delete a session
**Steps:**
1. Create a throwaway session "E2E Session — Delete."
2. Delete it.
3. Confirm it's removed.
**Expected:** Session is permanently deleted.

---

## 20. Surveys

### SRV-01: Create a survey script
**Steps:**
1. Navigate to Surveys.
2. Click "New Survey" (+ button).
3. Enter title: "E2E Voter Sentiment Survey."
4. Enter description: "Standard survey for canvassing and phone banking."
5. Save. Confirm it appears in the list with "draft" status badge.
**Expected:** Survey is created in draft status.

### SRV-02: Add questions to a survey
**Steps:**
1. Navigate to the survey detail page for "E2E Voter Sentiment Survey."
2. Add the following questions:
   - **Q1:** "What is the most important issue to you?" (Multiple Choice: Economy, Healthcare, Education, Environment, Other)
   - **Q2:** "How likely are you to vote in the next election?" (Scale: 1-10)
   - **Q3:** "Would you like to volunteer for the campaign?" (Multiple Choice: Yes, No, Maybe)
   - **Q4:** "Any additional comments?" (Free Text)
   - **Q5:** "How would you rate the current administration?" (Scale: 1-5)
3. Confirm each question appears in the script with correct type and options.
**Expected:** 5 questions are added with correct types and answer options.

### SRV-03: Edit a question
**Steps:**
1. Edit Q1 — change "Other" option to "Public Safety."
2. Save. Confirm the change persists.
**Expected:** Question edit is saved.

### SRV-04: Reorder questions
**Steps:**
1. Move Q5 to be Q2 (reorder via drag or reorder buttons).
2. Confirm the new order is: Q1, Q5(now Q2), Q2(now Q3), Q3(now Q4), Q4(now Q5).
**Expected:** Question order updates and persists.

### SRV-05: Delete a question
**Steps:**
1. Delete the last question (free text).
2. Confirm it's removed. 4 questions remain.
**Expected:** Question is deleted.

### SRV-06: Change survey status
**Steps:**
1. Change the survey status from "draft" to "active."
2. Confirm the status badge changes.
3. Change to "archived."
4. Confirm the badge changes again.
**Expected:** Status lifecycle works: draft → active → archived.

### SRV-07: Create 5 surveys for further testing
**Steps:**
1. Create 4 more surveys with different titles and 2-3 questions each:
   - "E2E Canvassing Script" (3 questions)
   - "E2E Phone Banking Script" (2 questions)
   - "E2E Short Survey" (1 question — multiple choice)
   - "E2E Detailed Survey" (4 questions — mixed types)
2. Set them all to "active" status.
**Expected:** 5 active survey scripts ready for use in sessions and field mode.

### SRV-08: Delete a survey
**Steps:**
1. Create a throwaway survey "E2E Survey — Delete."
2. Delete it.
3. Confirm it's removed from the list.
**Expected:** Survey is permanently deleted.

---

## 21. Volunteers

### VOL-01: Register a user volunteer (record mode)
**Precondition:** Logged in as Test Manager 1.
**Steps:**
1. Navigate to Volunteers > Register.
2. Select "Record only" mode.
3. Fill in the form with a test user's information who is already a ZITADEL user:
   - Link to an existing user account.
   - Add skills, notes.
4. Save. Confirm the volunteer appears in the roster.
**Expected:** User volunteer is created and linked to their user account.

### VOL-02: Register a non-user volunteer (record mode)
**Steps:**
1. Navigate to Volunteers > Register.
2. Select "Record only" mode.
3. Enter volunteer information for someone who is NOT a system user:
   - First name, last name, email, phone.
   - Skills, availability notes.
4. Save. Confirm the volunteer appears in the roster.
**Expected:** Non-user volunteer is created. They exist only as a volunteer record, not a system user.

### VOL-03: Register via invite mode
**Steps:**
1. Navigate to Volunteers > Register.
2. Select "Invite to app" mode.
3. Enter new volunteer information with email.
4. Submit.
5. Confirm the volunteer is created (note: email invite functionality may show "coming soon" toast).
**Expected:** Volunteer record is created with invite flag.

### VOL-04: Create 5 user and 5 non-user volunteers
**Steps:**
1. Create 5 user-linked volunteers using test users (Volunteer 1-3, Viewer 1-2).
2. Create 5 non-user volunteers with different names and data:
   - "Non-User Vol A" — full data (skills, phone, email)
   - "Non-User Vol B" — minimal data (name only)
   - "Non-User Vol C" — with availability preferences
   - "Non-User Vol D" — with special skills
   - "Non-User Vol E" — with notes
**Expected:** 10 volunteers total (5 user-linked, 5 non-user).

### VOL-05: View volunteer roster
**Steps:**
1. Navigate to Volunteers > Roster.
2. Confirm all 10 volunteers appear in the roster table.
3. Confirm the table shows: name, email/phone, skills, status, tags.
4. Use the search/filter to find a specific volunteer by name.
**Expected:** Roster displays all volunteers with correct data and is searchable.

### VOL-06: View volunteer detail page
**Steps:**
1. Click on a volunteer in the roster.
2. Confirm the detail page shows:
   - Name, contact info, skills.
   - Availability slots (if set).
   - Assigned shifts.
   - Hours worked.
   - Check-in/out history.
   - Tags.
**Expected:** Volunteer detail page shows comprehensive information.

### VOL-07: Edit a volunteer
**Steps:**
1. On a volunteer detail page, click Edit.
2. Change their skills or contact information.
3. Save. Confirm changes persist.
**Expected:** Volunteer edits are saved.

### VOL-08: Delete a volunteer
**Steps:**
1. Create a throwaway volunteer "E2E Vol — Delete."
2. Delete them.
3. Confirm they're removed from the roster.
**Expected:** Volunteer is permanently deleted.

---

## 22. Volunteer Tags

### VTAG-01: Create 10 volunteer tags
**Steps:**
1. Navigate to Volunteers > Tags.
2. Create 10 tags:
   - "Canvasser", "Phone Banker", "Data Entry", "Team Lead", "Bilingual",
   - "Weekend Only", "Evening Only", "Experienced", "New Recruit", "Transportation"
**Expected:** 10 volunteer tags created.

### VTAG-02: Assign tags to 90% of volunteers
**Steps:**
1. For 9 of the 10 volunteers (90%):
   a. Navigate to their detail page.
   b. Assign 1-5 random tags from the 10 created.
   c. Confirm tags appear on the volunteer.
**Expected:** Tags assigned to 9 volunteers.

### VTAG-03: Edit 5 volunteers' tags
**Steps:**
1. For 5 tagged volunteers:
   a. Remove one tag and add a different one.
   b. Confirm the change persists.
**Expected:** Tag changes are saved.

### VTAG-04: Remove all tags from 2 volunteers
**Steps:**
1. For 2 volunteers, remove ALL assigned tags.
2. Confirm their tag sections are empty.
**Expected:** Tags are fully removed.

### VTAG-05: Delete volunteer tags
**Steps:**
1. Navigate to Volunteers > Tags.
2. Delete all 10 test tags.
3. Confirm tags are removed from the tag list.
4. Navigate to a previously-tagged volunteer — confirm their tags are gone too.
**Expected:** Deleting a tag removes it from all volunteers.

---

## 23. Volunteer Availability

### AVAIL-01: Set availability for 5 volunteers
**Steps:**
1. For 5 volunteers:
   a. Navigate to their detail page.
   b. Click "Add Availability" (AddAvailabilityDialog).
   c. Set availability slots (e.g., "Monday 9am-5pm", "Saturday 10am-2pm").
   d. Save. Confirm availability appears on the detail page.
**Expected:** Availability slots are set and displayed.

### AVAIL-02: Edit availability
**Steps:**
1. For 2 volunteers, edit their availability times.
2. Confirm changes persist.
**Expected:** Availability edits are saved.

### AVAIL-03: Delete availability
**Steps:**
1. For 1 volunteer, remove all availability slots.
2. Confirm their availability section is empty.
**Expected:** Availability is cleared.

---

## 24. Shifts

### SHIFT-01: Create 20 test shifts
**Precondition:** Logged in as Test Manager 1.
**Steps:**
1. Navigate to Volunteers > Shifts.
2. Create 20 shifts with varying dates, times, and capacity:
   - 5 shifts this week, different days, morning (9am-12pm)
   - 5 shifts this week, different days, afternoon (1pm-5pm)
   - 5 shifts next week, morning
   - 5 shifts next week, afternoon
3. Set capacity limits: some with 2 slots, some with 5, some with 10.
4. Confirm each shift appears in the shifts list, grouped by date.
**Expected:** 20 shifts created with correct dates, times, and capacity.

### SHIFT-02: Assign volunteers to shifts
**Steps:**
1. For each of the 20 shifts:
   a. Navigate to the shift detail page.
   b. Assign at least 1 user-linked volunteer and 1 non-user volunteer.
   c. Vary the assignments so different volunteers are on different shifts.
   d. Confirm assigned volunteers appear on the shift roster.
**Expected:** Volunteers are assigned to shifts.

### SHIFT-03: Validate availability enforcement
**Steps:**
1. Take 5 volunteers who have availability set (from AVAIL-01).
2. Attempt to assign them to shifts that fall WITHIN their availability.
3. Confirm the assignment succeeds.
4. Attempt to assign them to shifts that fall OUTSIDE their availability.
5. Observe whether the UI warns, blocks, or allows the assignment.
6. Document the behavior (this validates whether availability is enforced or advisory).
**Expected:** Availability is either enforced (preventing out-of-window assignments) or shown as a warning. Document actual behavior.

### SHIFT-04: Check in a volunteer
**Steps:**
1. Navigate to a shift detail page where Test Volunteer 1 is assigned.
2. Click "Check In" for Test Volunteer 1.
3. Confirm the check-in time is recorded and the volunteer's status changes.
**Expected:** Check-in time is captured. Status updates to "checked in."

### SHIFT-05: Check out a volunteer
**Steps:**
1. On the same shift, click "Check Out" for Test Volunteer 1.
2. Confirm the check-out time is recorded.
3. Confirm hours worked are calculated (check-out minus check-in).
**Expected:** Check-out is recorded. Hours are calculated.

### SHIFT-06: View volunteer hours
**Steps:**
1. Navigate to the volunteer detail page for Test Volunteer 1.
2. Confirm the hours section shows the hours logged from the shift check-in/out.
**Expected:** Hours tracking is accurate.

### SHIFT-07: Adjust hours
**Steps:**
1. On the shift detail page, find a checked-in/out volunteer.
2. Use the hours adjustment feature to modify their hours (e.g., correct a late check-in).
3. Confirm the adjusted hours are reflected.
**Expected:** Manual hours adjustment works.

### SHIFT-08: Edit a shift
**Steps:**
1. Navigate to a shift detail.
2. Edit the shift time or capacity.
3. Save. Confirm changes persist.
**Expected:** Shift edits are saved.

### SHIFT-09: Delete a shift
**Steps:**
1. Create a throwaway shift.
2. Delete it.
3. Confirm it's removed from the shifts list.
**Expected:** Shift is permanently deleted.

### SHIFT-10: Unassign a volunteer from a shift
**Steps:**
1. On a shift detail page, unassign one volunteer.
2. Confirm they are removed from the shift roster.
**Expected:** Volunteer is unassigned from the shift.

---

## 25. Field Mode — Volunteer Hub

### FIELD-01: Access field mode as a volunteer
**Precondition:** Test Volunteer 1 is assigned to a walk list (WL-07) and a phone banking session (PB-04).
**Steps:**
1. Log in as Test Volunteer 1.
2. Navigate to `/field/{campaignId}` (or follow the field mode link).
3. Confirm the field hub loads showing:
   - Welcome / assignment overview.
   - Canvassing assignment (if walk list assigned).
   - Phone banking session (if session assigned).
   - Quick-start cards.
4. Confirm the field layout is mobile-optimized (no admin sidebar/chrome).
**Expected:** Field hub shows the volunteer's assignments in a clean mobile-first layout.

### FIELD-02: Pull-to-refresh
**Steps:**
1. On the field hub, pull down to refresh (on mobile or simulate gesture).
2. Confirm the data refreshes.
**Expected:** Pull-to-refresh updates assignment data.

---

## 26. Field Mode — Canvassing

### FIELD-03: Start canvassing a walk list
**Steps:**
1. From the field hub, tap "Start Canvassing" (or the canvassing assignment card).
2. Confirm the canvassing wizard loads showing:
   - Current door (voter name, address).
   - Household grouping (if multiple voters at same address).
   - Progress indicator.
   - Google Maps walking directions link.
**Expected:** Canvassing wizard shows the first door with correct voter info.

### FIELD-04: Record a door knock outcome
**Steps:**
1. At the first door, select an outcome:
   - "Contact Made — Supporter"
2. If a survey is attached, answer the survey questions.
3. Submit.
4. Confirm the wizard auto-advances to the next door.
5. Record different outcomes for the next 5 doors:
   - "Not Home"
   - "Refused"
   - "Contact Made — Undecided"
   - "Contact Made — Opposed"
   - "Moved / Wrong Address"
**Expected:** Each outcome is recorded. Wizard advances door-by-door.

### FIELD-05: Canvassing progress tracking
**Steps:**
1. After recording several doors, check the progress indicator.
2. Confirm it shows correct completed/total count.
**Expected:** Progress is accurate.

### FIELD-06: Canvassing session persistence
**Steps:**
1. Mid-way through the walk list, close the browser tab.
2. Re-open the field canvassing page.
3. Confirm a resume prompt appears asking to continue where you left off.
4. Resume. Confirm you're at the correct door (not restarted).
**Expected:** Session state persists via sessionStorage. Resume works correctly.

### FIELD-07: Canvassing with inline survey
**Precondition:** Walk list is associated with a survey script.
**Steps:**
1. At a door, select "Contact Made."
2. Confirm the inline survey questions appear.
3. Answer each question.
4. Submit the combined outcome + survey response.
**Expected:** Survey responses are recorded along with the door knock outcome.

---

## 27. Field Mode — Phone Banking

### FIELD-08: Start phone banking in field mode
**Steps:**
1. From the field hub, tap "Start Phone Banking."
2. Confirm the phone banking interface loads showing:
   - Current voter name and phone number.
   - "Call" button (tel: link for tap-to-call).
   - Outcome buttons.
   - Survey questions (if attached).
   - Progress indicator.
**Expected:** Phone banking field mode loads with correct voter data.

### FIELD-09: Tap to call
**Steps:**
1. Tap the "Call" button.
2. Confirm a `tel:` link is triggered (opens phone dialer on mobile).
3. If on desktop, confirm clipboard fallback copies the phone number.
4. Confirm the phone number is in E.164 format.
**Expected:** Call initiation works via tel: link (mobile) or clipboard copy (desktop).

### FIELD-10: Record phone outcome
**Steps:**
1. After the call, select an outcome from the grouped outcome buttons.
2. If survey is attached, answer questions.
3. Submit.
4. Confirm auto-advance to next call.
**Expected:** Outcome recorded, advances to next voter.

---

## 28. Field Mode — Offline Support

### OFFLINE-01: Offline banner
**Steps:**
1. While in field mode (canvassing or phone banking), disable network connectivity.
2. Confirm an offline banner appears indicating you're offline.
**Expected:** Offline banner is visible when disconnected.

### OFFLINE-02: Queue outcomes while offline
**Steps:**
1. While offline, record 3 door knock or call outcomes.
2. Confirm each outcome shows a "queued" indicator.
3. Confirm the offline queue count shows "3 pending."
**Expected:** Outcomes are queued in localStorage.

### OFFLINE-03: Auto-sync on reconnection
**Steps:**
1. Re-enable network connectivity.
2. Confirm the queued outcomes automatically sync.
3. Confirm the offline banner disappears.
4. Confirm the synced outcomes now appear in the voter's interaction history.
**Expected:** Outcomes sync automatically. Queue drains. Data is consistent.

---

## 29. Field Mode — Onboarding Tour

### TOUR-01: First-time onboarding tour
**Steps:**
1. Log in as a test user who has never used field mode before (or clear tour completion state).
2. Navigate to field mode.
3. Confirm the driver.js guided tour starts automatically.
4. Step through each tour step (welcome, canvassing overview, phone banking overview).
5. Confirm each step highlights the correct UI element.
6. Complete the tour.
**Expected:** Tour completes without errors. Each step is relevant and correctly positioned.

### TOUR-02: Replay tour via help button
**Steps:**
1. After completing the tour, find the help button.
2. Click it. Confirm the tour replays.
**Expected:** Help button triggers tour replay.

### TOUR-03: Tour completion persists
**Steps:**
1. Complete the tour.
2. Refresh the page.
3. Confirm the tour does NOT auto-start again.
**Expected:** Tour completion state is persisted per user.

---

## 30. Navigation & Sidebar

### NAV-01: Campaign sidebar navigation
**Precondition:** Logged in, in a campaign.
**Steps:**
1. Verify each sidebar link navigates to the correct page:
   - Dashboard → `/campaigns/{id}/dashboard`
   - Voters → `/campaigns/{id}/voters`
   - Canvassing → `/campaigns/{id}/canvassing`
   - Phone Banking → `/campaigns/{id}/phone-banking/call-lists`
   - Surveys → `/campaigns/{id}/surveys`
   - Volunteers → `/campaigns/{id}/volunteers`
   - Settings → `/campaigns/{id}/settings`
2. Confirm the active link is visually highlighted.
3. Confirm the sidebar collapses/slides on mobile viewport.
**Expected:** All navigation links work. Active state is correct.

### NAV-02: Organization navigation
**Steps:**
1. From the sidebar, verify Organization navigation links:
   - All Campaigns → `/` (org dashboard)
   - Members → `/org/members`
   - Settings → `/org/settings`
**Expected:** Org nav links work correctly.

### NAV-03: Breadcrumb / back navigation
**Steps:**
1. Navigate deep into a route (e.g., voter detail page).
2. Use the browser back button.
3. Confirm correct navigation (back to voter list).
4. Test direct URL entry for various deep routes.
**Expected:** Back navigation and direct URL access work correctly.

---

## 31. Empty States & Loading

### UI-01: Empty states on list pages
**Steps:**
1. Create a new campaign with no data.
2. Navigate to each list page and confirm contextual empty state messages:
   - Voters: "No voters yet" with import CTA.
   - Turfs: "No turfs" with create CTA.
   - Walk Lists: "No walk lists" with generate CTA.
   - Call Lists: "No call lists" with create CTA.
   - DNC: "No DNC entries."
   - Sessions: "No sessions" with create CTA.
   - Surveys: "No surveys" with create CTA.
   - Volunteers Roster: "No volunteers" with register CTA.
   - Shifts: "No shifts" with create CTA.
   - Voter Tags: "No tags" with create CTA.
   - Volunteer Tags: "No tags" with create CTA.
   - Voter Lists: "No lists" with create CTA.
   - Import History: "No imports" with import CTA.
**Expected:** Each empty state has a relevant icon, message, and call-to-action button.

### UI-02: Loading skeletons
**Steps:**
1. Navigate to each page and observe the loading state (may need to throttle network to see it).
2. Confirm layout-matching skeleton loaders appear (not just a centered spinner).
**Expected:** Skeleton loaders match the page layout.

### UI-03: Error boundary
**Steps:**
1. Navigate to a non-existent campaign ID (e.g., `/campaigns/00000000-0000-0000-0000-000000000000/dashboard`).
2. Confirm a RouteErrorBoundary renders with a card-based error UI.
3. Confirm there's a way to navigate back (home link or retry button).
**Expected:** Error boundary catches route errors gracefully.

---

## 32. Campaign Dashboard Drilldowns

### DRILL-01: Canvassing dashboard
**Steps:**
1. Navigate to Canvassing page.
2. Confirm the canvassing overview shows:
   - Turf overview map (if turfs exist).
   - Turfs table with voter counts.
   - Walk lists table with progress.
**Expected:** Canvassing overview data is accurate.

### DRILL-02: Phone banking dashboard
**Steps:**
1. Navigate to Phone Banking (redirects to Call Lists).
2. Confirm call lists are shown with entry counts and status.
3. Navigate to Sessions.
4. Confirm sessions are shown with caller counts and progress.
**Expected:** Phone banking data is accurate.

### DRILL-03: Volunteer dashboard
**Steps:**
1. Navigate to Volunteers (redirects to roster or index).
2. Confirm volunteer overview shows roster, registration, shifts tabs.
**Expected:** Volunteer section navigation works correctly.

---

## 33. Accessibility (Spot Checks)

### A11Y-01: Keyboard navigation
**Steps:**
1. Navigate the entire app using only keyboard (Tab, Shift+Tab, Enter, Escape, Arrow keys).
2. Confirm:
   - All interactive elements are reachable via Tab.
   - Focus indicators are visible (outline or ring).
   - Dialogs trap focus.
   - Escape closes modals/sheets/dialogs.
   - Skip nav link works (Tab from top of page).
**Expected:** Full keyboard operability.

### A11Y-02: Touch targets
**Steps:**
1. On mobile viewport, confirm all interactive elements have at least 44px tap targets.
2. Test buttons, links, checkboxes, radio buttons, dropdown triggers.
**Expected:** All targets meet 44px minimum.

### A11Y-03: ARIA landmarks
**Steps:**
1. Inspect the page with a screen reader or accessibility dev tools.
2. Confirm proper ARIA landmarks (main, nav, banner, contentinfo).
3. Confirm form fields have associated labels.
4. Confirm status messages use aria-live regions.
**Expected:** Proper ARIA structure.

---

## 34. Cross-Cutting Validations

### CROSS-01: Form navigation protection
**Steps:**
1. Start filling out any form (voter create, turf create, campaign create, volunteer register).
2. Without saving, attempt to navigate away (click a sidebar link).
3. Confirm a navigation guard dialog appears warning about unsaved changes.
4. Click "Stay" — confirm you remain on the form.
5. Click "Leave" — confirm navigation proceeds and form data is lost.
6. Test the browser back button and the browser close/refresh (beforeunload).
**Expected:** Form guard prevents accidental data loss.

### CROSS-02: Toast notifications
**Steps:**
1. Perform various CRUD operations across the app.
2. Confirm success toasts appear for: create, update, delete operations.
3. Confirm error toasts appear for failed operations.
4. Confirm toasts are dismissible and auto-disappear.
**Expected:** Consistent toast notifications for all operations.

### CROSS-03: Rate limiting
**Steps:**
1. From the API or UI, rapidly perform the same action (e.g., 35 voter creates in 1 minute — limit is 30/min).
2. Confirm a rate limit error (429 Too Many Requests) is returned.
3. Wait and confirm access is restored.
**Expected:** Rate limiting is enforced per-user with appropriate limits.

---

## Test Data Cleanup

After all tests are complete, clean up test data:

1. Delete all test turfs (E2E Turf *, E2E Overlap *).
2. Delete all test walk lists.
3. Delete all test call lists.
4. Delete all test sessions.
5. Delete all test survey scripts.
6. Delete all test volunteers (non-user ones).
7. Remove test volunteer records for user volunteers.
8. Delete all test shifts.
9. Delete test voter tags and volunteer tags.
10. Delete test voter lists.
11. Clean up DNC entries.
12. Delete the "Secondary Test Campaign" if created.
13. Revert organization name if changed.
14. Consider re-importing the clean dataset to restore voter count.

---

## Appendix A: Role Permission Matrix

| Action | Viewer | Volunteer | Manager | Admin | Owner |
|--------|--------|-----------|---------|-------|-------|
| View all data | Yes | Yes | Yes | Yes | Yes |
| Add interaction/note | No | Yes | Yes | Yes | Yes |
| Record door knocks | No | Yes | Yes | Yes | Yes |
| Record call outcomes | No | Yes | Yes | Yes | Yes |
| Create/edit/delete voters | No | No | Yes | Yes | Yes |
| Create/edit/delete turfs | No | No | Yes | Yes | Yes |
| Create/edit/delete walk lists | No | No | Yes | Yes | Yes |
| Create/edit/delete call lists | No | No | Yes | Yes | Yes |
| Create/edit/delete surveys | No | No | Yes | Yes | Yes |
| Manage volunteers | No | No | Yes | Yes | Yes |
| Manage shifts | No | No | Yes | Yes | Yes |
| Import voters | No | No | Yes | Yes | Yes |
| Manage campaign members | No | No | No | Yes | Yes |
| Edit campaign settings | No | No | No | Yes | Yes |
| Transfer ownership | No | No | No | No | Yes |
| Delete campaign | No | No | No | No | Yes |

**Org Role Additive Resolution:**
- org_admin → treated as admin on ALL campaigns in the org
- org_owner → treated as owner on ALL campaigns in the org
- Final role = max(campaign_role, org_role_equivalent)

## Appendix B: Example CSV Column Reference

The test data file `data/example-2026-02-24.csv` has 551 voters and 55 columns:

| # | Column Name | Maps To |
|---|---|---|
| 1 | Voter ID | voter_file_id |
| 2 | First Name | first_name |
| 3 | Last Name | last_name |
| 4 | Registered Party | party |
| 5 | Gender | gender |
| 6 | Age | age |
| 7 | Likelihood to vote | propensity_general |
| 8 | Primary Likelihood to Vote | propensity_primary |
| 9 | Combined General and Primary Likelihood to Vote | propensity_combined |
| 10 | Apartment Type | apartment_type |
| 11 | Ethnicity | ethnicity |
| 12 | Lattitude | latitude |
| 13 | Longitude | longitude |
| 14 | Household Party Registration | household_party_registration |
| 15 | Mailing Household Size | household_size |
| 16 | Street Number Odd/Even | street_number_odd_even |
| 17 | Cell Phone | cell phone contact |
| 18 | Cell Phone Confidence Code | cell_phone_confidence |
| 19 | Voter Changed Party? | party_change_indicator |
| 20 | Spoken Language | spoken_language |
| 21-27 | Address fields | registration_line1, city, state, zip, etc. |
| 28-46 | Mailing address fields | mailing_line1, city, state, zip, etc. |
| 43 | Marital Status | marital_status |
| 47 | Military Active/Veteran | military_status |
| 48-55 | Voting history | General_2024, 2022, 2020, 2018 + Primary |
