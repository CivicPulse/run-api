---
phase: quick-260317-wpb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/hooks/useCanvassing.test.ts
autonomous: true
requirements: [FIX-BUILD]
must_haves:
  truths:
    - "Docker build completes without TypeScript errors"
    - "GH Actions build step passes"
    - "Test file still functions correctly after import change"
  artifacts:
    - path: "web/src/hooks/useCanvassing.test.ts"
      provides: "Canvassing hook tests without unused import"
  key_links: []
---

<objective>
Fix failing GitHub Actions build by removing unused `type Mock` import from vitest in `useCanvassing.test.ts`.

Purpose: The Docker build fails at `RUN npm run build` because `tsc -b` reports TS6133 for the unused `Mock` type import. This is a one-line fix.
Output: Clean TypeScript compilation, passing CI build.
</objective>

<execution_context>
@/home/kwhatcher/.claude/get-shit-done/workflows/execute-plan.md
@/home/kwhatcher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/hooks/useCanvassing.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove unused Mock type import and verify build</name>
  <files>web/src/hooks/useCanvassing.test.ts</files>
  <action>
In `web/src/hooks/useCanvassing.test.ts` line 1, change:
```typescript
import { describe, test, expect, beforeEach, vi, type Mock } from "vitest"
```
to:
```typescript
import { describe, test, expect, beforeEach, vi } from "vitest"
```

Remove `, type Mock` from the import statement. Do NOT change anything else in the file.

After the edit, verify:
1. Run `cd web && npx tsc -b --noEmit` to confirm no TypeScript errors remain.
2. Run `cd web && npx vitest run src/hooks/useCanvassing.test.ts` to confirm tests still pass.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api/web && npx tsc -b --noEmit && npx vitest run src/hooks/useCanvassing.test.ts</automated>
  </verify>
  <done>TypeScript compilation succeeds with zero errors. All useCanvassing tests pass. The `type Mock` import is removed.</done>
</task>

</tasks>

<verification>
- `cd web && npx tsc -b --noEmit` exits 0
- `cd web && npx vitest run src/hooks/useCanvassing.test.ts` exits 0
</verification>

<success_criteria>
- No TS6133 error for unused Mock import
- TypeScript build completes cleanly
- Existing tests remain green
</success_criteria>

<output>
After completion, create `.planning/quick/260317-wpb-address-the-failing-build-step-in-gh-act/260317-wpb-SUMMARY.md`
</output>
