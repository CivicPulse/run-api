# Phase 55: Documentation & Dead Code Cleanup - Research

**Researched:** 2026-03-29
**Domain:** Planning artifact documentation, dead code removal
**Confidence:** HIGH

## Summary

This phase addresses 6 tech debt items identified by the v1.6 milestone audit (`.planning/v1.6-MILESTONE-AUDIT.md`). All items are mechanical fixes: 4 are SUMMARY frontmatter corrections (adding missing `requirements-completed` entries), 1 is dead code removal (unused `StorageService.list_objects` method), and 1 is a VERIFICATION.md body text cleanup (stale `gaps_found` language that contradicts the `passed` frontmatter status).

No new features, no behavioral changes, no tests required. All target files, line numbers, and exact changes are specified by the audit. The only verification needed is a grep to confirm `list_objects` has zero callers before removal (confirmed by this research -- zero callers in `app/`, `tests/`, and `scripts/`).

**Primary recommendation:** Execute all 6 fixes in a single plan since they are independent, small, and require no testing infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: All 6 items are audit-defined with exact files and line numbers -- no ambiguity, no user decisions needed
- D-02: Phase 54 already fixed INT-01 and INT-02 (the integration/runtime issues) -- this phase handles only the remaining documentation and dead code debt

### Claude's Discretion
- Execution order of the 6 items (can be done in any order or batched into a single plan)
- Whether to verify `list_objects` has zero callers before removal (recommended: grep to confirm)
- Exact wording for VERIFICATION.md body cleanup (just make it consistent with `passed` status)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Python linting: `uv run ruff check .` / `uv run ruff format .` -- must lint after modifying storage.py
- Ruff rules: E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- Line length: 88 chars
- Git: Conventional Commits, commit on branches, never push unless requested
- Package manager: `uv` only

## Canonical References

The planner and executor MUST read these files:

| Reference | Path | Purpose |
|-----------|------|---------|
| Milestone Audit | `.planning/v1.6-MILESTONE-AUDIT.md` | Defines all 6 tech debt items |
| Phase 55 Context | `.planning/phases/55-documentation-dead-code-cleanup/55-CONTEXT.md` | User decisions and target file list |

## Tech Debt Item Inventory

### Item 1: Phase 49 SUMMARY frontmatter -- missing BGND-01, BGND-02, MEMD-02

**File:** `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-01-SUMMARY.md`
**Current (line 42):** `requirements-completed: [BGND-02]`
**Required:** `requirements-completed: [BGND-01, BGND-02, MEMD-02]`

**Context:** The audit found that BGND-01, BGND-02, and MEMD-02 are satisfied (verified in 49-VERIFICATION.md and checked in REQUIREMENTS.md) but not fully tracked in SUMMARY frontmatter. Individual plan SUMMARYs have partial coverage:
- 49-01: `[BGND-02]` -- created Procrastinate infra
- 49-02: `[BGND-01, BGND-02]` -- wired API integration
- 49-03: `[MEMD-02]` -- worker deployment

The audit flags 49-01 specifically as the plan needing updates. The CONTEXT.md instructs adding BGND-01, BGND-02, MEMD-02 to 49-01-SUMMARY.md. Since 49-02 and 49-03 already have correct entries, only 49-01 needs updating.

**Confidence:** HIGH -- exact file and line known, change is additive to frontmatter only.

### Item 2: Phase 50 SUMMARY frontmatter -- missing RESL-03

**File:** `.planning/phases/50-per-batch-commits-crash-resilience/50-01-SUMMARY.md`
**Current (line 42):** `requirements-completed: [RESL-01, RESL-02, RESL-04, RESL-05]`
**Required:** `requirements-completed: [RESL-01, RESL-02, RESL-03, RESL-04, RESL-05]`

**Context:** RESL-03 (crash resume from last committed batch) is satisfied and verified but missing from 50-01-SUMMARY. The `last_committed_row` column added in 50-01 is the foundation for RESL-03. The actual resume logic was implemented in 50-02 which already has `[RESL-01, RESL-02, RESL-03, RESL-04, RESL-05]`.

**Confidence:** HIGH -- exact file and line known, change is additive to frontmatter only.

### Item 3: StorageService.list_objects dead code removal

