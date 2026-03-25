# Phase 41: Organization Data Model & Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 41-organization-data-model-auth
**Areas discussed:** Org role mapping, Role resolution logic, Org API endpoints, OrganizationMember schema

---

## Org Role Mapping

### How should org_admin map to campaign-level permissions?

| Option | Description | Selected |
|--------|-------------|----------|
| org_admin = ADMIN | org_admin gets ADMIN-equivalent on all campaigns. org_owner gets OWNER-equivalent. Clean parallel to 5-level CampaignRole. | ✓ |
| org_admin = MANAGER | org_admin gets MANAGER-equivalent. org_owner gets ADMIN-equivalent. More conservative. | |
| org_admin = OWNER | Both org_admin and org_owner get OWNER-equivalent. Simpler but less granular. | |

**User's choice:** org_admin = ADMIN (Recommended)
**Notes:** None

### Should there be any org roles beyond org_owner and org_admin?

| Option | Description | Selected |
|--------|-------------|----------|
| Just two | org_owner and org_admin only. Matches "fixed 7-role hierarchy: 5 campaign + 2 org". | ✓ |
| Add org_member | Third role for users belonging to org without implicit campaign permissions. | |

**User's choice:** Just two (Recommended)
**Notes:** None

### When an org_owner creates a new campaign, should they get an explicit CampaignMember(OWNER) record?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit record | Always create CampaignMember(OWNER) for creator. Consistent data, simpler queries. | ✓ |
| Rely on org resolution | No CampaignMember needed -- org_owner resolves automatically. Fewer records. | |

**User's choice:** Explicit record (Recommended)
**Notes:** None

### Can an org_owner be demoted or removed?

| Option | Description | Selected |
|--------|-------------|----------|
| Transferable | org_owner can transfer ownership to another org_admin. Prevents locked-out orgs. | ✓ |
| Permanent | org_owner is always the org creator. Simpler but risks orphaned orgs. | |

**User's choice:** Transferable (Recommended)
**Notes:** None

---

## Role Resolution Logic

### When a user has NO CampaignMember but IS an org_admin, grant access?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, implicit access | org_admin gets ADMIN on any campaign without CampaignMember row. Core value of org roles. | ✓ |
| Require CampaignMember | org_admin needs explicit record. Safer but defeats purpose. | |

**User's choice:** Yes, implicit access (Recommended)
**Notes:** None

### Should org role resolution auto-set RLS context?

| Option | Description | Selected |
|--------|-------------|----------|
| Bypass RLS for org endpoints | Org endpoints query across all campaigns, don't set app.current_campaign_id. | ✓ |
| Set org-level RLS | New app.current_org_id variable and RLS policies. More secure but complex. | |

**User's choice:** Bypass RLS for org endpoints (Recommended)
**Notes:** None

### Resolution order: should org role replace JWT role?

| Option | Description | Selected |
|--------|-------------|----------|
| Org replaces JWT | (1) CampaignMember, (2) OrganizationMember, (3) deny. JWT role dropped. | ✓ |
| Keep JWT as fallback | (1) CampaignMember, (2) OrganizationMember, (3) JWT role, (4) deny. | |
| You decide | Claude picks based on codebase patterns. | |

**User's choice:** Org replaces JWT (Recommended)
**Notes:** None

### Seed migration: who gets org roles?

| Option | Description | Selected |
|--------|-------------|----------|
| Creator = org_owner only | Promote Organization.created_by to org_owner. Others keep CampaignMember roles. | ✓ |
| Creator + all admins | Promote creator + any ADMIN on any campaign to org_admin. More generous. | |

**User's choice:** Creator = org_owner only (Recommended)
**Notes:** None

---

## Org API Endpoints

### Which org-level endpoints should Phase 41 ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal auth foundation | GET /org, GET /org/campaigns, GET /org/members. Just enough for Phase 43 UI. | ✓ |
| Full CRUD now | Add PATCH /org, POST/PATCH/DELETE /org/members. More API surface. | |
| You decide | Claude determines minimal set for ORG-01 through ORG-04. | |

**User's choice:** Minimal auth foundation (Recommended)
**Notes:** None

### How should the API know which org to scope to?

| Option | Description | Selected |
|--------|-------------|----------|
| JWT org_id is authoritative | API uses org_id from JWT. Multi-org switching at ZITADEL level. | ✓ |
| Optional org_id query param | Accept ?org_id= override with validation. | |
| Header-based org context | Custom X-Organization-ID header. | |

**User's choice:** JWT org_id is authoritative (Recommended)
**Notes:** None

### Should require_org_role() validate against DB Organization record?

| Option | Description | Selected |
|--------|-------------|----------|
| Validate against DB | Look up Organization, check OrganizationMember. Ensures org exists. | ✓ |
| Trust JWT + check member only | Skip Organization lookup. Faster but relies on migration. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Validate against DB (Recommended)
**Notes:** None

---

## OrganizationMember Schema

### What fields beyond basics (id, user_id, organization_id, role)?

| Option | Description | Selected |
|--------|-------------|----------|
| created_at + updated_at | Standard timestamps matching all other tables. | ✓ |
| invited_by | FK to users.id tracking who added this member. | ✓ |
| joined_at | Tracks when user accepted vs when record was created. | ✓ |

**User's choice:** All three selected (multi-select)
**Notes:** None

### Should org role be a separate OrgRole StrEnum?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate OrgRole StrEnum | New enum with org_owner/org_admin values. VARCHAR storage. Clean separation. | ✓ |
| Reuse CampaignRole values | Store 'owner'/'admin' from CampaignRole. Simpler but confusing. | |

**User's choice:** Separate OrgRole StrEnum (Recommended)
**Notes:** None

### Unique constraint on (user_id, organization_id)?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, unique constraint | One membership per user per org. Matches CampaignMember pattern. | ✓ |
| No constraint | Allow multiple records. | |

**User's choice:** Yes, unique constraint (Recommended)
**Notes:** None

### Does organization_members need RLS policies?

| Option | Description | Selected |
|--------|-------------|----------|
| Application-level filtering | Filter by org_id in service queries. No RLS. Simpler migration. | ✓ |
| Add org-level RLS | New RLS policy using app.current_org_id. Defense-in-depth. | |

**User's choice:** Application-level filtering (Recommended)
**Notes:** None

---

## Claude's Discretion

- Migration file naming and revision chain
- OrgRole enum placement
- require_org_role() implementation details
- Org service class design
- Test structure for edge cases

## Deferred Ideas

- Org member CRUD endpoints -- Phase 43
- Org settings update endpoint -- Phase 43
- Org switcher UI -- Phase 43
- Org-level RLS policies -- Not needed per D-17
- Campaign creation gating -- Phase 43
