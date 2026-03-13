# Phase 19: Verification & Validation Gap Closure - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Close all verification documentation gaps from the v1.2 milestone audit. Create VERIFICATION.md for Phases 13 and 15, implement Phase 15 Nyquist wave 0 test stubs, and re-audit to confirm 60/60 requirements satisfied. No new features — this is documentation + test completion.

</domain>

<decisions>
## Implementation Decisions

### Verification evidence approach
- Code inspection for hook/API wiring evidence (file paths, exports, route registrations)
- Playwright e2e tests for visual-only workflows — key workflows only, not every requirement
- One Playwright spec file per phase: `phase-13-verification.spec.ts` and `phase-15-verification.spec.ts`
- Follow Phase 18 VERIFICATION.md format exactly: observable truths table + human_verification items
- Playwright replaces manual visual checks (user preference)

### Phase 13 verification specifics (11 VOTR requirements)
- **Code inspection only** for VOTR-01, 02, 03, 04, 05, 06, 09 — verify hook exports, component rendering, route existence
- **Code inspection + Playwright** for VOTR-07 (static voter lists), VOTR-08 (dynamic voter lists with filter criteria), VOTR-10 (advanced search with composable filters), VOTR-11 (interaction notes on History tab)
- The 6 fully unsatisfied (VOTR-03, 07, 08, 09, 10, 11) get the same code inspection rigor as the 5 partial ones — the "unsatisfied" label is a documentation gap, not a code gap

### Phase 15 verification specifics (8 CALL requirements)
- Code inspection for hook wiring evidence
- Playwright for 2-3 key visual flows: call list creation + detail view, DNC list with search filtering, DNC import dialog

### Nyquist test implementation (13 it.todo stubs)
- **9 hook tests** (`useCallLists.test.ts` × 5, `useDNC.test.ts` × 4): Mock ky/fetch, verify correct URL, method, and payload. Confirm query key invalidation on mutations. Fast, isolated.
- **4 component tests** (`dnc/index.test.tsx`): Render DNCListPage with mocked useQuery returning test entries. Type in search input, assert filtered rows. Tests actual search stripping logic.
- Match existing hook test patterns in the project (mock API + verify calls)

### Re-audit validation checkpoint
- Targeted gap check only — verify the 19 previously-unverified requirements now have evidence and Phase 15 Nyquist is wave_0_complete
- Do NOT re-check the 41 already-satisfied requirements
- Update existing `v1.2-MILESTONE-AUDIT.md` in place — move 19 from partial/unsatisfied to satisfied, update frontmatter to 60/60, note re-audit date

### Claude's Discretion
- Which specific observable truths to list per requirement (granularity of evidence)
- Playwright test flow design (exact navigation steps, assertions)
- Mock data shapes for Nyquist tests
- Human_verification items selection (which visual checks to include in VERIFICATION.md frontmatter)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 18 `18-VERIFICATION.md`: Template for observable truths table format + human_verification frontmatter structure
- Existing Playwright config and test infrastructure in `web/e2e/`
- Existing Vitest hook test patterns (mock ky, verify API calls) across Phases 16-18

### Established Patterns
- VERIFICATION.md: YAML frontmatter with phase, verified date, status, score, gaps, human_verification; then observable truths table with #/Truth/Status/Evidence columns
- Hook tests: `vi.mock` on ky, `renderHook` with QueryClientProvider, assert mock calls
- Component tests: `render` with mocked hooks via `vi.mock`, user events via `@testing-library/user-event`

### Integration Points
- `useCallLists.test.ts` (5 stubs): Tests for hooks in `web/src/hooks/useCallLists.ts`
- `useDNC.test.ts` (4 stubs): Tests for hooks in `web/src/hooks/useDNC.ts`
- `dnc/index.test.tsx` (4 stubs): Tests for component in `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx`
- VERIFICATION.md files go in: `.planning/phases/13-voter-management-completion/13-VERIFICATION.md` and `.planning/phases/15-call-lists-dnc-management/15-VERIFICATION.md`
- Audit update: `.planning/v1.2-MILESTONE-AUDIT.md`

</code_context>

<specifics>
## Specific Ideas

- Playwright specs named `phase-13-verification.spec.ts` and `phase-15-verification.spec.ts` — dedicated to verification, not feature testing
- Phase 13 Playwright covers 4 visual workflows: static list management, dynamic list with filter criteria, advanced search panel, and interaction notes on voter detail
- Phase 15 Playwright covers 2-3 visual workflows: call list creation + detail, DNC search filtering, DNC import
- DNC component tests should exercise the digit-stripping search logic specifically (the `it.todo` descriptions reference this)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-verification-validation-gaps*
*Context gathered: 2026-03-12*
