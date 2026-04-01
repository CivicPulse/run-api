# Phase 58: E2E Core Tests - Research

**Researched:** 2026-03-29
**Domain:** Playwright E2E testing -- RBAC, org management, campaign settings, voter CRUD lifecycles
**Confidence:** HIGH

## Summary

Phase 58 creates the canonical E2E test suite for CivicPulse Run's core features: RBAC permission enforcement across 5 roles, organization management workflows, campaign settings CRUD, and the full voter entity lifecycle (voters, contacts, tags, notes, lists). The infrastructure from Phase 57 is complete -- 5 auth setup files, 15 ZITADEL test users with campaign membership, and a 4-shard CI pipeline are all in place.

The existing codebase has established patterns for E2E tests in `web/e2e/`: role-suffix file naming for auth project routing, `test.describe.serial` for ordered multi-step flows, `test.step()` for sub-step reporting, `page.getByRole()`/`page.getByLabel()` accessible selectors, and `page.request.get()` for direct API calls from within tests. The 51 existing specs serve as pattern references but use a mix of phase-prefix and domain naming -- new specs will use domain-only naming per D-02.

**Primary recommendation:** Build 12 spec files (5 RBAC per-role + 7 domain specs) using the established serial-describe + step pattern. Use `page.request.post()` with cookie forwarding for bulk API data creation (voter CRUD speed optimization per D-05). Each spec file should be self-contained with no shared state between files, relying on serial ordering within each file for create-edit-delete lifecycles.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** One spec file per requirement group -- 8 files total: `rbac.{role}.spec.ts` (5 files), `org-management.spec.ts`, `campaign-settings.spec.ts`, `voter-crud.spec.ts`, `voter-contacts.spec.ts`, `voter-tags.spec.ts`, `voter-notes.spec.ts`, `voter-lists.spec.ts`
- **D-02:** Domain-based naming (no phase prefix). Example: `voter-crud.spec.ts`, not `phase58-voter-crud.spec.ts`
- **D-03:** RBAC specs split by role using suffix convention: `rbac.viewer.spec.ts`, `rbac.volunteer.spec.ts`, `rbac.manager.spec.ts`, `rbac.admin.spec.ts`, `rbac.spec.ts` (owner, unsuffixed = default auth)
- **D-04:** Hybrid data strategy -- seed data as baseline for reads, fresh entities for mutations
- **D-05:** Voter CRUD 20+ voters: 2-3 via UI form, remaining 17+ via API `POST /voters` for speed
- **D-06:** Per-role permission checklist structure in RBAC specs
- **D-07:** Skip RBAC-01 and RBAC-02 (role assignment). Member management tested in `campaign-settings.spec.ts`
- **D-08:** Org role tests (RBAC-08, RBAC-09) go in admin and owner RBAC specs respectively
- **D-09:** Serial within spec (`test.describe.serial`), parallel across spec files
- **D-10:** No cleanup -- fresh database per CI run. Delete tests clean up within serial blocks
- **D-11:** Existing 51 specs kept as-is

