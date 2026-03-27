# Domain Pitfalls: v1.6 Production Ready Polish

**Domain:** Multi-tenant political campaign platform -- adding zero-touch import, RLS audit, navigation consolidation, and in-app documentation
**Researched:** 2026-03-27
**Overall confidence:** HIGH (codebase analysis of all 4 feature areas + production RLS testing patterns + web search verification)

---

## Critical Pitfalls

Mistakes that cause data leaks, broken imports, or major regressions.

### Pitfall 1: Fuzzy Alias Expansion Creates Cross-Field Collisions at 75% Threshold

**What goes wrong:** Adding new aliases to `CANONICAL_FIELDS` in `import_service.py` causes existing aliases to fuzzy-match to the wrong canonical field. The 75% RapidFuzz `fuzz.ratio` threshold is aggressive enough that short, similar strings collide. For example, adding an alias `"voters_cellphonefull"` for `__cell_phone` could cause a CSV column like `"voters_cellphoneconfidence"` to fuzzy-match to `__cell_phone` instead of `cell_phone_confidence` (score 77% vs 73%).

**Why it happens:** The current system uses `process.extractOne` against a flat `_ALIAS_LIST` of all aliases across all fields. Aliases are compared purely by string similarity with no category weighting. When the alias list grows, the probability of a near-threshold collision between aliases in different canonical fields increases combinatorially. The `used_fields` deduplication only prevents the *second* mapping to the same field -- it does not detect that the first mapping was wrong.

**Consequences:** Silent data corruption. A voter's cell phone confidence score gets discarded (mapped to phone instead), or a mailing zip4 column maps to registration zip4. The user sees "auto-mapped" green checkmarks in the UI and trusts the system. The error surfaces weeks later when a phone banker calls the wrong number or a mailing goes to the wrong address.

**Prevention:**
1. Before adding any alias, run the full alias list through `process.extractOne` against all existing aliases and log any pair scoring above 70% across different canonical fields.
2. Add a unit test that exhaustively checks every alias against every other alias and fails if any cross-field pair scores above the threshold.
3. Prefer exact-match-first: check `normalized in _ALIAS_TO_FIELD` before falling back to fuzzy matching. The current code does fuzzy-first.
4. Consider raising the threshold to 80% or using `fuzz.WRatio` (weighted ratio) instead of `fuzz.ratio` -- WRatio handles prefix/suffix variations better for column headers like `"Voters_FirstName"` vs `"voters_firstname"`.

**Detection:** Import jobs where `skipped_rows` is zero but the mapping silently assigned wrong fields. Compare `suggested_mapping` stored on the `ImportJob` against expected mappings for known L2 file formats.

**Phase:** Must be addressed in the import alias expansion phase, BEFORE adding new aliases.

### Pitfall 2: RLS Audit Tests Pass With Superuser, Fail to Detect Real Gaps

**What goes wrong:** RLS integration tests connect as `superuser` or table owner, which bypasses RLS entirely. Tests appear green but prove nothing about isolation. The existing `test_rls.py` correctly uses `app_user`, but new audit tests might accidentally inherit a superuser session from the test fixture chain.

**Why it happens:** PostgreSQL superusers and table owners bypass RLS by default, regardless of policies. The `conftest.py` fixture chain includes both `superuser_session` (for test data setup) and `app_user_session` (for RLS verification). A copy-paste error using the wrong fixture makes tests pass while testing nothing. Additionally, the `BYPASSRLS` attribute on a role is not visible unless explicitly checked.

**Consequences:** Audit declares "all 33 tables isolated" while actual gaps exist. Data from Campaign A leaks to Campaign B in production. For a political campaign platform, this means one campaign's voter data, canvassing notes, and strategic targeting could leak to an opponent.

**Prevention:**
1. Every RLS test MUST connect as `app_user`, never as the migration user or postgres superuser.
2. Add a test-level assertion that verifies the current session role: `SELECT current_user` must return `app_user`, not `postgres` or the migration user.
3. Verify `app_user` does NOT have `BYPASSRLS`: `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'` must return `false`.
4. Test the negative case explicitly: set context to Campaign A, attempt to SELECT from a table with Campaign B data, assert zero rows returned.

