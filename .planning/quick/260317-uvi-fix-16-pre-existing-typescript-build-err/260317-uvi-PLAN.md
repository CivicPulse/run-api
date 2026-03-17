---
phase: quick
plan: 260317-uvi
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/field/AssignmentCard.tsx
  - web/src/components/field/CompletionSummary.tsx
  - web/src/components/field/FieldHeader.tsx
  - web/src/routes/field/$campaignId/canvassing.tsx
  - web/src/routes/field/$campaignId/phone-banking.tsx
  - web/src/hooks/useCallingSession.ts
  - web/src/hooks/useCanvassingWizard.ts
  - web/src/hooks/useConnectivityStatus.test.ts
  - web/src/hooks/useSyncEngine.ts
  - web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx
  - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx
autonomous: true
must_haves:
  truths:
    - "`cd web && npx tsc -p tsconfig.app.json --noEmit` exits with code 0 and produces zero errors"
  artifacts:
    - path: "web/src/components/field/AssignmentCard.tsx"
      provides: "Fixed router to prop and removed unused destructured id"
    - path: "web/src/hooks/useSyncEngine.ts"
      provides: "Fixed function call with correct argument count"
  key_links: []
---

<objective>
Fix all 16 pre-existing TypeScript build errors across v1.4 frontend features so `tsc --noEmit` passes cleanly.

Purpose: Eliminate TypeScript build errors that accumulated during v1.4 feature development, restoring a clean type-check baseline.
Output: Zero TypeScript errors from `npx tsc -p tsconfig.app.json --noEmit`.
</objective>

<execution_context>
@/home/kwhatcher/.claude/get-shit-done/workflows/execute-plan.md
@/home/kwhatcher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Error inventory (16 errors, 4 categories):

**Cat 1 — TanStack Router `to` prop type (7 errors, TS2322):**
Template literal strings like `/field/${campaignId}` don't match the router's typed route union. Fix: cast with `as string` or use the router's param syntax `/field/$campaignId` with params prop.
- `src/components/field/AssignmentCard.tsx:30` — `/field/${string}/canvassing` or `/phone-banking`
- `src/components/field/CompletionSummary.tsx:39` — `/field/${string}`
- `src/components/field/FieldHeader.tsx:50` — `/field/${string}`
- `src/routes/field/$campaignId/canvassing.tsx:265` — `/field/${string}`
- `src/routes/field/$campaignId/phone-banking.tsx:176` — `/field/${string}`
- `src/routes/field/$campaignId/phone-banking.tsx:217` — `/field/${string}`

**Cat 2 — Unused variables (6 errors, TS6133):**
- `src/components/field/AssignmentCard.tsx:16` — `id` destructured but unused
- `src/hooks/useCallingSession.ts:7` — `useClaimEntry` imported but unused
- `src/hooks/useCallingSession.ts:66` — `skippedEntries` declared but unused
- `src/hooks/useCanvassingWizard.ts:91` — `isAllHandled` declared but unused
- `src/hooks/useCanvassingWizard.ts:100` — `voterId` declared but unused
- `src/hooks/useConnectivityStatus.test.ts:6` — `originalOnLine` declared but unused
- `src/routes/field/$campaignId/canvassing.tsx:170` — `response` declared but unused

**Cat 3 — Wrong argument count (1 error, TS2554):**
- `src/hooks/useSyncEngine.ts:167` — Expected 1 argument, got 0

**Cat 4 — Test type mismatch (2 errors, TS2322):**
- `src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx:139` — `phone_attempts` allows undefined but type expects `Record | null`
- `src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx:82` — same issue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix TanStack Router `to` prop type errors and unused variables</name>
  <files>
    web/src/components/field/AssignmentCard.tsx
    web/src/components/field/CompletionSummary.tsx
    web/src/components/field/FieldHeader.tsx
    web/src/routes/field/$campaignId/canvassing.tsx
    web/src/routes/field/$campaignId/phone-banking.tsx
    web/src/hooks/useCallingSession.ts
    web/src/hooks/useCanvassingWizard.ts
    web/src/hooks/useConnectivityStatus.test.ts
  </files>
  <action>
**Router `to` prop fixes (7 errors):**

For each Link/navigate `to` prop that uses a template literal like `/field/${campaignId}`:
- Change to use the TanStack Router typed route pattern with `to` as the static route string and `params` object. For example:
  - `to={'/field/$campaignId'}` with `params={{ campaignId }}` instead of `to={'/field/${campaignId}'}`
  - `to={'/field/$campaignId/canvassing'}` with `params={{ campaignId }}` instead of template literal