### Claude's Discretion
- Exact test case implementation details within each spec file
- How to handle edge cases in RBAC testing (e.g., direct URL access to restricted routes)
- Whether to use `test.step()` for sub-steps within serial tests
- Playwright worker count configuration for optimal CI shard balance
- How to structure API helper functions for bulk data creation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | Automated tests verify each of 5 campaign roles can/cannot access role-gated UI actions (RBAC-03 through RBAC-09) | 5 RBAC spec files with per-role permission checklists; existing `role-gated.admin.spec.ts` and `role-gated.volunteer.spec.ts` as pattern templates |
| E2E-02 | Automated tests verify org dashboard, campaign creation, archive/unarchive, org settings, org member management (ORG-01 through ORG-08) | `org-management.spec.ts` using serial describe; org dashboard at `/`, archive/unarchive via campaign card menu, settings at `/org/settings`, members at `/org/members` |
| E2E-03 | Automated tests verify campaign settings CRUD, member management, ownership transfer, campaign deletion (CAMP-01 through CAMP-06) | `campaign-settings.spec.ts` using serial describe; settings at `/campaigns/{id}/settings/general`, members at `.../members`, danger zone at `.../danger` |
| E2E-07 | Automated tests verify voter create, edit, delete lifecycle for 20+ voters (VCRUD-01 through VCRUD-04) | `voter-crud.spec.ts` with hybrid UI + API creation; voter index at `/campaigns/{id}/voters`, "New Voter" sheet via `RequireRole minimum="manager"`, delete via row action menu |
| E2E-08 | Automated tests verify voter contact CRUD across 20 voters (CON-01 through CON-06) | `voter-contacts.spec.ts`; ContactsTab component at voter detail, phone/email/address forms with type selectors |
| E2E-09 | Automated tests verify voter tag lifecycle (TAG-01 through TAG-05) | `voter-tags.spec.ts`; tag management at `/campaigns/{id}/voters/tags`, tag assignment on voter detail TagsTab |
| E2E-10 | Automated tests verify voter note create, edit, delete lifecycle (NOTE-01 through NOTE-03) | `voter-notes.spec.ts`; HistoryTab component with note CRUD, edit via inline form, delete via ConfirmDialog |
| E2E-11 | Automated tests verify voter list CRUD including static/dynamic lists (VLIST-01 through VLIST-06) | `voter-lists.spec.ts`; lists at `/campaigns/{id}/voters/lists`, list detail with AddVotersDialog, filter-based dynamic lists |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E test framework | Already installed; configured with 5 auth projects and 4-shard CI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js | 22.x | Runtime | Specified in CI workflow |

No additional packages needed. All test infrastructure is in place from Phase 57.

## Architecture Patterns

### Spec File Organization
```
web/e2e/
├── rbac.spec.ts                    # Owner RBAC (unsuffixed = default auth)
├── rbac.admin.spec.ts              # Admin RBAC
├── rbac.manager.spec.ts            # Manager RBAC
├── rbac.volunteer.spec.ts          # Volunteer RBAC
├── rbac.viewer.spec.ts             # Viewer RBAC
├── org-management.spec.ts          # Org dashboard, campaigns, settings, members
├── campaign-settings.spec.ts       # Campaign CRUD, members, ownership, deletion
├── voter-crud.spec.ts              # Voter create/edit/delete lifecycle
├── voter-contacts.spec.ts          # Phone/email/address CRUD
├── voter-tags.spec.ts              # Tag create/assign/remove/delete
├── voter-notes.spec.ts             # Note add/edit/delete
├── voter-lists.spec.ts             # Static/dynamic list CRUD
├── (existing 51 specs)             # Kept as-is per D-11
└── auth-*.setup.ts                 # 5 auth setups (from Phase 57)
```

### Pattern 1: Serial Lifecycle Tests
**What:** `test.describe.serial` wraps ordered create-edit-delete flows that share state via `let` variables in the describe scope.
**When to use:** Any spec where later tests depend on entities created by earlier tests (voter CRUD, campaign settings, etc.).
**Example:**
```typescript
// Source: web/e2e/connected-journey.spec.ts (existing pattern)
import { test, expect } from "@playwright/test"

test.describe.serial("Voter CRUD lifecycle", () => {
  let voterIds: string[] = []

  test.setTimeout(120_000)

  test("create voters via UI form", async ({ page }) => {
    await test.step("navigate to voters page", async () => {
      await page.goto("/")
      // ... navigate to campaign voters
    })
    await test.step("create first voter via form", async () => {
      await page.getByRole("button", { name: /new voter/i }).click()
      // ... fill form, submit
    })
  })

  test("create remaining voters via API", async ({ page }) => {
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

    for (const voter of bulkVoters) {
      const resp = await page.request.post(
        `https://localhost:4173/api/v1/campaigns/${campaignId}/voters`,
        { data: voter, headers: { Cookie: cookieHeader } }
      )
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      voterIds.push(body.id)
    }
  })
})
```

### Pattern 2: RBAC Permission Checklist
**What:** Each role spec navigates to every major page and asserts visibility/absence of mutation buttons.
**When to use:** RBAC verification specs (5 role files).
**Example:**
```typescript
// Source: web/e2e/role-gated.admin.spec.ts (existing pattern)
import { test, expect } from "@playwright/test"