**Detection:** Run `EXPLAIN (ANALYZE, VERBOSE) SELECT * FROM voters` as `app_user` -- the plan should show the RLS filter. If no filter appears, RLS is being bypassed.

**Phase:** Must be the FIRST test written in the RLS audit phase, as a meta-test that validates the test infrastructure itself.

### Pitfall 3: Organizations and Organization Members Tables Lack RLS Policies

**What goes wrong:** The `organizations` table (migration 009) and `organization_members` table (migration 015) were added WITHOUT RLS policies. Every other tenant-scoped table has RLS, but these two do not. If any endpoint queries these tables through the `app_user` connection without explicit WHERE clauses, a user could see all organizations or all org members across the platform.

**Why it happens:** These tables were added in v1.5 Phase 41 (org data model) after the original RLS audit (Phase 39) had already completed. The RLS audit comment in migration 001 says "33 policies across 6 migrations verified" but was written before migrations 009 and 015 existed. The org tables use a different scoping model (org-level, not campaign-level), and the RLS context variable `app.current_campaign_id` does not directly apply to org-scoped data.

**Consequences:** In the current architecture this is mitigated because org endpoints use explicit WHERE clauses and the API layer filters by the authenticated user's org. However, any new query path, join, or admin endpoint that touches these tables without filtering could leak org membership data across organizations. The audit must decide whether to add org-level RLS (requiring a new `app.current_org_id` context variable) or to document the explicit mitigation and add integration tests.

**Prevention:**
1. The RLS audit phase must inventory ALL tables, not just the 33 documented in migration 001.
2. Either add org-level RLS with a new context variable (`app.current_org_id`), or add negative integration tests proving that the API layer filters correctly.
3. Note the `session.py` comment on line 37: `# Phase 41: add set_config('app.current_org_id', ...) here` -- this was planned but never implemented.

**Detection:** Query `SELECT tablename FROM pg_tables WHERE schemaname = 'public' EXCEPT SELECT tablename FROM (SELECT DISTINCT schemaname, tablename FROM pg_policies) p WHERE schemaname = 'public'` to find tables without policies.

**Phase:** RLS audit phase -- this is the highest-priority finding the audit should address.

### Pitfall 4: Import Task Sets RLS Context Twice, Creating Transaction Scope Confusion

**What goes wrong:** The background task in `import_task.py` (line 42) calls `set_campaign_context(session, str(job.campaign_id))` with `true` (transaction-scoped), then `process_import_file` in `import_service.py` (line 857) calls it AGAIN. If `process_import_file` is called after a `session.flush()` that auto-commits (depending on session configuration), the second `set_campaign_context` call operates in a new implicit transaction while the first call's context has been cleared by the commit.

**Why it happens:** The import pipeline was built in phases. The task wrapper added its own RLS setup as "belt and suspenders," and the service method has its own setup because it was originally designed to run independently. The double-call is harmless when everything stays in one transaction, but becomes dangerous if any code path introduces an intermediate commit.

**Consequences:** Rows processed after the implicit commit boundary would fail RLS checks, causing the upsert to silently insert into the wrong campaign or (more likely) fail with a "permission denied" error that surfaces as a generic "Import processing failed unexpectedly" error message.

**Prevention:**
1. Remove the redundant `set_campaign_context` call in `process_import_file` -- the task is responsible for session lifecycle.
2. Or: make `process_import_file` accept a flag indicating whether RLS context is already set.
3. Add an assertion at the start of `process_csv_batch`: verify `current_setting('app.current_campaign_id', true)` matches the expected campaign_id.

**Detection:** Import jobs that fail with status `FAILED` and error message "Import processing failed unexpectedly" when importing large files (> 1000 rows, triggering batch boundaries).

**Phase:** Import improvement phase -- fix before adding new alias logic.

---

## Moderate Pitfalls

### Pitfall 5: Navigation Consolidation Breaks 48+ E2E Test Selectors

**What goes wrong:** Removing the inline tab bar from `$campaignId.tsx` and adding Surveys to the sidebar changes the DOM structure that 48+ Playwright E2E specs rely on. Tests that use `page.locator("nav")`, sidebar text content assertions, or `getByRole("link", { name: "Canvassing" })` in a tab-bar context will fail or pass incorrectly.

