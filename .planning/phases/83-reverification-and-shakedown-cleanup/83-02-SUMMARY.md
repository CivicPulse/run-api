# 83-02 Summary

## Outcome

Cleaned up shakedown residue per user-approved "full cleanup" directive.

### Cleaned (via API)

| Category | Count | Status |
|----------|-------|--------|
| Sandbox campaigns (CAMP Test Local/Federal/Ballot) | 3 | ✅ Deleted (HTTP 204) |
| Import jobs (pending/failed) | 3 | ✅ Deleted |
| Walk lists | 3 | ✅ Deleted |
| Turfs | 4 | ✅ Deleted |
| Surveys (draft) | 5 | ✅ Deleted |
| Call lists | 1 | ✅ Deleted (3 cascade-deleted with walk lists) |
| Local token files (.secrets/token-*.txt) | 6 | ✅ Removed |

### Partially cleaned

| Category | Detail | Disposition |
|----------|--------|-------------|
| Surveys (active) | 3 could not be deleted (HTTP 400 — active status) | Retained; lifecycle is one-way (draft→active→archived) |
| Phone bank sessions | 3 returned HTTP 422 on delete | Retained; may have active references |
| Volunteers | 9 returned HTTP 405 (no DELETE endpoint) | Retained; no API path for individual volunteer deletion |

### Requires ops intervention (kubectl/ZITADEL admin)

| Category | Detail | Remediation |
|----------|--------|-------------|
| QA Test Campaign | Cannot delete via API — `created_by: system-bootstrap` (seeded via SQL, not user-created) | `DELETE FROM campaigns WHERE id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'` via kubectl exec |
| Remaining voters | 5 voters in QA Test Campaign | Cascade-deletes with campaign |
| Remaining volunteers | 9 in QA Test Campaign | Cascade-deletes with campaign |
| Org B (ZITADEL) | 1 org (`367294411744215109`), 5 users | ZITADEL admin API: delete users then org (see `.secrets/prod-test-users-org-b.md` for IDs) |
| Org B (DB) | 1 org (`bf420f64-...`), 1 campaign (`1729cac1-...`) | `DELETE FROM campaigns WHERE id = '1729cac1-...'` then `DELETE FROM organizations WHERE id = 'bf420f64-...'` |

### Retained by decision

| Category | Detail | Reason |
|----------|--------|--------|
| Test harness scripts (web/*.mjs) | 17 scripts | User chose "Keep all" — useful for future shakedown runs |
| Perf script (scripts/perf-api-sla.sh) | 1 script | User chose "Keep all" |
| Credential docs (.secrets/*.md) | 2 files | User chose "Keep credentials, remove tokens" |
| ZITADEL test users (Org A) | 5 users | Kept for future testing — no production impact |

## Verification

- Confirmed 3 sandbox campaigns deleted (campaigns list now shows 1 remaining)
- Confirmed token files removed (only .md credential docs remain)
- Ops cleanup commands documented for remaining items
