---
quick_id: 260406-mgu
description: Reset prod to empty state with Vote Hatcher org only
mode: quick-full
must_haves:
  truths:
    - Script drops all app tables and re-runs Alembic migrations
    - Script cleans up non-Vote Hatcher ZITADEL orgs
    - Script seeds Vote Hatcher org with Kerry as org_owner
    - Script requires explicit --confirm flag for safety
    - Script runs inside the prod API pod via kubectl exec
  artifacts:
    - scripts/reset_prod.py
  key_links:
    - scripts/seed.py (reference for seeding pattern)
    - app/services/zitadel.py (ZITADEL API client)
    - app/models/organization.py (Organization model)
    - app/models/organization_member.py (OrganizationMember model)
    - app/models/user.py (User model)
---

# Plan: Reset Production to Empty State

## Task 1: Create `scripts/reset_prod.py`

**Files:** `scripts/reset_prod.py` (new)
**Action:** Create a production reset script with kubectl usage docs in the module docstring that:

1. **Safety gate:** Require `--confirm` CLI flag. Without it, print what would happen and exit.
2. **Scale down worker:** Print reminder to scale down worker deployment first (prevents jobs from running during reset).
3. **Drop and re-migrate:**
   - Connect via DATABASE_URL_SYNC (sync, for Alembic compatibility)
   - Execute `DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS postgis;`
   - Run `alembic upgrade head` via subprocess
4. **ZITADEL cleanup** (raw httpx calls — ZitadelService has no org-list or user-search methods):
   - Instantiate httpx client with same token/header pattern as ZitadelService (client_credentials grant to `{base_url}/oauth/v2/token`)
   - **Note:** `POST /admin/v1/orgs/_search` is the ZITADEL **Admin** API — requires the service account to have IAM_OWNER or IAM_ORG_MANAGER role. If the service account lacks this, the script should catch the 403 and print instructions.
   - Use raw `POST /admin/v1/orgs/_search` to list all orgs
   - For each org that is NOT named "Vote Hatcher", call deactivate then delete (using `x-zitadel-orgid` header per ZitadelService pattern)
   - If "Vote Hatcher" org exists, keep its ID. If not, create it via `POST /management/v1/orgs`.
   - Ensure project grant exists for Vote Hatcher org via `POST /management/v1/projects/{project_id}/grants`
5. **Seed Vote Hatcher org:**
   - Search ZITADEL users by email `kerry@kerryhatcher.com` via raw httpx `POST /v2/users` to get user ID (sub)
   - Create User record in DB with ZITADEL sub as `id`, display name, email
   - Create Organization record linked to ZITADEL org ID — **set `created_by=kerry_user_id`** (Organization.created_by is NOT NULL FK to users.id)
   - Create OrganizationMember with `user_id=kerry_user_id`, role="org_owner"
   - Assign project role "owner" in ZITADEL for the user
6. **Verify:** Print summary of what was created.

**Module docstring** must include:
- kubectl command to scale down worker: `kubectl scale deployment run-api-worker --replicas=0 -n civpulse-prod`
- kubectl command to exec into API pod and run: `kubectl exec -it deploy/run-api -n civpulse-prod -- python scripts/reset_prod.py --confirm`
- kubectl command to scale worker back up: `kubectl scale deployment run-api-worker --replicas=1 -n civpulse-prod`
- How to verify: login at https://run.civpulse.org, check Vote Hatcher org is the only org

**Verify:** `uv run ruff check scripts/reset_prod.py`
**Done:** Script exists, passes lint, prints usage when run without --confirm, docstring contains full kubectl workflow
