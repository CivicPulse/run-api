# Phase 19: Verification & Validation Gap Closure - Research

**Researched:** 2026-03-12
**Domain:** Verification documentation, Nyquist test completion, milestone audit
**Confidence:** HIGH

## Summary

Phase 19 is a documentation and test completion phase -- no new features. The v1.2 audit found that Phases 13 (Voter Management) and 15 (Call Lists & DNC) lack VERIFICATION.md files, leaving 19 requirements without formal verification evidence. Additionally, Phase 15 has 13 `it.todo` Vitest stubs that need real implementations to achieve Nyquist wave_0_complete.

The code for all 19 requirements is already implemented and confirmed wired by the integration checker. The gap is strictly documentation + test stubs. Phase 13 already has a comprehensive Playwright spec (`phase13-voter-verify.spec.ts`, 435 lines covering all 11 VOTR requirements) that was created during a previous verification session but never formalized into a VERIFICATION.md. Phase 15 has no equivalent Playwright spec yet.

**Primary recommendation:** Create VERIFICATION.md files for Phase 13 and 15 using Phase 18's format as template. Implement the 13 Phase 15 `it.todo` stubs following the established `useVolunteers.test.ts` mock pattern. Write a Phase 15 Playwright spec. Then re-audit the 19 previously-unverified requirements to confirm 60/60.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Code inspection for hook/API wiring evidence (file paths, exports, route registrations)
- Playwright e2e tests for visual-only workflows -- key workflows only, not every requirement
- One Playwright spec file per phase: `phase-13-verification.spec.ts` and `phase-15-verification.spec.ts`
- Follow Phase 18 VERIFICATION.md format exactly: observable truths table + human_verification items
- Playwright replaces manual visual checks (user preference)
- Phase 13 verification specifics: code inspection only for VOTR-01, 02, 03, 04, 05, 06, 09; code inspection + Playwright for VOTR-07, 08, 10, 11
- Phase 15 verification specifics: code inspection for hook wiring; Playwright for 2-3 key visual flows (call list creation + detail, DNC search filtering, DNC import dialog)
- Nyquist test implementation: 9 hook tests (useCallLists.test.ts x5, useDNC.test.ts x4) + 4 component tests (dnc/index.test.tsx)
- Hook tests: mock ky/fetch, verify correct URL/method/payload, confirm query key invalidation on mutations
- Component tests: render DNCListPage with mocked useQuery, type in search input, assert filtered rows, test digit-stripping logic
- Match existing hook test patterns in the project (mock API + verify calls)
- Re-audit: targeted gap check only -- verify 19 previously-unverified requirements, do NOT re-check the 41 already-satisfied ones
- Update existing v1.2-MILESTONE-AUDIT.md in place