test.describe("RBAC: viewer permissions", () => {
  test("voters page hides New Voter button", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Navigate into seed campaign
    const campaignLink = page.getByRole("link", { name: /macon|bibb|campaign/i }).first()
    await campaignLink.click()
    await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })

    // Navigate to voters
    await page.getByRole("link", { name: /voters/i }).first().click()

    // New Voter button should NOT be visible (RequireRole minimum="manager")
    const newVoterBtn = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterBtn).not.toBeVisible()
  })
})
```

### Pattern 3: API-Assisted Data Creation
**What:** Use `page.request.post()` with forwarded auth cookies to create test data via the API instead of the UI.
**When to use:** Bulk data creation (D-05: 17+ voters via API), setting up preconditions for contact/tag/note tests.
**Example:**
```typescript
// Source: web/e2e/phase27-filter-wiring.spec.ts (existing pattern)
async function createVoterViaApi(page, campaignId: string, data: Record<string, unknown>): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/voters`,
    {
      data,
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    }
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}
```

### Pattern 4: Campaign Navigation Helper
**What:** Common function to navigate from org dashboard into the seed campaign.
**When to use:** Nearly every spec needs to enter the seed campaign. Extract as a reusable helper.
**Example:**
```typescript
async function navigateToSeedCampaign(page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

  const campaignLink = page.getByRole("link", { name: /macon|bibb|campaign/i }).first()
  await campaignLink.click()
  await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })

  const match = page.url().match(/campaigns\/([a-f0-9-]+)/)
  return match?.[1] ?? ""
}
```

### Anti-Patterns to Avoid
- **Shared state between spec files:** Each spec file must be independently runnable. Do not depend on another spec's side effects.
- **Fixed timeouts instead of assertions:** Use `expect().toBeVisible({ timeout })` instead of `page.waitForTimeout()`.
- **CSS class selectors:** Use `page.getByRole()`, `page.getByLabel()`, `page.getByText()` -- accessible selectors are more stable.
- **Hardcoded campaign IDs:** The seed campaign ID changes per environment. Always navigate to it and extract the ID from the URL.
- **Direct `fetch()` in tests:** Use `page.request.post()` which shares the browser context's cookies -- no need to manually construct auth headers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth session management | Custom login flows per test | Pre-authenticated `storageState` via auth setup files | 5 auth setup files already exist; tests inherit sessions via Playwright project config |
| Test data factory | In-memory mock factories | Seed data (50 voters) + `page.request.post()` API calls | Seed data provides realistic baseline; API calls are faster than UI interactions for bulk creation |
| Test runner parallelization | Custom sharding logic | Playwright's built-in `--shard` flag + CI matrix | Already configured with 4 shards in CI workflow |
| Response waiting | `page.waitForTimeout()` | `page.waitForResponse()` and `expect().toBeVisible({ timeout })` | Playwright's smart waiting avoids flaky fixed delays |

## Common Pitfalls

### Pitfall 1: API Base URL Mismatch
**What goes wrong:** `page.request.post()` fails because the API is proxied through Vite preview, not directly accessible.
**Why it happens:** The web app runs at `https://localhost:4173` and proxies API calls to `http://localhost:8000`. Direct API calls via `page.request` must go through the Vite proxy (same origin) or directly to the API.
**How to avoid:** Use `page.request.post("https://localhost:4173/api/v1/...")` (through the Vite proxy) which will forward cookies and auth context correctly. Do NOT call `http://localhost:8000` directly from `page.request` as it lacks the browser's auth cookies.
**Warning signs:** 401 responses from API calls in tests; cookies not forwarded.