**Why it happens:** The E2E tests were written against the current dual-navigation structure (sidebar + inline tabs). Some tests explicitly check for sidebar items (e.g., `shift-verify.spec.ts` line 18, `volunteer-verify.spec.ts` line 18), while others navigate via the inline tab bar. The connected journey spec (`connected-journey.spec.ts` line 76) says "Navigate to canvassing via sidebar link" -- but the sidebar currently does NOT include Surveys, and the tab bar provides the primary section navigation within a campaign.

**Prevention:**
1. Before changing navigation, create a manifest of every E2E selector that references navigation elements (sidebar, tabs, nav links).
2. Update tests in the SAME commit as the navigation change -- never land a navigation change without corresponding test updates.
3. Use stable `data-testid` attributes on navigation items rather than relying on link text or structural selectors.
4. Run the full E2E suite locally before and after the change.

**Detection:** CI E2E test failures after the navigation change. But also check for tests that PASS incorrectly because they find a matching element in the sidebar that was previously in the tab bar.

**Phase:** Navigation consolidation phase -- budget 30-40% of the phase time for test updates.

### Pitfall 6: Removing Tab Bar Loses Keyboard Navigation Affordance

**What goes wrong:** The inline tab bar in `$campaignId.tsx` provides a visible, always-present navigation surface within a campaign. Users can Tab through section links without opening the sidebar. Removing it and consolidating into the sidebar (which defaults to `defaultOpen={false}`) means campaign section navigation requires: (1) focus the sidebar trigger, (2) activate it, (3) navigate within the sidebar, (4) select the section. This is a 4-step interaction replacing a 1-step Tab key press.

**Why it happens:** The design goal is to "remove duplicate inline tab bar" -- but the tab bar and sidebar serve different interaction patterns. The tab bar is glanceable and direct; the sidebar is a slide-over overlay. Removing one without compensating for the other degrades keyboard and screen reader UX.

**Consequences:** WCAG AA regression. The v1.5 accessibility audit (38-route axe-core scan, 5 screen reader flow tests) established compliance. Removing the primary in-page navigation surface without an equivalent replacement invalidates those test results. Keyboard-only users lose the ability to quickly switch between campaign sections.

**Prevention:**
1. Keep a visible in-page navigation element (could be a horizontal nav bar, breadcrumb with section links, or always-visible sidebar on desktop).
2. If the sidebar becomes the sole navigation, set `defaultOpen={true}` on desktop breakpoints.
3. Re-run the full axe-core scan after the change.
4. Add a specific E2E test: "user can navigate from Dashboard to Surveys using only keyboard, without opening sidebar."

**Detection:** Re-run `a11y-scan.spec.ts` and the 5 screen reader flow tests. Manual testing with keyboard-only navigation.

**Phase:** Navigation consolidation phase -- must be addressed in the design step before implementation.

### Pitfall 7: In-App Doc Pages Create Auth Routing Edge Cases

**What goes wrong:** If onboarding guide pages are added as public routes (accessible without login for sharing), they bypass the root layout's auth check in `__root.tsx` (line 244: `const isPublicRoute = PUBLIC_ROUTES.some(...)`) only if added to the `PUBLIC_ROUTES` array. If not added, unauthenticated users hit a loading spinner. If added but the layout isn't configured, authenticated users see the pages WITHOUT the sidebar shell.

**Why it happens:** The root layout has three rendering paths: public (no sidebar), field mode (no sidebar), and authenticated (sidebar). Adding a fourth category (public-but-also-authenticated-friendly documentation pages) requires choosing which path applies. The `PUBLIC_ROUTES` array is a simple prefix match that doesn't support conditional rendering.

**Consequences:** Either: (a) documentation pages are auth-gated, making them unshareable with prospective volunteers who don't have accounts yet, or (b) they're public but show a broken layout for logged-in users (no sidebar, no user menu), or (c) they work for both but require duplicating the layout logic.

**Prevention:**
1. Create a dedicated layout route for docs (e.g., `/docs/$slug`) that renders its own minimal layout (header only, no sidebar) regardless of auth state.
2. Use TanStack Router's `beforeLoad` to optionally detect auth state but not enforce it.
3. Add docs routes to a new `DOCS_ROUTES` array in `__root.tsx` with their own rendering path.
4. Test with both authenticated and unauthenticated access.

