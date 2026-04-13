---
status: awaiting_human_verify
trigger: "volunteer approved for lsegelman84@gmail.com but not appearing in volunteers page or assignable to sessions"
created: 2026-04-13
updated: 2026-04-13
---

## Current Focus

hypothesis: CONFIRMED and fix applied (Strategy A).
test: 20 unit tests across volunteer_application + invite services pass, including new regression tests.
expecting: User verifies fix in real environment and runs prod remediation SQL for lsegelman84.
next_action: Await user confirmation.

## Symptoms

expected: After approving lsegelman84@gmail.com's Volunteer Application, they should appear in the volunteers page and be assignable to call/canvass sessions.
actual: Member shows "approved" in settings/members but does not appear on the volunteers page.
errors: None — silent failure.
reproduction: Approve a Volunteer Application in settings/members, then check volunteers page.
started: Unknown — current.

## Eliminated

## Evidence

- timestamp: 2026-04-13
  checked: app/services/volunteer_application.py approve_application (lines 152-301)
  found: When `_resolve_application_user` returns None AND `application.applicant_user_id` is None, the code calls `_invite_service.create_invite` and then falls through with `user is None`. The entire CampaignMember + Volunteer creation block is gated on `if user is None: ... else:` (line 205-266), so NO Volunteer row is inserted.
  implication: Root cause confirmed. Approved anonymous applicants never get a `volunteers` row until they accept the invite AND some other code path (which does not exist) creates one.

- timestamp: 2026-04-13
  checked: app/services/volunteer.py list_volunteers (lines 275-336)
  found: Query is `select(Volunteer).where(Volunteer.campaign_id == campaign_id)` with no join to campaign_members or users. It strictly reads `volunteers` table rows.
  implication: If no Volunteer row exists, the applicant is invisible to the volunteers page regardless of CampaignMember/User state.

- timestamp: 2026-04-13
  checked: app/models/volunteer.py
  found: `user_id` is nullable (`Mapped[str | None]`). No unique constraint on `(campaign_id, user_id)` or `(campaign_id, email)`. However `created_by` is NOT NULL (ForeignKey to users.id).
  implication: Safe to insert Volunteer rows with `user_id=None`. Must populate `created_by` with reviewer id. De-dupe must be done via pre-check SELECT (no DB constraint to rely on).

- timestamp: 2026-04-13
  checked: app/services/invite.py accept_invite
  found: Creates CampaignMember but never touches volunteers table.
  implication: Once we add the unlinked Volunteer row at approval time, we need accept_invite to back-fill `volunteers.user_id` so the row ties to the real account once they sign in.

## Resolution

root_cause: approve_application in app/services/volunteer_application.py only creates a Volunteer row when a `User` exists. For anonymous applications (the common path — applicant has no prior account), it creates an Invite and exits without inserting into `volunteers`. list_volunteers reads only the `volunteers` table, so the approved applicant is invisible until (currently never) a Volunteer row is inserted.

fix: Strategy A applied.
  1. `app/services/volunteer_application.py::approve_application`: restructured so the Volunteer insert/update runs regardless of whether a local `users` row exists. In the anonymous branch the Invite is still created AND a Volunteer row is inserted with `user_id=None`, de-duped by `(campaign_id, email, user_id IS NULL)`. The existing branches (pre-existing user / stub-user-from-applicant_user_id) continue to create CampaignMember + Volunteer as before.
  2. `app/services/invite.py::accept_invite`: added an unconditional `UPDATE volunteers SET user_id = :user.id, updated_at = now() WHERE campaign_id = :c AND email = :invite.email AND user_id IS NULL` back-fill immediately after CampaignMember creation, so the unlinked Volunteer row ties to the real account at sign-in.

verification:
  - `uv run ruff check` / `uv run ruff format` clean on all 4 touched files.
  - `uv run pytest tests/unit/test_volunteer_application_service.py tests/unit/test_invite_service.py -x` → 20 passed.
  - New regression tests:
    - `test_approve_application_creates_unlinked_volunteer_for_anonymous` asserts a `Volunteer` row with `user_id=None` is added to the session when approving an anonymous application.
    - `test_accept_backfills_unlinked_volunteer_user_id` asserts `accept_invite` issues an `UPDATE` against the `volunteers` table.
  - Existing `test_approve_application_queues_invite_for_anonymous_applicant` updated to include the new de-dupe scalar lookup.
  - Existing accept-invite tests (happy path + two failure paths) updated with an extra `execute` side-effect for the back-fill UPDATE.

files_changed:
  - app/services/volunteer_application.py
  - app/services/invite.py
  - tests/unit/test_volunteer_application_service.py
  - tests/unit/test_invite_service.py

## Manual Remediation (lsegelman84@gmail.com)

Dev DB check (2026-04-13):
```
docker compose exec -T postgres psql -U postgres -d run_api -c \
  "SELECT id, email FROM users WHERE email = 'lsegelman84@gmail.com';"
-- 0 rows

SELECT id, campaign_id, email, status FROM volunteer_applications WHERE email ILIKE '%lsegelman%';
-- 0 rows

SELECT count(*) FROM volunteers WHERE email ILIKE '%lsegelman%';   -- 0
SELECT count(*) FROM invites    WHERE email ILIKE '%lsegelman%';   -- 0
```

lsegelman84@gmail.com is NOT in the dev database — this is a production-only artifact. **User must run the following SQL against the production database** to surface the already-approved applicant on the volunteers page without waiting for them to accept the invite:

```sql
-- 1. Confirm the approved application exists and grab its data
SELECT id, campaign_id, applicant_user_id, first_name, last_name, email, phone, notes, status, reviewed_by
FROM volunteer_applications
WHERE email = 'lsegelman84@gmail.com'
  AND status = 'approved';

-- 2. Confirm no Volunteer row exists yet for this applicant in that campaign
SELECT id, user_id, email FROM volunteers
WHERE campaign_id = '<campaign_id from step 1>'
  AND email = 'lsegelman84@gmail.com';

-- 3. Insert the missing unlinked Volunteer row.
--    If applicant_user_id from step 1 is NOT NULL, use it for user_id AND ensure a
--    campaign_members row exists (INSERT ... ON CONFLICT DO NOTHING). Otherwise
--    user_id stays NULL and the back-fill will run on invite acceptance.
INSERT INTO volunteers (
    id, campaign_id, user_id, first_name, last_name, email, phone, notes,
    status, skills, created_by, created_at, updated_at
)
VALUES (
    gen_random_uuid(),
    '<campaign_id>',
    NULL,                              -- or <applicant_user_id> if present
    '<first_name>',
    '<last_name>',
    'lsegelman84@gmail.com',
    '<phone or NULL>',
    '<notes or NULL>',
    'active',
    ARRAY[]::varchar[],
    '<reviewer_id from volunteer_applications.reviewed_by>',
    now(),
    now()
);

-- 4. If applicant_user_id is NOT NULL and campaign_members is missing a row:
INSERT INTO campaign_members (user_id, campaign_id, role)
VALUES ('<applicant_user_id>', '<campaign_id>', 'volunteer')
ON CONFLICT DO NOTHING;
```

Once the code fix is deployed, future approvals will not need this manual step.