- If the component already receives campaignId as a prop or from useParams, use that value in the params object.
- Check each file for the exact pattern and fix accordingly.

Specific files and lines:
1. `AssignmentCard.tsx:30` — Link `to` for canvassing/phone-banking path
2. `CompletionSummary.tsx:39` — Link `to` for field campaign path
3. `FieldHeader.tsx:50` — Link `to` for field campaign path
4. `canvassing.tsx:265` — navigate/Link `to` for field campaign path
5. `phone-banking.tsx:176,217` — navigate/Link `to` for field campaign path (2 occurrences)

**Unused variable fixes (7 errors across 6 files):**

1. `AssignmentCard.tsx:16` — Remove `id` from destructuring (use `_id` prefix or remove entirely)
2. `useCallingSession.ts:7` — Remove `useClaimEntry` from import
3. `useCallingSession.ts:66` — Remove or prefix `skippedEntries` declaration. If it's a destructured value from a hook, use `_skippedEntries` or omit.
4. `useCanvassingWizard.ts:91` — Remove `isAllHandled` variable declaration
5. `useCanvassingWizard.ts:100` — Remove `voterId` from destructuring or prefix with underscore
6. `useConnectivityStatus.test.ts:6` — Remove `originalOnLine` declaration
7. `canvassing.tsx:170` — Remove `response` variable (assign to void or remove if the return value is unused, keep the function call)

For each unused variable, check context first — if the variable feeds into subsequent logic that was commented out or removed, just remove it. If it's a destructured property from an object/hook, use underscore prefix `_varName` or restructure to omit it.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api/web && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "AssignmentCard|CompletionSummary|FieldHeader|useCallingSession|useCanvassingWizard|useConnectivityStatus|canvassing\.tsx|phone-banking\.tsx" | grep "error TS"; echo "EXIT: $?"</automated>
  </verify>
  <done>All 14 errors (7 router type + 7 unused variable) in these files are resolved. No new errors introduced.</done>
</task>

<task type="auto">
  <name>Task 2: Fix useSyncEngine argument error and test type mismatches</name>
  <files>
    web/src/hooks/useSyncEngine.ts
    web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx
    web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx
  </files>
  <action>
**useSyncEngine.ts — wrong argument count (1 error):**

At line 167, a function call expects 1 argument but receives 0. Read the function being called to determine what argument is expected, then provide it. This is likely a mutation function or API call that needs a parameter (possibly a queue item, sync payload, or config object). Check the function signature and pass the correct argument.

**Test type mismatches — phone_attempts (2 errors):**

In both test files, the mock `CallListEntry` objects have `phone_attempts` typed as `Record<string, {result: string; at: string}> | null | undefined` but the `CallListEntry` type only accepts `Record<...> | null` (no undefined).

Fix: In the mock data objects, either:
- Remove the optional `?` from the `phone_attempts` property and set it to `null` explicitly, OR
- If `phone_attempts` is currently `undefined` or uses `?:`, change to `: null`

Check the CallListEntry type definition first to confirm the expected type, then update both test files to match.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api/web && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "useSyncEngine|callListId\.test|call\.test" | grep "error TS"; echo "EXIT: $?"</automated>
  </verify>
  <done>All 3 remaining errors (1 argument count + 2 test type mismatch) are resolved. No new errors introduced.</done>
</task>

<task type="auto">
  <name>Task 3: Final verification — zero TypeScript errors</name>
  <files></files>
  <action>
Run the full TypeScript check to confirm all 16 errors are resolved and no new errors were introduced.

```bash
cd /home/kwhatcher/projects/run-api/web && npx tsc -p tsconfig.app.json --noEmit
```

Expected: exit code 0, no output.

If any errors remain, fix them before completing. Also run the node tsconfig:

```bash
cd /home/kwhatcher/projects/run-api/web && npx tsc -p tsconfig.node.json --noEmit
```

And the root composite check:

```bash
cd /home/kwhatcher/projects/run-api/web && npx tsc --noEmit
```

All three must pass cleanly.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api/web && npx tsc -p tsconfig.app.json --noEmit 2>&1; echo "EXIT: $?"</automated>
  </verify>
  <done>`npx tsc -p tsconfig.app.json --noEmit` exits with code 0 and produces zero error output.</done>
</task>

</tasks>

<verification>
`cd web && npx tsc -p tsconfig.app.json --noEmit` produces zero errors and exits with code 0.
</verification>

<success_criteria>
All 16 pre-existing TypeScript build errors are resolved. No new errors introduced. The `tsc --noEmit` check passes cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/260317-uvi-fix-16-pre-existing-typescript-build-err/260317-uvi-SUMMARY.md`
</output>