**Detection:** Navigate to a doc page while logged in -- if the sidebar is missing, the routing is wrong. Navigate while logged out -- if a loading spinner appears, the auth gate is blocking.

**Phase:** In-app documentation phase -- architectural decision needed before writing any content.

### Pitfall 8: L2 Voting History Column Format Variations Break Regex

**What goes wrong:** The current `_VOTING_HISTORY_RE` regex in `import_service.py` (line 414) only matches `General_YYYY` and `Primary_YYYY` patterns. L2 voter files from different states and different export configurations use alternate column naming conventions including:
- `Voters_VotingPerformanceEvenYearGeneral` / `Voters_VotingPerformanceEvenYearPrimary`
- `ElectionsVoted_GeneralElection_YYYY` / `ElectionsVoted_PrimaryElection_YYYY`
- `General_YYYY_MM` (with month) in some state exports
- `YYYY_General` / `YYYY_Primary` (year-first format)

**Why it happens:** The regex was written against a single L2 sample file. L2 uses a common data dictionary but state-specific data dictionaries add per-state column variations. The v1.3 milestone implemented voting history parsing against the one known format.

**Consequences:** Voting history data is silently dropped for files from states using alternate formats. The import "succeeds" but the `voting_history` array on the voter record is empty. Propensity filtering and voter targeting lose a critical data dimension. This is particularly insidious because the import shows no errors.

**Prevention:**
1. Expand the regex to handle multiple patterns, or better: make voting history column detection configurable per-import (not regex-only).
2. Add known L2 alternate patterns to the regex: `(General|Primary)_(\d{4})`, `Voters_VotingPerformance(EvenYear|OddYear)?(General|Primary)`, `ElectionsVoted_(General|Primary)Election_(\d{4})`.
3. Log a warning when a file has columns that look like voting history (contain "general", "primary", "election", "voted") but don't match the parsing regex.
4. Add a post-import validation: if the file has > 50 columns (typical for L2 with history) but zero voters have voting history, flag the import for review.

**Detection:** Import jobs where the file clearly contains voting history columns (visible in `detected_columns` on the `ImportJob`) but zero voters have `voting_history` populated.

**Phase:** Import alias expansion phase -- should be addressed alongside the alias work since both involve L2 column recognition.

---

## Minor Pitfalls

### Pitfall 9: Deep Links to Tab-Bar Routes Break After Navigation Consolidation

**What goes wrong:** Users who bookmarked or shared URLs like `/campaigns/abc/surveys` rely on the URL structure remaining stable. Navigation consolidation should change the navigation UI but must not change URL paths. However, if the consolidation involves restructuring route files (moving from inline tabs to sidebar-driven routes), TanStack Router's file-based routing could auto-generate different route trees.

**Prevention:** Navigation changes must be purely UI changes to `$campaignId.tsx` and `__root.tsx`. Do NOT rename, move, or delete any route file in `web/src/routes/campaigns/$campaignId/`. Verify all existing URLs still resolve by testing the complete route list.

**Phase:** Navigation consolidation phase.

### Pitfall 10: Markdown Documentation Content Goes Stale Without Review Process

**What goes wrong:** In-app documentation written as markdown files becomes outdated as the product evolves. A guide says "click the Canvassing tab" but the tab bar has been replaced by a sidebar. A screenshot shows an old UI. A workflow description references a feature that was reorganized.

**Prevention:**
1. Documentation pages should reference feature areas by function, not by specific UI element names or locations.
2. Add a `last_reviewed` date to each doc page's frontmatter.
3. Include a "Was this helpful?" feedback mechanism to surface stale content.
4. If using screenshots, prefer annotated diagrams over pixel-exact screenshots.

**Phase:** Documentation phase -- content strategy decision.

### Pitfall 11: FieldMappingTemplate RLS Policy Allows System Templates But Not INSERT

**What goes wrong:** The `field_mapping_templates` RLS policy (migration 002, line 513-515) uses `USING (campaign_id IS NULL OR campaign_id = ...)` which handles SELECT correctly for system templates. But if a user tries to CREATE a campaign-scoped template, the INSERT may fail because the policy is USING-only (no WITH CHECK clause), meaning the default restrictive policy applies to writes. This means users can read system templates but may not be able to save custom mapping templates.

