---
status: investigating
trigger: "E2E suite has ~157 failures across multiple categories"
created: 2026-03-29T22:50:00Z
updated: 2026-03-29T22:50:00Z
---

## Current Focus

hypothesis: require_role._check_role does NOT call ensure_user_synced before resolving campaign role, so first-time users get 403 on campaign endpoints
test: Add ensure_user_synced call in require_role._check_role (matching require_org_role pattern)
expecting: E2E users auto-synced on first campaign API call, eliminating ~84 membership failures
next_action: Implementing fix in app/core/security.py require_role function

## Symptoms

expected: E2E test suite passes (all specs green)
actual: ~157 failures across multiple categories
errors: 403 Forbidden on campaign endpoints (no membership), stale OIDC key in a11y specs, campaign creation 500, tour dialog blocking, color contrast failures
reproduction: cd web && npx playwright test --reporter=line
started: After initial E2E infrastructure setup

## Eliminated

- hypothesis: Sidebar collapsed hiding nav elements
  evidence: Fixed with defaultOpen={true} in SidebarProvider and sidebar_state cookie in auth setup
  timestamp: 2026-03-29T20:00:00Z

## Evidence

- timestamp: 2026-03-29T20:00:00Z
  checked: Initial test run
  found: ~157 failures across 5 categories
  implication: Multiple root causes, need systematic fix approach

- timestamp: 2026-03-29T21:00:00Z
  checked: Sidebar visibility
  found: Sidebar was collapsed by default, causing elements to be outside viewport
  implication: Fixed with defaultOpen and cookie; committed as a4265a5

## Resolution

root_cause: Multiple issues - (1) e2e users not members of seed campaign, (2) stale OIDC key in a11y specs, (3) campaign creation 500, (4) tour dialog blocking, (5) color contrast
fix: Fixing in priority order
verification:
files_changed: []