### Pitfall 2: Rate Limiting on Bulk Operations
**What goes wrong:** API returns 429 Too Many Requests when creating 20+ voters in quick succession.
**Why it happens:** Voter creation endpoint has `@limiter.limit("30/minute")`. Creating 20 voters via API in a serial loop may approach or exceed this.
**How to avoid:** The rate limit is 30/minute which is sufficient for 20 voters. However, if tests create voters for contacts + tags + notes, the total across a CI run could hit limits. Add small delays between batches if needed, or increase the limit in test environment.
**Warning signs:** 429 responses after the first 20-30 API calls in a spec.

### Pitfall 3: Stale Selectors After Mutations
**What goes wrong:** After creating/deleting a voter, the table does not re-render before the next assertion, causing stale data.
**Why it happens:** TanStack Query invalidation and re-fetch is async. The table may still show old data for a brief moment.
**How to avoid:** After a mutation (create/delete), wait for the toast success message first, then assert the updated state with a timeout: `await expect(page.getByText("Test Alpha")).toBeVisible({ timeout: 10_000 })`.
**Warning signs:** Tests pass locally but fail in CI due to slower re-renders.

### Pitfall 4: Campaign Card Identification on Org Dashboard
**What goes wrong:** Campaign archive/unarchive test clicks the wrong campaign card because multiple campaigns exist.
**Why it happens:** The seed data creates one campaign, but `org-management.spec.ts` creates additional campaigns. Card selectors must be specific.
**How to avoid:** Create campaigns with unique timestamped names (`E2E Campaign ${Date.now()}`), then use `page.getByText(exactName)` to target specific cards.
**Warning signs:** Wrong campaign archived; test fails on assertion of campaign name in archived section.

### Pitfall 5: Radix Select/Dialog Portal Pattern
**What goes wrong:** `page.getByRole("option")` fails because Radix UI renders select options in a portal outside the component tree.
**Why it happens:** shadcn/ui Select component uses Radix under the hood, which portals content to the body.
**How to avoid:** Use `page.getByRole("option", { name: "..." })` at the page level (not scoped to a parent locator). For comboboxes, click the trigger first, then locate options globally.
**Warning signs:** "option" locator times out despite the dropdown being visually open.

### Pitfall 6: Serial Test Failure Cascade
**What goes wrong:** If the "create" test fails in a serial describe, all subsequent "edit" and "delete" tests also fail because the entity doesn't exist.
**Why it happens:** `test.describe.serial` skips remaining tests when one fails. This is actually correct behavior (D-10: no cleanup needed).
**How to avoid:** Accept this as expected behavior. In CI, the blob reporter captures which test failed first. Keep serial chains short (3-5 tests) to limit cascade scope.
**Warning signs:** 10+ tests failing with "not found" when only the root cause was one failed creation.

### Pitfall 7: Auth Cookie Expiration in Long Tests
**What goes wrong:** Tests that take 2+ minutes may encounter auth session expiration.
**Why it happens:** ZITADEL token lifetime may be shorter than the combined test runtime.
**How to avoid:** Set `test.setTimeout(120_000)` for long serial describes. The auth setup files generate fresh tokens at the start of each Playwright run. If individual tests are slow, break them into smaller serial chains.
**Warning signs:** 401 responses partway through a serial test chain.

### Pitfall 8: DestructiveConfirmDialog Type-to-Confirm
**What goes wrong:** Delete tests fail because the confirmation dialog requires typing the exact entity name.
**Why it happens:** `DestructiveConfirmDialog` component requires the user to type a confirmation string (usually the entity name) before the delete button enables.
**How to avoid:** After clicking delete and the dialog appears, read the required text from the dialog prompt, then type it into the confirmation input. Use `page.getByLabel()` or `page.getByPlaceholder()` to target the input.
**Warning signs:** Delete button remains disabled; test times out waiting for it to become clickable.

## Code Examples

### Navigating to Seed Campaign and Extracting ID
```typescript
// Pattern used in existing specs (role-gated.volunteer.spec.ts)
await page.goto("/")
await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

const campaignLink = page.getByRole("link", { name: /macon|bibb|campaign/i }).first()
await campaignLink.click()
await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })

const url = page.url()
const campaignId = url.match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
```