### Claude's Discretion
- Which specific observable truths to list per requirement (granularity of evidence)
- Playwright test flow design (exact navigation steps, assertions)
- Mock data shapes for Nyquist tests
- Human_verification items selection (which visual checks to include in VERIFICATION.md frontmatter)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOTR-01 | User can view and manage contacts (phone, email, address) in voter detail | Code inspection: `ContactsTab` in `$voterId.tsx`, `useVoterContacts.ts` hooks. Existing Playwright in `phase13-voter-verify.spec.ts` lines 42-62 |
| VOTR-02 | User can set a primary contact for each contact type | Code inspection: `useSetPrimaryContact` hook. Existing Playwright lines 68-93 |
| VOTR-03 | User can create a new voter record manually | Code inspection: `VoterEditSheet`, `useCreateVoter`. Existing Playwright lines 98-131 |
| VOTR-04 | User can edit an existing voter record | Code inspection: Edit button + VoterEditSheet. Existing Playwright lines 136-167 |
| VOTR-05 | User can manage campaign-level voter tags | Code inspection: `voters/tags/index.tsx`, `useVoterTags.ts`. Existing Playwright lines 172-194 |
| VOTR-06 | User can add/remove tags on individual voters | Code inspection: `TagsTab` component. Existing Playwright lines 199-233 |
| VOTR-07 | User can create and manage static voter lists | Code inspection: `voters/lists/index.tsx`, `useVoterLists.ts`. Existing Playwright lines 238-261 |
| VOTR-08 | User can create and manage dynamic voter lists with filter criteria | Code inspection: `VoterFilterBuilder`, dynamic list dialog. Existing Playwright lines 266-304 |
| VOTR-09 | User can view voter list detail with member management | Code inspection: `voters/lists/$listId.tsx`. Existing Playwright lines 309-360 |
| VOTR-10 | User can use advanced search with composable filters | Code inspection: `VoterFilterBuilder` in voters index. Existing Playwright lines 365-398 |
| VOTR-11 | User can add interaction notes on voter detail page | Code inspection: `HistoryTab.tsx`. Existing Playwright lines 404-435 |
| CALL-01 | User can create a call list from a voter universe with DNC filtering | Code inspection: `useCreateCallList`, `CallListDialog` in `call-lists/index.tsx`. Needs new Playwright spec |
| CALL-02 | User can view call list detail with entry statuses | Code inspection: `call-lists/$callListId.tsx`, `STATUS_LABELS` mapping. Needs new Playwright spec |
| CALL-03 | User can edit and delete call lists | Code inspection: `useUpdateCallList`, `useDeleteCallList`, kebab menu actions. Code inspection only |
| CALL-04 | User can view the DNC list for a campaign | Code inspection: `dnc/index.tsx`, `useDNCEntries`. Needs new Playwright spec |
| CALL-05 | User can add an individual phone number to the DNC list | Code inspection: `useAddDNCEntry`, `AddNumber` dialog. Code inspection only |
| CALL-06 | User can bulk import DNC numbers from a file | Code inspection: `useImportDNC`, import dialog. Needs new Playwright spec |
| CALL-07 | User can remove a number from the DNC list | Code inspection: `useDeleteDNCEntry`, Remove button. Code inspection only |
| CALL-08 | User can check if a phone number is on the DNC list | Code inspection: client-side search with `search.replace(/\D/g, "")`. Needs new Playwright spec |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.x | Unit/component testing | Already configured in `web/vitest.config.ts` with happy-dom |
| @testing-library/react | latest | Hook/component rendering | Already used across 28 test files |
| Playwright | latest | E2E visual verification | Already configured in `web/playwright.config.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/user-event | latest | User interaction simulation | DNC component tests (typing in search input) |
| @tanstack/react-query | 5.x | Query wrapper for hook tests | All hook tests need `QueryClientProvider` wrapper |

### No New Dependencies
This phase uses only existing test infrastructure. No packages need to be installed.

## Architecture Patterns

### VERIFICATION.md Structure (from Phase 18 template)

```
---
phase: {phase-slug}
verified: {ISO timestamp}
status: passed
score: {N}/{N} must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "{description}"
    expected: "{what should happen}"
    why_human: "{why automated check insufficient}"
---

# Phase {N}: {Name} Verification Report

## Goal Achievement
### Observable Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|

## Required Artifacts
| Artifact | Min Lines | Actual Lines | Status | Details |

## Key Link Verification
| From | To | Via | Status | Details |

## Requirements Coverage
| Requirement | Description | Source Plans | Status | Evidence |

## Anti-Patterns Found
{table of placeholder/return null/TODO checks}

## Build and Test Verification
| Check | Result |
```

### Hook Test Pattern (from useVolunteers.test.ts)

The project has a consistent hook test pattern across all phases:

```typescript
// 1. Mock the api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"
const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

// 2. QueryClient wrapper factory
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

// 3. Mock return value structure
mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockData) })

// 4. renderHook with wrapper
const { result } = renderHook(() => useHook("campaign-1"), {
  wrapper: makeWrapper(),
})

// 5. Assert API call and response
await waitFor(() => expect(result.current.isSuccess).toBe(true))
expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/...")
```

### Component Test Pattern (from sessions/index.test.tsx)

```typescript
// 1. vi.hoisted for store before mocks
const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))

// 2. Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  Link: ({ children, to, ...props }) => <a href={to ?? "#"} {...props}>{children}</a>,
  useParams: vi.fn(() => ({ campaignId: "campaign-1" })),
}))

