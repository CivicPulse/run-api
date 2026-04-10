# Phase 101: Signup Link Foundation & Public Entry - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a campaign-scoped volunteer signup-link domain that admins can manage from the authenticated app and that anonymous visitors can resolve through a safe public entry page. This phase stops at link creation, lifecycle control, and public link resolution; application submission and approval stay in phases 102 and 103.

</domain>

<decisions>
## Implementation Decisions

### Public entry contract
- **D-01:** Phase 101 will not extend the legacy slug-based `/join/{slug}` volunteer registration flow. It will introduce a separate tokenized signup-link flow so public access can be invalidated without changing campaign slugs or reusing trusted member-invite semantics.
- **D-02:** Public signup links must resolve through a read-only metadata endpoint plus a same-origin public page, following the established invite-entry pattern in `app/api/v1/invites.py` and `web/src/routes/invites/$token.tsx`.
- **D-03:** Public responses must expose only safe campaign context: campaign name, optional organization name, optional candidate/jurisdiction summary, link label, and status. They must not expose internal IDs beyond what the frontend needs, member data, contact data, or campaign admin metadata.

### Signup link lifecycle
- **D-04:** Signup links will be a dedicated persisted model, not a reuse of `Invite`. The domain needs campaign-scoped labels, active/disabled state, and regeneration semantics that do not map to one-user email invitations.
- **D-05:** Regeneration will create a brand-new token and mark the old link unusable immediately while preserving a stable admin record/history for the labeled link.
- **D-06:** Disabled, regenerated, malformed, or unknown tokens must all fail closed through neutral public statuses instead of revealing which failure case maps to which campaign.

### Admin workflow
- **D-07:** Admin CRUD belongs in the existing campaign member/settings surface rather than the volunteer register form. This keeps link management close to invites and membership administration.
- **D-08:** Admins may create multiple labeled signup links per campaign and list existing links with current status and a shareable URL.

### Reuse and integration
- **D-09:** The phase should reuse the existing public route shell, rate-limiting patterns, and campaign/member permission patterns already used by invites and member settings.
- **D-10:** The legacy `/join/{slug}` flow remains in place for now but becomes legacy-only. New volunteer self-serve onboarding should target signup-link entry points.

### the agent's Discretion
- Exact naming of the new table/model and public route path.
- Whether regeneration is implemented as a dedicated action or an update helper behind the admin API.
- Presentation details for the admin list and public entry card as long as the safe-data boundary is preserved.

</decisions>

<specifics>
## Specific Ideas

- The public page should feel like the invite entry page: a compact, same-origin landing surface that explains status and next steps before authentication or form submission.
- The admin UI should show label, status, created/updated timing, and a copyable share link without forcing staff into a separate workflow.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Invite and public-entry patterns
- `app/api/v1/invites.py` — existing public-token API shape, admin CRUD endpoints, and rate-limit patterns.
- `app/services/invite.py` — current token lifecycle semantics and fail-closed validation approach.
- `web/src/routes/invites/$token.tsx` — established same-origin public entry shell for tokenized campaign access.

### Existing volunteer self-registration
- `app/api/v1/join.py` — legacy slug-based public volunteer join API that phase 101 must not overload.
- `app/services/join.py` — current direct-join behavior that later phases may replace behind the new signup-link funnel.

### Admin surfaces
- `web/src/routes/campaigns/$campaignId/settings/members.tsx` — existing admin members/invites UX where signup-link management should land.
- `web/src/hooks/useInvites.ts` — frontend data-fetch/mutation pattern for simple campaign-scoped admin resources.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/v1/invites.py`: good template for campaign-scoped admin CRUD plus public token resolution.
- `web/src/routes/invites/$token.tsx`: reusable public-page structure, loading/error states, and login handoff behavior.
- `web/src/routes/campaigns/$campaignId/settings/members.tsx`: reusable table/dialog patterns for link management beside invites.
- `app/core/rate_limit.py` usage across invite/join routes: existing limiter strategy for public and authenticated endpoints.

### Established Patterns
- Tokenized public resources already use UUID route params and neutral public statuses.
- Campaign-admin write actions live behind `require_role("admin")`.
- Frontend resource hooks use TanStack Query with campaign-scoped keys and simple invalidation on mutation success.

### Integration Points
- New signup-link model and migration in the backend data layer.
- New service and API router for admin CRUD plus public resolution.
- Members settings UI for management.
- Public route tree for link resolution and later phase-102 application submission.

</code_context>

<deferred>
## Deferred Ideas

- Public volunteer application submission, dedupe, and existing-account handling — Phase 102.
- Review queue, approval, rejection, and membership activation — Phase 103.
- Sunset/removal of the legacy `/join/{slug}` direct registration path — follow-up once the new funnel is complete.

</deferred>

---

*Phase: 101-signup-link-foundation-public-entry*
*Context gathered: 2026-04-09*