**Prevention:** The audit should verify that `INSERT` works for campaign-scoped templates by testing as `app_user`. If it fails, add a `WITH CHECK` clause that allows INSERT when `campaign_id = current_setting(...)::uuid`.

**Phase:** RLS audit phase.

### Pitfall 12: Import Alias Additions Break Existing Saved Field Mappings

**What goes wrong:** Users who have previously imported files have `ImportJob` records with `field_mapping` and `suggested_mapping` stored as JSONB. If aliases change which canonical field a column maps to, re-importing the same file format produces different suggested mappings. The import history page may show mappings that no longer match the current alias configuration.

**Prevention:**
1. Alias expansion must be additive-only. Never remove or reassign existing aliases.
2. The stored `field_mapping` on completed `ImportJob` records is the user-confirmed mapping, not the suggestion. The suggestion may change, but confirmed mappings should not be invalidated.
3. Add a migration test that loads all distinct `suggested_mapping` values from existing `ImportJob` records and verifies they still produce the same results with the updated alias list.

**Phase:** Import alias expansion phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Import alias expansion | Cross-field fuzzy collisions (Pitfall 1) | Exhaustive cross-alias collision test; exact-match-first |
| Import alias expansion | Voting history format variations (Pitfall 8) | Multi-pattern regex or configurable detection |
| Import alias expansion | Breaking saved mappings (Pitfall 12) | Additive-only alias changes; regression test against stored mappings |
| Import alias expansion | Double RLS context in task (Pitfall 4) | Remove redundant set_campaign_context call |
| RLS audit | Superuser test bypass (Pitfall 2) | Meta-test verifying app_user role; assert no BYPASSRLS |
| RLS audit | Missing org table policies (Pitfall 3) | Inventory ALL tables; add org-level RLS or negative tests |
| RLS audit | FieldMappingTemplate INSERT gap (Pitfall 11) | Test INSERT as app_user; add WITH CHECK if needed |
| Navigation consolidation | E2E test breakage (Pitfall 5) | Selector manifest; update tests in same commit |
| Navigation consolidation | Keyboard/a11y regression (Pitfall 6) | Keep visible nav on desktop; re-run axe-core |
| Navigation consolidation | Deep link breakage (Pitfall 9) | UI-only changes; no route file restructuring |
| In-app documentation | Auth routing edge case (Pitfall 7) | Dedicated docs layout route; test both auth states |
| In-app documentation | Stale content (Pitfall 10) | Review dates in frontmatter; avoid UI-specific references |

---

## Sources

- Codebase analysis: `app/services/import_service.py` (alias system, fuzzy matching, voting history regex)
- Codebase analysis: `app/db/rls.py`, `app/db/session.py` (RLS context management)
- Codebase analysis: `app/api/deps.py` (get_campaign_db dependency)
- Codebase analysis: `app/tasks/import_task.py` (double RLS context setting)
- Codebase analysis: `alembic/versions/009_organizations.py`, `015_organization_members.py` (no RLS policies)
- Codebase analysis: `alembic/versions/002_voter_data_models.py` lines 509-516 (field_mapping_templates RLS)
- Codebase analysis: `web/src/routes/__root.tsx` (navigation layout, auth routing)
- Codebase analysis: `web/src/routes/campaigns/$campaignId.tsx` (inline tab bar)
- Codebase analysis: 48 E2E spec files in `web/e2e/` referencing navigation selectors
- [Postgres RLS Implementation Guide - Best Practices and Common Pitfalls](https://www.permit.io/blog/postgres-rls-implementation-guide) -- superuser bypass, testing pitfalls
- [Common Postgres Row-Level-Security Footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) -- policy caching, leakproof functions
- [Shipping multi-tenant SaaS using Postgres Row-Level Security](https://www.thenile.dev/blog/multi-tenant-rls) -- session state leaks with pooling
- [Multi-tenant data isolation with PostgreSQL RLS (AWS)](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) -- testing requirements, plan caching
- [RapidFuzz documentation](https://rapidfuzz.github.io/RapidFuzz/) -- scorer behavior, threshold guidance
- [L2 Documentation - Penn Libraries](https://guides.library.upenn.edu/L2/documentation) -- state-specific column variations
- [L2 Documentation - UC Berkeley](https://guides.lib.berkeley.edu/c.php?g=1381940&p=10332558) -- VM2 format variations