**File:** `app/services/storage.py`
**Lines:** 150-170 (the `async def list_objects` method)
**Action:** Delete the entire method

**Verification of zero callers (completed during research):**
- `app/` directory: Only the definition itself at `storage.py:150` -- no calls
- `tests/` directory: Zero matches
- `scripts/` directory: Zero matches
- `web/` directory: Not applicable (Python service)

The method was created in Phase 50 Plan 01 as part of a per-batch error file management design, but the actual implementation in 50-02 used a different approach (tracking batch error keys in a list during processing rather than listing them from S3 afterward). `delete_objects` IS used; `list_objects` is not.

**Post-removal:** Run `uv run ruff check app/services/storage.py` and `uv run ruff format app/services/storage.py` to ensure clean linting.

**Confidence:** HIGH -- grep confirms zero callers, method is self-contained with no side effects on removal.

### Item 4: Phase 52 VERIFICATION.md body text cleanup

**File:** `.planning/phases/52-l2-auto-mapping-completion/52-VERIFICATION.md`

**Problem:** Frontmatter was updated to `status: passed` and `score: 3/3 success criteria verified (SC3 aligned with D-06)` after D-06 requirements alignment, but the body text was never updated to match. The body still contains stale pre-alignment language.

**Stale text locations that need updating:**

| Line | Current Text | Should Be |
|------|-------------|-----------|
| 30 | `**Status:** gaps_found` | `**Status:** passed` |
| 33 | `**Score:** 2/3 success criteria verified` | `**Score:** 3/3 success criteria verified (SC3 aligned with D-06)` |
| 41 | SC3 row: status `FAILED`, reason says "D-06 intentionally changed..." | Status should be `VERIFIED (D-06 aligned)`, reason updated to reflect the requirement was realigned |
| 124 | Behavioral spot-check: "Wizard skips to preview" shows `FAIL` | Should reflect that D-06 changed the success criterion, not that it failed |
| 131-134 | L2MP-03 shows `BLOCKED` | Should show `SATISFIED` with note that D-06 realigned the requirement |
| 140-144 | Anti-patterns section flags step 2 navigation as "Blocker" | Remove or reclassify -- no longer a blocker after D-06 alignment |
| 166-176 | Gaps Summary says "1 gap blocks SC3 and L2MP-03" | Should state no gaps remain after D-06 alignment |

**Confidence:** HIGH -- all stale text locations identified by line number, the frontmatter already has the correct target state.

### Items 5-6: Phase 49/50 SUMMARY secondary checks

**Files:**
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-02-SUMMARY.md`
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-03-SUMMARY.md`
- `.planning/phases/50-per-batch-commits-crash-resilience/50-02-SUMMARY.md`

**Current state (verified during research):**
- 49-02: `requirements-completed: [BGND-01, BGND-02]` -- correct, no changes needed
- 49-03: `requirements-completed: [MEMD-02]` -- correct, no changes needed
- 50-02: `requirements-completed: [RESL-01, RESL-02, RESL-03, RESL-04, RESL-05]` -- correct, no changes needed

**Action:** No changes required for these files. The CONTEXT.md flagged them as "check if needs updating" and the answer is no.

**Confidence:** HIGH -- verified by reading each file's frontmatter.

## Architecture Patterns

### File Modification Pattern
All changes follow the same pattern: read file, make targeted edit, write file. No complex refactoring.

```
For each target file:
  1. Read current content
  2. Identify exact lines to change
  3. Apply edit (frontmatter update, method deletion, or body text rewrite)
  4. Write updated content
  5. For .py files only: run ruff check + ruff format
```

### SUMMARY Frontmatter Format
```yaml
requirements-completed: [REQ-01, REQ-02, REQ-03]
```
Entries are comma-separated requirement IDs inside square brackets. Maintain alphabetical order within the list.

### VERIFICATION.md Body Consistency Rule
The body text `**Status:**` and `**Score:**` fields MUST match the frontmatter `status:` and `score:` fields exactly. Any table rows showing individual success criteria must also be consistent with the overall status.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom parser | Direct text editing | Frontmatter is simple key-value, no parser needed |
| Dead code detection | Manual trace | `grep -r` confirmation | Already done in research, zero callers confirmed |

