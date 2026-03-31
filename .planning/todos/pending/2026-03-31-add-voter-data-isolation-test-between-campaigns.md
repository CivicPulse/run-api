---
created: 2026-03-31T23:06:31.293Z
title: Add voter data isolation test between campaigns
area: testing
files:
  - app/api/v1/voters.py
  - tests/
  - scripts/seed.py
---

## Problem

Voter data is not verified to be campaign-scoped. When a voter is added (manually or via import), there is no test ensuring that only the campaign that created/imported the voter can see that voter. Voter information should never leak between campaigns — this is a multi-tenant data isolation concern.

This is a potential security/privacy bug: if campaign A adds a voter, campaign B should not be able to query or view that voter's data.

## Solution

Add an integration or E2E test that:
1. Creates two separate campaigns (or uses existing seed data with multiple campaigns)
2. Adds/imports a voter under campaign A
3. Queries voters from campaign B's context
4. Asserts the voter added by campaign A is NOT visible to campaign B
5. Verifies this holds for both manual add and bulk import paths

Check the API layer (`/api/v1/campaigns/{campaign_id}/voters`) to confirm campaign_id scoping is enforced at the query level, not just the route level.
