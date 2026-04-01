---
created: 2026-03-31T23:30:00.000Z
title: Multi-campaign E2E voter isolation test
area: testing
files:
  - scripts/bootstrap-zitadel.py
  - scripts/seed.py
  - web/e2e/voter-isolation.spec.ts
---

## Problem

Current E2E voter isolation test uses a single campaign + fake UUID (returns 403 because user has no membership). A true multi-campaign E2E test would verify that a user who IS authenticated and has their own campaign CANNOT see another campaign's voters — testing the full RLS + auth + UI stack.

## Solution

Build multi-campaign E2E infrastructure:
1. Add second ZITADEL org + user to bootstrap script
2. Add second campaign with seed voters to seed.py
3. Create second Playwright auth state (e.g., `playwright/.auth/campaign-b-owner.json`)
4. Write E2E spec with two browser contexts:
   - Context A: authenticated as campaign A user, creates voters
   - Context B: authenticated as campaign B user, verifies zero access to A's voters
   - Both via UI navigation and direct API calls