### Creating a Voter via UI Form
```typescript
// From voters/index.tsx -- the New Voter sheet
await page.getByRole("button", { name: /new voter/i }).click()

// Sheet opens -- fill form fields
await page.getByLabel("First Name").fill("Test")
await page.getByLabel("Last Name").fill("Alpha")
await page.getByLabel("Date of Birth").fill("1990-01-15")
await page.getByLabel("Party").fill("Democrat")
await page.getByLabel("Street Address").fill("100 Test St")
await page.getByLabel("City").fill("Macon")
await page.getByLabel("State").fill("GA")
await page.getByLabel("ZIP Code").fill("31201")

// Submit and verify
const responsePromise = page.waitForResponse(
  (resp) => resp.url().includes("/voters") && resp.request().method() === "POST"
)
await page.getByRole("button", { name: /create|save/i }).click()
const response = await responsePromise
expect(response.status()).toBe(201)
```

### Deleting a Voter via Row Action Menu
```typescript
// From voters/index.tsx -- MoreHorizontal dropdown
const voterRow = page.getByRole("row").filter({ hasText: "Test Alpha" })
await voterRow.getByRole("button", { name: /more/i }).or(
  voterRow.locator("[data-testid='row-actions']")
).click()

await page.getByRole("menuitem", { name: /delete/i }).click()

// DestructiveConfirmDialog -- type confirmation
const confirmInput = page.getByPlaceholder(/type.*confirm/i).or(
  page.getByRole("textbox").last()
)
await confirmInput.fill("Test Alpha")  // or whatever the required text is
await page.getByRole("button", { name: /delete/i }).click()

await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: 10_000 })
```

### Adding a Phone Contact
```typescript
// Navigate to voter detail > Contacts tab
await page.getByRole("tab", { name: /contacts/i }).click()
await page.getByRole("button", { name: /add phone/i }).click()

// Fill inline phone form (from ContactsTab.tsx)
await page.getByLabel(/phone number/i).fill("478-555-0001")

// Select phone type (Radix Select)
await page.getByRole("combobox").filter({ hasText: /type/i }).click()
await page.getByRole("option", { name: /mobile/i }).click()

await page.getByRole("button", { name: /save/i }).click()
await expect(page.getByText("478-555-0001")).toBeVisible({ timeout: 10_000 })
```

### Adding a Tag to a Voter
```typescript
// Navigate to voter detail > Tags tab
await page.getByRole("tab", { name: /tags/i }).click()

// TagsTab uses an add-tag mechanism
await page.getByRole("button", { name: /add tag/i }).click()

// Select from existing tags or type new
await page.getByRole("option", { name: "Priority Voter" }).click()

await expect(page.getByText("Priority Voter")).toBeVisible({ timeout: 10_000 })
```

### Adding a Note (Interaction)
```typescript
// Navigate to voter detail > History tab
await page.getByRole("tab", { name: /history/i }).click()

// Fill note textarea (from HistoryTab.tsx)
await page.getByPlaceholder(/add a note/i).or(
  page.getByRole("textbox")
).fill("Initial contact - friendly")

await page.getByRole("button", { name: /add note|save/i }).click()
await expect(page.getByText("Initial contact - friendly")).toBeVisible({ timeout: 10_000 })
```

### Campaign Ownership Transfer (Danger Zone)
```typescript
// Navigate to campaign settings > danger zone
// From danger.tsx -- RequireRole wraps these buttons
await page.getByRole("button", { name: /transfer ownership/i }).click()

// Select admin member from dropdown
await page.getByRole("combobox").click()
await page.getByRole("option", { name: /admin/i }).first().click()

await page.getByRole("button", { name: /transfer/i }).click()

// Type-to-confirm in DestructiveConfirmDialog
// ... type campaign name or required text
await page.getByRole("button", { name: /confirm/i }).click()
await expect(page.getByText(/transferred/i)).toBeVisible({ timeout: 10_000 })
```

## UI Element Reference

Critical button/action names and their role gates from source code inspection:

