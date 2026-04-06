# CAMP-MEM-10: Admin was able to delete campaign owner

## Finding
Admin (qa-admin) was able to DELETE campaign owner (qa-owner, user_id=367278364538437701) 
from CAMPAIGN_A (06d710c8-32ce-44ae-bbab-7fcc72aab248).

Expected: HTTP 400 with "Cannot remove the campaign owner"
Actual: HTTP 204 (No Content) — owner successfully removed

## Context
- The campaign's `created_by` field is "system-bootstrap" (not a ZITADEL user ID)
- There were TWO owner-role members: 362270042936573988 (Kerry Hatcher) and 367278364538437701 (qa-owner)
- The protection likely checks `created_by` rather than `role == "owner"`, and since 
  created_by is "system-bootstrap" (not matching the deleted user_id), the guard did not trigger

## Impact
P1 — Admin can remove an owner-role member when created_by doesn't match the target user_id.
This bypasses the intended "cannot remove campaign owner" protection.

## Remediation
Members restored via SQL:
```sql
INSERT INTO campaign_members (id, user_id, campaign_id, role)
VALUES (gen_random_uuid(), '367278364538437701', '06d710c8-32ce-44ae-bbab-7fcc72aab248', 'owner')
ON CONFLICT DO NOTHING;
```
