---
phase: quick
plan: 260317-ugq
type: execute
wave: 1
depends_on: []
files_modified: ["(determined by merge)"]
autonomous: true
must_haves:
  truths:
    - "Local main branch is up-to-date with origin/main"
    - "No merge conflicts remain"
    - "TypeScript compiles without errors"
    - "Unstaged local changes are preserved after merge"
  artifacts: []
  key_links: []
---

<objective>
Merge upstream origin/main into local main branch and resolve any resulting issues (merge conflicts, type errors, lint failures).

Purpose: Bring local branch current with remote while preserving unstaged local work.
Output: Clean, up-to-date main branch with all checks passing.
</objective>

<execution_context>
@/home/kwhatcher/.claude/get-shit-done/workflows/execute-plan.md
@/home/kwhatcher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Stash local changes, fetch and merge origin/main</name>
  <files>(determined by merge)</files>
  <action>
1. Stash all unstaged working tree changes (including untracked files) with a descriptive message:
   `git stash push -u -m "pre-merge-stash: local working changes"`
2. Fetch latest from origin:
   `git fetch origin`
3. Merge origin/main into local main:
   `git merge origin/main`
4. If merge conflicts occur, resolve them:
   - For each conflicted file, read the file, understand both sides, pick the correct resolution
   - Prefer upstream changes for new features; preserve local customizations where they don't conflict with upstream intent
   - Stage resolved files with `git add`
   - Complete merge with `git merge --continue`
5. Pop the stash to restore local working changes:
   `git stash pop`
   - If stash pop has conflicts, resolve those too (local changes take priority since they are intentional uncommitted work)
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api && git log --oneline -5 && echo "---" && git status --short</automated>
  </verify>
  <done>Local main includes all commits from origin/main. Stashed changes are restored. No unresolved merge conflicts.</done>
</task>

<task type="auto">
  <name>Task 2: Fix any downstream issues from the merge</name>
  <files>(determined by errors found)</files>
  <action>
1. Run TypeScript type checking on the web frontend:
   `cd /home/kwhatcher/projects/run-api/web && npx tsc --noEmit`
   - Fix any type errors introduced by the merge
2. Run Python type checking / lint on the backend:
   `cd /home/kwhatcher/projects/run-api && uv run ruff check app/`
   - Fix any lint errors introduced by the merge
3. Run a quick build check on the frontend:
   `cd /home/kwhatcher/projects/run-api/web && npm run build`
   - Fix any build failures
4. If no errors are found in any of the above, this task is complete with no changes needed.

Note: Only fix issues INTRODUCED by the merge. Pre-existing issues visible in the git diff before merge are not in scope.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/run-api/web && npx tsc --noEmit 2>&1 | tail -5 && echo "---TSC DONE---" && npm run build 2>&1 | tail -5 && echo "---BUILD DONE---" && cd /home/kwhatcher/projects/run-api && uv run ruff check app/ 2>&1 | tail -5 && echo "---RUFF DONE---"</automated>
  </verify>
  <done>TypeScript compiles without new errors. Ruff passes without new errors. Frontend builds successfully. All issues introduced by the merge are resolved.</done>
</task>

</tasks>

<verification>
- `git log --oneline origin/main..main` shows no commits (local is at or ahead of origin)
- `git log --oneline main..origin/main` shows no commits (origin is not ahead)
- TypeScript and Ruff checks pass
- Local unstaged changes from before the merge are intact
</verification>

<success_criteria>
- Local main is merged with origin/main, no conflicts remain
- Type checking and linting pass (no new errors from merge)
- Frontend builds successfully
- Previously unstaged local changes are preserved in working tree
</success_criteria>

<output>
After completion, create `.planning/quick/260317-ugq-merge-upstream-main-and-resolve-any-resu/260317-ugq-SUMMARY.md`
</output>