| Page | Element | Text/Label | Role Gate | Selector Hint |
|------|---------|------------|-----------|---------------|
| Voters index | New Voter button | "+ New Voter" | `RequireRole minimum="manager"` | `page.getByRole("button", { name: /new voter/i })` |
| Voter detail | Edit button | "Edit" (with Pencil icon) | `RequireRole minimum="manager"` | `page.getByRole("button", { name: /edit/i })` |
| Voter detail | Add Interaction button | "Add Interaction" | No role gate (all roles) | `page.getByRole("button", { name: /add interaction/i })` |
| Voter detail | Tabs | Overview, Contacts, Tags, History | No role gate | `page.getByRole("tab", { name: /contacts/i })` |
| Canvassing | New Turf link | "New Turf" | Requires manager+ | `page.getByRole("link", { name: /new turf/i })` |
| Phone Banking | New Call List | varies | Requires manager+ | check page for exact text |
| Surveys | New Survey | varies | Requires manager+ | check page for exact text |
| Org dashboard | Create Campaign | "Create Campaign" | `RequireOrgRole minimum="org_admin"` | `page.getByRole("link", { name: /create campaign/i })` |
| Org settings | Save Changes | "Save Changes" | org_owner only | `page.getByRole("button", { name: /save changes/i })` |
| Org settings | Org Name input | readonly for non-owner | `readOnly` attribute + `bg-muted` class | `page.getByLabel(/organization name/i)` |
| Campaign settings | Members tab | "Members" | admin+ | navigation link |
| Campaign danger | Transfer Ownership | "Transfer Ownership" | owner only | `page.getByRole("button", { name: /transfer ownership/i })` |
| Campaign danger | Delete Campaign | "Delete Campaign" | owner only | `page.getByRole("button", { name: /delete campaign/i })` |
| Voter tags page | Create Tag | "Create Tag" or similar | `RequireRole minimum="manager"` | check exact text |
| Voter lists page | Create List | "Create List" | `RequireRole minimum="manager"` | check exact text |

## Auth Project Routing

Playwright config routes specs to auth projects based on filename suffix:

| File Suffix | Auth Project | Storage State | User |
|-------------|-------------|---------------|------|
| `.spec.ts` (no role suffix) | chromium | `playwright/.auth/owner.json` | owner1@localhost |
| `.admin.spec.ts` | admin | `playwright/.auth/admin.json` | admin1@localhost |
| `.manager.spec.ts` | manager | `playwright/.auth/manager.json` | manager1@localhost |
| `.volunteer.spec.ts` | volunteer | `playwright/.auth/volunteer.json` | volunteer1@localhost |
| `.viewer.spec.ts` | viewer | `playwright/.auth/viewer.json` | viewer1@localhost |

The regex in `playwright.config.ts`:
- Default (chromium): `testMatch: /^(?!.*\.(admin|manager|volunteer|viewer)\.spec\.ts).*\.spec\.ts$/`
- Admin: `testMatch: /.*\.admin\.spec\.ts/`
- etc.

**Important:** `rbac.spec.ts` (owner) runs under default auth. `rbac.admin.spec.ts` runs under admin auth. `org-management.spec.ts` (no suffix) runs under owner auth. `campaign-settings.spec.ts` runs under owner auth. All voter specs (unsuffixed) run under owner auth -- owner has full permissions to exercise all CRUD.

## Spec-to-Testing-Plan Mapping

| Spec File | Testing Plan Sections | Key Tests |
|-----------|----------------------|-----------|
| `rbac.spec.ts` | RBAC-07, RBAC-09 | Owner has all admin caps + danger zone + org-owner cross-campaign |
| `rbac.admin.spec.ts` | RBAC-06, RBAC-08 | All manager caps + member management + settings + org-admin cross-campaign |
| `rbac.manager.spec.ts` | RBAC-05 | CRUD buttons visible; campaign settings members NOT accessible |
| `rbac.volunteer.spec.ts` | RBAC-04 | Add Interaction visible; Edit voter NOT visible; no management actions |
| `rbac.viewer.spec.ts` | RBAC-03 | All mutation buttons hidden; direct URL access to restricted routes |
| `org-management.spec.ts` | ORG-01 through ORG-08 | Dashboard, campaign create, archive/unarchive, settings, members |
| `campaign-settings.spec.ts` | CAMP-01 through CAMP-06 | Edit settings, invite/role-change/remove member, transfer ownership, delete |
| `voter-crud.spec.ts` | VCRUD-01 through VCRUD-04 | Create 20+ voters (UI + API), edit 5, delete 5 imported + 20 created |
| `voter-contacts.spec.ts` | CON-01 through CON-06 | Phone/email/address add, edit, delete across 20 voters |
| `voter-tags.spec.ts` | TAG-01 through TAG-05 | Create 10 tags, assign to voters, validate, remove, delete tags |
| `voter-notes.spec.ts` | NOTE-01 through NOTE-03 | Add notes to 20 voters, edit 10, delete all |
| `voter-lists.spec.ts` | VLIST-01 through VLIST-06 | Static list create/add/remove, dynamic list create, rename, delete |