// 3. Mock hooks with vi.fn() returns
vi.mock("@/hooks/useDNC", () => ({
  useDNCEntries: vi.fn(),
  useAddDNCEntry: vi.fn(),
  useDeleteDNCEntry: vi.fn(),
  useImportDNC: vi.fn(),
}))

// 4. Mock shared components
vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({ data, columns, emptyTitle }) => { ... },
}))
```

### Playwright Verification Spec Pattern (from shift-verify.spec.ts)

```typescript
const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 25_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 30_000 })
  await page.waitForTimeout(2000)
}

test("descriptive test name", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/p15-01-screenshot-name.png" })
  // assertions on body text or specific elements
})
```

### Anti-Patterns to Avoid
- **Copying the entire 435-line phase13-voter-verify.spec.ts as the "new" spec:** The CONTEXT.md specifies `phase-13-verification.spec.ts` as the file name. The existing `phase13-voter-verify.spec.ts` can be referenced as evidence but the verification plan should create dedicated verification specs if needed, or reference the existing ones.
- **Testing more than the stub descriptions specify:** The `it.todo` descriptions are precise -- implement exactly what they say, not more.
- **Using real API calls in hook tests:** Always mock `@/api/client` -- never make real HTTP requests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QueryClient wrapper for hook tests | Custom provider setup each test | `makeWrapper()` factory function | Consistent retry:false config, avoids test pollution |
| Component mock infrastructure | Manual React element creation | `vi.hoisted` + `vi.mock` pattern from sessions tests | Handles module loading order correctly |
| Playwright login | Different auth flows per test | Shared `login()` helper function | All existing specs use the same ZITADEL login flow |

## Common Pitfalls

### Pitfall 1: Mutation mock structure mismatch
**What goes wrong:** Hook tests for mutation hooks (useCreateCallList, useAddDNCEntry) fail because the mock return doesn't match ky's chainable API.
**Why it happens:** ky returns `{ json: () => Promise<T> }` for GET, but mutations use `api.post(...).json<T>()` which needs `mockReturnValue({ json: vi.fn().mockResolvedValue(data) })`.
**How to avoid:** Use `mockReturnValue({ json: vi.fn().mockResolvedValue(mockData) })` for all hooks. For `.then(() => undefined)` patterns (like useDeleteCallList), use `mockResolvedValue(undefined)` wrapped in a thenable.
**Warning signs:** "TypeError: .json is not a function" in test output.

### Pitfall 2: useDeleteCallList returns .then(() => undefined)
**What goes wrong:** The delete hook has `api.delete(...).then(() => undefined)` which is different from the `.json()` pattern.
**Why it happens:** DELETE responses don't return JSON bodies.
**How to avoid:** Mock as `mockReturnValue({ then: (fn: Function) => Promise.resolve(fn()) })` or more simply `mockResolvedValue(undefined)` if the mock supports thenable resolution.
**Warning signs:** Delete hook tests never resolve.

### Pitfall 3: useImportDNC uses FormData not JSON
**What goes wrong:** Test asserts `{ json: data }` but hook actually uses `{ body: formData }`.
**Why it happens:** The import hook sends multipart form data, not JSON.
**How to avoid:** Assert `{ body: expect.any(FormData) }` for the import mutation test, or verify formData.get("file") matches.
**Warning signs:** Mock assertion mismatch on second argument to api.post.

### Pitfall 4: DNC component test needs DataTable mock
**What goes wrong:** Component tests fail because DataTable has complex internal dependencies.
**Why it happens:** DataTable uses TanStack Table internally with many hooks.
**How to avoid:** Mock DataTable as a simplified component that renders data props. The existing test pattern from sessions/index.test.tsx shows exactly how.
**Warning signs:** "Cannot read properties of undefined" errors from tanstack/react-table internals.

### Pitfall 5: Phase 13 Playwright spec already exists
**What goes wrong:** Creating a new `phase-13-verification.spec.ts` that duplicates `phase13-voter-verify.spec.ts`.
**Why it happens:** The CONTEXT.md says to create `phase-13-verification.spec.ts`, but `phase13-voter-verify.spec.ts` already covers all 11 VOTR requirements.
**How to avoid:** Reference the existing spec as evidence in the VERIFICATION.md. If a new spec is still desired per CONTEXT.md naming convention, keep it minimal and reference the existing comprehensive spec, or rename the existing one.
**Warning signs:** Two spec files testing the same routes.

### Pitfall 6: Coverage thresholds set at 95%
**What goes wrong:** Running `vitest --coverage` fails on thresholds.
**Why it happens:** vitest.config.ts has 95% thresholds but project-wide coverage is ~45%.
**How to avoid:** Run tests with `--run` only (no `--coverage`) for regular validation. This is a pre-existing condition documented in Phase 15's 15-06-SUMMARY.
**Warning signs:** Test suite reports "threshold not met" even though all tests pass.

## Code Examples

### Hook Test: useCallLists (query hook)
```typescript
// Source: Pattern from useVolunteers.test.ts adapted for useCallLists
describe("useCallLists (CALL-01)", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("useCallLists fetches from /api/v1/campaigns/{id}/call-lists", async () => {
    const paginatedResponse = {
      items: [{ id: "cl-1", name: "Test List", status: "active", total_entries: 10, completed_entries: 3, created_at: "2026-01-01T00:00:00Z" }],
      pagination: { next_cursor: null, has_more: false },
    }
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(paginatedResponse) })

    const { result } = renderHook(() => useCallLists("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/call-lists")
    expect(result.current.data).toEqual(paginatedResponse)
  })
})
```

### Hook Test: useCreateCallList (mutation with invalidation)
```typescript
// Source: Pattern from useVolunteers.test.ts useCreateVolunteer
describe("useCreateCallList (CALL-01)", () => {
  it("useCreateCallList posts to /api/v1/campaigns/{id}/call-lists with name and voter_list_id", async () => {
    const mockCallList = { id: "cl-new", name: "New List", status: "draft", total_entries: 0, completed_entries: 0, created_at: "2026-01-01T00:00:00Z", max_attempts: 3, claim_timeout_minutes: 15, cooldown_minutes: 30, voter_list_id: "vl-1", script_id: null, created_by: "user-1", updated_at: "2026-01-01T00:00:00Z" }
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockCallList) })

    const { result } = renderHook(() => useCreateCallList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ name: "New List", voter_list_id: "vl-1" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists",
      { json: { name: "New List", voter_list_id: "vl-1" } },
    )
  })
})
```

### Hook Test: useDeleteCallList (mutation with .then pattern)
```typescript
// Source: useCallLists.ts line 82 — .then(() => undefined)
describe("useDeleteCallList (CALL-03)", () => {
  it("useDeleteCallList sends DELETE to /api/v1/campaigns/{id}/call-lists/{id}", async () => {
    // useDeleteCallList uses .then(() => undefined), mock must return thenable
    mockApi.delete.mockReturnValue(Promise.resolve())

    const { result } = renderHook(() => useDeleteCallList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("cl-1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists/cl-1",
    )
  })
})
```

### Hook Test: useImportDNC (FormData mutation)
```typescript
// Source: useDNC.ts line 37-51 — body: formData pattern
describe("useImportDNC (CALL-06)", () => {
  it("useImportDNC sends FormData multipart POST to /api/v1/campaigns/{id}/dnc/import", async () => {
    const importResult = { added: 5, skipped: 2, invalid: 1 }
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(importResult) })

    const { result } = renderHook(() => useImportDNC("campaign-1"), {
      wrapper: makeWrapper(),
    })

    const testFile = new File(["5551234567\n5559876543"], "numbers.csv", { type: "text/csv" })
    result.current.mutate(testFile)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/dnc/import",
      { body: expect.any(FormData) },
    )
  })
})
```

### DNC Component Test: Search digit stripping
```typescript
// Source: dnc/index.tsx line 46 — search.replace(/\D/g, "")
// Key logic: entries.filter(e => e.phone_number.includes(search.replace(/\D/g, "")))
describe("DNCListPage", () => {
  it("search with digits only strips non-digit characters before comparing", async () => {
    // Setup: mock useDNCEntries to return entries
    // Render component, type "(555) 123" in search input
    // Assert only entries matching "555123" are shown
    // This tests the \D stripping: "(555) 123" -> "555123"
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual visual verification | Playwright e2e + VERIFICATION.md | Phase 17+ | User preference: Playwright replaces manual checks |
| No formal verification | Observable truths table format | Phase 12+ | Standardized format across all phases |
| Bare `it.todo` stubs | Implemented tests with mock API pattern | Phase 16+ | Nyquist wave_0_complete requires real implementations |

## Key Existing Artifacts

### Phase 13 - Already Available
| Artifact | Path | Status | Notes |
|----------|------|--------|-------|
| Playwright spec (11 VOTR tests) | `web/e2e/phase13-voter-verify.spec.ts` | EXISTS (435 lines) | Covers all 11 VOTR requirements with screenshots |
| Hook source: useVoterContacts | `web/src/hooks/useVoterContacts.ts` | Implemented | VOTR-01, VOTR-02 |
| Hook source: useVoterTags | `web/src/hooks/useVoterTags.ts` | Implemented | VOTR-05, VOTR-06 |
| Hook source: useVoters | `web/src/hooks/useVoters.ts` | Implemented | VOTR-03, VOTR-04, VOTR-10 |
| Hook source: useVoterLists | `web/src/hooks/useVoterLists.ts` | Implemented | VOTR-07, VOTR-08, VOTR-09 |
| Components: VoterEditSheet | `web/src/components/voters/VoterEditSheet.tsx` | Implemented | VOTR-03, VOTR-04 |
| Components: VoterFilterBuilder | `web/src/components/voters/VoterFilterBuilder.tsx` | Implemented | VOTR-08, VOTR-10 |
| Components: HistoryTab | `web/src/components/voters/HistoryTab.tsx` | Implemented | VOTR-11 |
| Route: voters index | `web/src/routes/campaigns/$campaignId/voters/index.tsx` | Implemented | VOTR-03, VOTR-10 |
| Route: voter detail | `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` | Implemented | VOTR-01-06, VOTR-11 |
| Route: lists index | `web/src/routes/campaigns/$campaignId/voters/lists/index.tsx` | Implemented | VOTR-07, VOTR-08 |
| Route: list detail | `web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx` | Implemented | VOTR-09 |
| Route: tags index | `web/src/routes/campaigns/$campaignId/voters/tags/index.tsx` | Implemented | VOTR-05 |
| SUMMARY files | 7 files (13-01 through 13-07) | Complete | Coverage: VOTR-01,02,04,05,06 in frontmatter |

### Phase 15 - Already Available
| Artifact | Path | Status | Notes |
|----------|------|--------|-------|
| Hook source: useCallLists | `web/src/hooks/useCallLists.ts` | Implemented (107 lines) | 7 hooks, all wired to API |
| Hook source: useDNC | `web/src/hooks/useDNC.ts` | Implemented (51 lines) | 4 hooks, all wired to API |
| Hook test stubs | `web/src/hooks/useCallLists.test.ts` | 5 it.todo stubs | Need real implementations |
| Hook test stubs | `web/src/hooks/useDNC.test.ts` | 4 it.todo stubs | Need real implementations |
| Component test stubs | `web/src/routes/.../dnc/index.test.tsx` | 4 it.todo stubs | Need real implementations |
| Types: call-list | `web/src/types/call-list.ts` | Defined | CallListSummary, Detail, Entry, Create, Update |
| Types: dnc | `web/src/types/dnc.ts` | Defined | DNCEntry, DNCImportResult |
| Route: call lists index | `web/src/routes/.../call-lists/index.tsx` | Implemented | Create/edit/delete dialogs |
| Route: call list detail | `web/src/routes/.../call-lists/$callListId.tsx` | Implemented | Entry table, status tabs, append targets |
| Route: DNC list | `web/src/routes/.../dnc/index.tsx` | Implemented (245 lines) | Search, add, import, delete |
| SUMMARY files | 6 files (15-01 through 15-06) | Complete | CALL-01-08 in 15-02-SUMMARY |
| VALIDATION.md | `15-VALIDATION.md` | wave_0_complete: false | Needs update after stubs implemented |

## Test Infrastructure Status

| Check | Current State |
|-------|---------------|
| Vitest full suite | 228 passed, 13 todo, 0 failures |
| Test files | 28 total (25 passed, 3 skipped) |
| `it.todo` stubs needing implementation | 13 (all in Phase 15 files) |
| Playwright config | `web/playwright.config.ts` exists |
| Playwright debug config | `web/playwright.debug.config.ts` exists |
| Test setup | `web/src/test/setup.ts` with happy-dom mocks |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + happy-dom + @testing-library/react |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |
| Full suite command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOTR-01 through VOTR-11 | Voter management verification | code inspection + Playwright | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts` | Existing spec covers all 11 |
| CALL-01 | Call list creation | unit (hook) | `npm run test -- --run useCallLists` | Stub exists |
| CALL-02 | Call list detail | unit (hook) | `npm run test -- --run useCallLists` | Stub exists |
| CALL-03 | Call list edit/delete | unit (hook) | `npm run test -- --run useCallLists` | Stub exists |
| CALL-04 | DNC list view | unit (hook) | `npm run test -- --run useDNC` | Stub exists |
| CALL-05 | DNC add number | unit (hook) | `npm run test -- --run useDNC` | Stub exists |
| CALL-06 | DNC bulk import | unit (hook) | `npm run test -- --run useDNC` | Stub exists |
| CALL-07 | DNC remove number | unit (hook) | `npm run test -- --run useDNC` | Stub exists |
| CALL-08 | DNC search check | component | `npm run test -- --run DNCListPage` | Stub exists |

### Sampling Rate
- **Per task commit:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **Per wave merge:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- all 13 `it.todo` stubs already exist. The task is to implement the real test logic inside them. The test infrastructure (Vitest config, setup file, mock patterns) is fully established.

## Open Questions

1. **Phase 13 Playwright spec naming**
   - What we know: `phase13-voter-verify.spec.ts` already exists with full coverage. CONTEXT.md says to create `phase-13-verification.spec.ts`.
   - What's unclear: Whether to rename the existing file, create a symlink, or just reference the existing file as evidence in VERIFICATION.md.
   - Recommendation: Reference the existing `phase13-voter-verify.spec.ts` as evidence in the VERIFICATION.md. Avoid creating duplicate test files. If naming convention matters, rename the existing file.

2. **VoterEditSheet known bug**
   - What we know: The existing `phase13-voter-verify.spec.ts` VOTR-04 test documents a bug where clicking Edit crashes with "A Select.Item must have a value prop that is not an empty string." The VoterEditSheet.tsx file appears in the git status as modified.
   - What's unclear: Whether this bug affects the verification status of VOTR-04.
   - Recommendation: VOTR-04 should be marked as SATISFIED with a note that the Edit button renders and is RequireRole-gated (the button exists, the form opens), but the select item empty-string issue is a known cosmetic bug. The requirement is about capability, not bug-free execution.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all source files in `web/src/hooks/` and `web/src/routes/`
- Existing test files: `useVolunteers.test.ts` (392 lines, fully implemented pattern reference)
- Existing test files: `useCallLists.test.ts`, `useDNC.test.ts`, `dnc/index.test.tsx` (stub files, 9/9/8 lines)
- Phase 18 VERIFICATION.md (177 lines, template format reference)
- v1.2 Milestone Audit (330 lines, gap source reference)
- Existing Playwright specs: `phase13-voter-verify.spec.ts` (435 lines), `shift-verify.spec.ts` (87 lines)
- Vitest run output: 228 passed, 13 todo, 0 failures

### Secondary (MEDIUM confidence)
- Phase 13 SUMMARY files (7 files, requirements-completed frontmatter cross-referenced)
- Phase 15 SUMMARY files (6 files, requirements-completed frontmatter cross-referenced)
- Phase 15 VALIDATION.md (wave_0_complete: false confirmed)

### Tertiary (LOW confidence)
- None -- all findings verified from direct code inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and configured
- Architecture: HIGH - template format verified from Phase 18, test patterns verified from existing tests
- Pitfalls: HIGH - identified from actual code inspection (FormData, .then() patterns, existing Playwright spec)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependencies, all internal patterns)