## Common Pitfalls

### Pitfall 1: Editing Wrong SUMMARY Files
**What goes wrong:** Adding requirements to 49-02 or 49-03 when the audit targets 49-01, or vice versa
**Why it happens:** Multiple plan SUMMARYs per phase with overlapping requirements
**How to avoid:** Follow the CONTEXT.md file list exactly -- only 49-01-SUMMARY.md and 50-01-SUMMARY.md need edits
**Warning signs:** Touching files not listed in the CONTEXT.md canonical refs

### Pitfall 2: Incomplete VERIFICATION.md Cleanup
**What goes wrong:** Updating `**Status:**` line but missing stale language deeper in the document (Anti-Patterns, Gaps Summary, spot-checks)
**Why it happens:** The stale text is spread across 7+ locations in the 180-line file
**How to avoid:** Use the line-by-line inventory from this research (Item 4 table above) as a checklist
**Warning signs:** Any remaining occurrence of "gaps_found", "FAILED", "BLOCKED", or "1 gap blocks" in the body text after edits

### Pitfall 3: Breaking storage.py Method Ordering
**What goes wrong:** Deleting `list_objects` but leaving a blank gap or disrupting the class structure
**Why it happens:** Method is between `delete_object` (line 142-148) and `delete_objects` (line 172-190)
**How to avoid:** Delete lines 150-170 cleanly, verify no orphaned blank lines beyond the standard single blank between methods
**Warning signs:** Ruff formatting errors after edit

### Pitfall 4: Forgetting to Lint After Python File Edit
**What goes wrong:** Committing storage.py without running ruff, violating CLAUDE.md requirement
**Why it happens:** The change seems trivial (just deleting a method)
**How to avoid:** Always run `uv run ruff check app/services/storage.py` and `uv run ruff format app/services/storage.py` after the edit
**Warning signs:** CI/pre-commit failures

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (via uv run pytest) |
| Config file | pyproject.toml |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map

This phase has no requirement IDs (null). All changes are documentation fixes or dead code removal. The only runtime code change (removing `list_objects`) has zero callers, so no tests need updating.

| Change | Test Impact | Automated Command | Action |
|--------|-------------|-------------------|--------|
| Remove `list_objects` from storage.py | No tests call this method | `uv run pytest tests/ -x -q` | Run full suite to confirm zero regressions |
| SUMMARY frontmatter edits | No test impact (planning docs) | N/A | None |
| VERIFICATION.md body edits | No test impact (planning docs) | N/A | None |

### Sampling Rate
- **Per task commit:** `uv run ruff check app/services/storage.py` (for the code change only)
- **Per wave merge:** `uv run pytest tests/unit/ -x -q`
- **Phase gate:** `uv run pytest` full suite green + `uv run ruff check .`

### Wave 0 Gaps
None -- no new tests needed. Existing test infrastructure covers regression checking.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). All changes are file edits to planning documents and one Python source file. No services, tools, or runtimes beyond the existing project setup are needed.

## Sources

### Primary (HIGH confidence)
- `.planning/v1.6-MILESTONE-AUDIT.md` -- Authoritative source defining all 6 tech debt items
- `.planning/phases/55-documentation-dead-code-cleanup/55-CONTEXT.md` -- User decisions and target files
- `app/services/storage.py` -- Direct inspection of dead code method (lines 150-170)
- Phase 49 SUMMARY files (49-01, 49-02, 49-03) -- Verified current `requirements-completed` values
- Phase 50 SUMMARY files (50-01, 50-02) -- Verified current `requirements-completed` values
- `.planning/phases/52-l2-auto-mapping-completion/52-VERIFICATION.md` -- Verified stale body text locations

### Verification
- `grep -r "list_objects"` across `app/`, `tests/`, `scripts/` -- Confirmed zero callers (HIGH confidence)

## Metadata

**Confidence breakdown:**
- Tech debt items: HIGH -- all items defined with exact files and line numbers by the audit
- Dead code verification: HIGH -- grep confirms zero callers across entire codebase
- VERIFICATION.md stale text: HIGH -- all stale locations identified by line number against known-correct frontmatter

**Research date:** 2026-03-29
**Valid until:** Indefinite (documentation fixes, not technology-dependent)