## Spec Execution Estimates

| Spec File | Approx Tests | Serial? | Est. Duration | Rationale |
|-----------|-------------|---------|---------------|-----------|
| `rbac.viewer.spec.ts` | 8-10 | No (parallel) | 30-45s | Each test navigates to a page and asserts visibility |
| `rbac.volunteer.spec.ts` | 5-7 | No | 25-35s | Fewer pages to check than viewer |
| `rbac.manager.spec.ts` | 8-10 | No | 30-45s | Verify all CRUD buttons visible |
| `rbac.admin.spec.ts` | 8-10 | No | 30-45s | Manager caps + settings + org-admin test |
| `rbac.spec.ts` | 8-10 | No | 30-45s | Admin caps + danger zone + org-owner test |
| `org-management.spec.ts` | 6-8 | Serial | 60-90s | Campaign create/archive/unarchive lifecycle |
| `campaign-settings.spec.ts` | 6-8 | Serial | 60-90s | Member invite/role-change/remove + ownership transfer + delete |
| `voter-crud.spec.ts` | 4-6 | Serial | 90-120s | 2-3 UI creates + 17 API creates + edits + deletes |
| `voter-contacts.spec.ts` | 4-5 | Serial | 60-90s | Bulk contact add/edit/delete across 20 voters |
| `voter-tags.spec.ts` | 5 | Serial | 60-90s | Tag CRUD + assign/remove across voters |
| `voter-notes.spec.ts` | 3 | Serial | 45-60s | Note add/edit/delete |
| `voter-lists.spec.ts` | 5-6 | Serial | 45-60s | List CRUD + voter add/remove |

