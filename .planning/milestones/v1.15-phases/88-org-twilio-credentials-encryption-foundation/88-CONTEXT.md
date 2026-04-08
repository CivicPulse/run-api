# Phase 88: Org Twilio Credentials & Encryption Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds the org-scoped Twilio configuration foundation: encrypted credential storage, secret-safe read and write APIs, and the initial organization settings surface needed for later Twilio voice, SMS, and webhook work.

</domain>

<decisions>
## Implementation Decisions

### Org Settings Surface
- Extend the existing organization settings area at `/org/settings` instead of creating a separate Twilio admin surface.
- Keep general org metadata and Twilio configuration on the same org-scoped route, with Twilio controls clearly grouped in their own card or section.
- Restrict write access to org owners, while allowing org admins to read non-secret configuration status needed for operations.
- Show connection and configuration state with masked or derived values only; never return full secrets to the browser after save.

### Secret Handling & API Contract
- Twilio Account SID is treated as non-secret displayable configuration, while Auth Token and any future API secrets are write-only and never returned once persisted.
- API responses expose booleans, timestamps, and masked hints for saved secrets rather than plaintext credential values.
- Update flows must support partial secret rotation so admins can change one secret without re-entering every field.
- Validation and error handling must avoid echoing submitted secret material in response payloads, logs, exceptions, or schema repr output.

### Persistence & Encryption
- Store Twilio configuration at the organization level, not the campaign level, so later number inventory and messaging features inherit a single billing and compliance boundary per org.
- Encrypt Twilio secrets before database persistence using an application-managed encryption layer rather than relying on frontend obfuscation or plain environment storage.
- Keep encrypted blobs, key identifiers, and secret metadata in a reusable persistence shape that future Twilio credentials or provider secrets can share.
- Design for deterministic non-secret lookups by org while keeping decryption limited to backend service paths that explicitly need provider credentials.

### Integration Seam
- Introduce a dedicated backend Twilio configuration service/module that owns encryption, redaction, and provider-client construction rather than scattering Twilio setup across routes.
- Keep the initial service seam provider-agnostic enough to support later Twilio REST, Voice SDK token, webhook, and Lookup callers from one source of org-scoped configuration truth.
- Reuse existing org auth and dependency patterns in `app/api/v1/org.py`, `app/services/org.py`, and `web/src/hooks/useOrg.ts` instead of adding a parallel permissions model.
- Prefer incremental extension of current org schemas and hooks over one-off Twilio-only transport contracts unless secret safety requires dedicated request or response models.

### the agent's Discretion
The exact encryption primitive, key-loading mechanism, and UI wording for masked secret status are at the agent's discretion as long as they satisfy SEC-01, avoid plaintext leakage, and fit existing repo conventions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/v1/org.py` already exposes org-scoped read and update endpoints with org-role gating and rate limiting.
- `app/services/org.py` is the existing org service seam and a natural place to extend or coordinate org-level Twilio data access.
- `app/models/organization.py` and `app/schemas/org.py` are the current organization persistence and API contract anchors.
- `web/src/routes/org/settings.tsx` is the existing organization settings screen and already supports org-owner-only mutation UX.
- `web/src/hooks/useOrg.ts` centralizes org queries and mutations for the frontend.

### Established Patterns
- Org-scoped APIs bypass campaign-specific routing and use explicit organization filters for defense in depth.
- Frontend data loading uses TanStack Query hooks plus mutation-driven invalidation.
- Settings pages favor incremental cards and inline form controls over modal-heavy workflows.
- Security-sensitive backend code keeps auth and role checks at the route layer, then delegates business logic into services.

### Integration Points
- Add new org-level persistence and migration work adjacent to the existing `organizations` table and org schemas.
- Extend `/api/v1/org` read and patch flows, or add closely related org sub-routes, for Twilio configuration retrieval and updates.
- Extend `/org/settings` and `useOrg` to support the new Twilio settings card and save path.
- Wire provider-client creation through a reusable backend seam so later phases can consume org Twilio config without re-implementing secret access.

</code_context>

<specifics>
## Specific Ideas

- The org settings page should clearly show whether Twilio is configured, when secrets were last updated, and which fields remain write-only.
- The first phase should stop at secure configuration and readiness; it should not yet provision numbers, send SMS, or initiate calls.
- The backend seam should be usable by later phases for account validation checks and Twilio client construction without widening secret exposure.

</specifics>

<deferred>
## Deferred Ideas

- Number inventory, provisioning, and default sender management belong to Phase 89.
- Webhook endpoints, signature validation, and idempotent callback handling belong to Phase 90.
- Browser Voice SDK flows, SMS sending, spend controls, and Lookup validation belong to later milestone phases.

</deferred>