**Total:** ~70-85 individual tests, estimated 8-12 minutes total across 4 CI shards.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase-prefixed spec names | Domain-based spec names | Phase 58 (D-02) | Cleaner naming, canonical test suite |
| Single auth context (admin) | 5 per-role auth projects | Phase 57 | Enables comprehensive RBAC testing |
| Manual test data creation | Seed data + API-assisted creation | Phase 58 (D-04, D-05) | Faster, more reliable tests |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.58.2 |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test --grep "voter-crud"` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-01 | RBAC permission matrix | e2e | `cd web && npx playwright test rbac` | Wave 0 |
| E2E-02 | Org management workflows | e2e | `cd web && npx playwright test org-management` | Wave 0 |
| E2E-03 | Campaign settings CRUD | e2e | `cd web && npx playwright test campaign-settings` | Wave 0 |
| E2E-07 | Voter CRUD lifecycle | e2e | `cd web && npx playwright test voter-crud` | Wave 0 |
| E2E-08 | Voter contact CRUD | e2e | `cd web && npx playwright test voter-contacts` | Wave 0 |
| E2E-09 | Voter tag lifecycle | e2e | `cd web && npx playwright test voter-tags` | Wave 0 |
| E2E-10 | Voter note lifecycle | e2e | `cd web && npx playwright test voter-notes` | Wave 0 |
| E2E-11 | Voter list CRUD | e2e | `cd web && npx playwright test voter-lists` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test {spec-being-worked-on}`
- **Per wave merge:** `cd web && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing Playwright infrastructure (config, auth setups, CI pipeline) covers all phase requirements. No additional framework setup needed.

## Open Questions

1. **Voter form label accuracy**
   - What we know: The voter creation sheet uses a Zod schema with fields like `first_name`, `last_name`, `date_of_birth`, etc.
   - What's unclear: Exact `<Label>` text used in the sheet form -- selectors like `page.getByLabel("First Name")` need to match the actual rendered label.
   - Recommendation: During implementation, inspect the VoterEditSheet component for exact label text. Use `page.getByLabel()` first, fall back to `page.getByPlaceholder()`.

2. **Tag assignment UI on voter detail**
   - What we know: TagsTab exists at `web/src/components/voters/TagsTab.tsx` and uses hooks from `useVoterTags`.
   - What's unclear: Exact UI flow for assigning an existing tag to a voter (combobox? dialog? inline add?).
   - Recommendation: Inspect TagsTab implementation during spec writing to determine exact selectors.

3. **Contact form inline vs dialog**
   - What we know: ContactsTab.tsx uses inline forms for phone/email/address with schemas.
   - What's unclear: Whether forms appear inline (expand in place) or in a dialog/sheet.
   - Recommendation: The code shows `PhoneFormProps` with `onSave`/`onCancel` suggesting inline forms. Verify during implementation.

4. **Campaign creation wizard steps**
   - What we know: Testing plan mentions a 3-step wizard. The existing `connected-journey.spec.ts` shows a simpler form with name + type fields.
   - What's unclear: Whether the current UI has the full 3-step wizard or the simpler form.
   - Recommendation: Use the pattern from `connected-journey.spec.ts` as the baseline. If a multi-step wizard exists, adapt accordingly.

## Sources

### Primary (HIGH confidence)
- `web/playwright.config.ts` -- Playwright configuration with 5 auth projects, shard support
- `web/e2e/connected-journey.spec.ts` -- Serial test pattern with `test.step()`
- `web/e2e/role-gated.admin.spec.ts` -- RBAC test pattern
- `web/e2e/role-gated.volunteer.spec.ts` -- RBAC negative test pattern
- `web/e2e/auth-owner.setup.ts` -- Auth setup pattern
- `web/e2e/campaign-archive.spec.ts` -- Archive/unarchive pattern with campaign card targeting
- `web/e2e/phase27-filter-wiring.spec.ts` -- `page.request.get()` API call pattern
- `web/src/routes/campaigns/$campaignId/voters/index.tsx` -- Voter page with "New Voter" button (RequireRole)
- `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` -- Voter detail with Edit, Add Interaction, Tabs
- `web/src/routes/campaigns/$campaignId/settings/members.tsx` -- Member management with invite/role-change/remove
- `web/src/routes/campaigns/$campaignId/settings/danger.tsx` -- Ownership transfer and delete campaign
- `web/src/routes/campaigns/$campaignId/voters/tags/index.tsx` -- Tag CRUD page
- `web/src/routes/campaigns/$campaignId/voters/lists/index.tsx` -- Voter lists index
- `web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx` -- Voter list detail with add/remove voters
- `web/src/components/voters/ContactsTab.tsx` -- Phone/email/address inline forms
- `web/src/components/voters/HistoryTab.tsx` -- Note CRUD with edit/delete
- `web/src/routes/index.tsx` -- Org dashboard with Create Campaign (RequireOrgRole)
- `app/api/v1/voters.py` -- Voter API endpoints with rate limits and role requirements
- `scripts/create-e2e-users.py` -- 15 E2E user definitions with roles
- `.github/workflows/pr.yml` -- CI pipeline with 4-shard E2E configuration
- `docs/testing-plan.md` -- Comprehensive testing plan sections 3-5, 8-14

### Secondary (MEDIUM confidence)
- Playwright 1.58.2 documentation -- `test.describe.serial`, `page.request`, `storageState` patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools already installed and configured; version verified
- Architecture: HIGH -- Patterns derived directly from existing spec files in the codebase
- Pitfalls: HIGH -- Based on actual API rate limits, UI component patterns, and Playwright behaviors observed in existing specs

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no library upgrades expected during this milestone)
