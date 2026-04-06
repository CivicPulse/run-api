# Phase 79: Error Handling and Edge Security - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the Phase 79 launch blockers from the 2026-04-05 production shakedown by normalizing database/race/input failures into safe client-visible API contracts and by enforcing the required edge/browser security headers and HTTPS posture for the deployed SPA/API stack.

</domain>

<decisions>
## Implementation Decisions

### Error Contract Shape
- Safe failure responses should stay on the existing problem-details path (`fastapi_problem_details`) instead of ad hoc JSON blobs or raw FastAPI defaults.
- Database and race-condition failures must never expose SQL, constraint names, stack traces, service DNS, or upstream URLs to clients, even on authenticated admin routes.
- Invalid cursors, malformed identifiers, and similar request-shape problems should become stable `422` or `400` responses rather than bubbling `ValueError`/driver exceptions into `500`s.
- Integrity conflicts should map by domain outcome: duplicate/unique races to `409`, missing foreign targets or deleted-row writes to `404` or `422`, with the offline-drain path explicitly receiving a permanent-failure 4xx instead of a retryable `500`.

### Fix Scope and Reuse
- Prioritize the concrete P1 shakedown repros first (`SEC-INFO-01`, `VTR-CTC-04`, `CANV-ASSIGN-06`, `PB-SESS-09`, `CONC-ASSIGN-02`, `CONC-VOTER-04`, `CONC-OFFLINE-03`) but implement the fix through reusable app/core helpers so the same bug class closes systematically.
- Keep route/service semantics explicit where needed: generic exception handlers can sanitize the payload, but endpoint-specific cases that need different status codes still need targeted translation near the domain boundary.
- Preserve existing campaign/tenant checks from Phase 78 and do not widen error bodies enough to reintroduce enumeration or tenancy hints.
- New tests should encode the shakedown contracts directly so verification is tied to the original launch blockers, not inferred behavior.

### Edge Security Delivery
- Security-response headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`) should be emitted from the app layer by default so local, test, and cluster traffic all inherit the same baseline.
- HTTPS redirect is an edge concern in this deployment: Cloudflare terminates TLS before Traefik, so production redirect enforcement must be represented in deployed ingress/ops configuration or clearly documented if the repo-owned manifests are the control point.
- HSTS should only be asserted for secure requests and with a production-safe max-age that satisfies the shakedown criteria.
- The CSP should be tight enough to close the missing-header finding without breaking the current SPA asset model or ZITADEL/OIDC/browser flows.

### Rollout Priorities
- Phase 79 is a hardening phase, not a feature phase: favor small, reviewable fixes that close the known launch blockers before broader validation cleanup in Phase 82.
- Campaign creation and import-flow regressions discovered in the shakedown belong to Phase 80 unless they must be touched incidentally to prevent raw error leakage in Phase 79.
- Swagger/docs exposure, rate limiting, and broader validation gaps stay out of scope unless directly required to keep the Phase 79 security contract coherent.

### the agent's Discretion
The agent may choose the exact split between global exception handlers, middleware, and targeted route/service translation so long as the external API contracts match the shakedown requirements and no raw infrastructure details leak.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/core/errors.py` already centralizes custom exception -> problem-details responses and is the natural home for sanitized global error mapping.
- `app/main.py` is the application assembly point for middleware and error-handler registration.
- `app/core/middleware/request_logging.py` already touches response headers and request IDs, so it establishes the middleware pattern used in this codebase.
- Several routes/services already translate domain failures intentionally (`AlreadyRegisteredError`, `VoterNotFoundError`, selective `IntegrityError` handling in `app/api/v1/voters.py`, `app/services/join.py`, `app/services/campaign.py`).

### Established Patterns
- The backend prefers explicit domain exceptions that are converted into problem-details responses rather than returning raw framework exceptions.
- Campaign-scoped routes rely on `get_campaign_db()` + `ensure_user_synced()` before service calls; Phase 79 fixes must preserve that order and not hide tenancy enforcement.
- Cursor pagination is implemented in multiple services with hand-rolled parsing, so malformed-cursor handling likely needs a shared pattern rather than one-off fixes.
- The deployment model is Cloudflare Tunnel -> Traefik `IngressRoute` -> FastAPI service; there is no in-cluster TLS termination in app code.

### Integration Points
- `app/core/errors.py` and `app/main.py` for global exception and security-header behavior.
- `app/services/voter.py`, `app/services/campaign.py`, `app/services/join.py`, and the affected API routes for shakedown-specific error normalization.
- `k8s/apps/run-api-*/ingress.yaml` and deployment docs for repo-owned edge posture.
- `docs/production-shakedown/results/phase-12-results.md`, `docs/production-shakedown/results/phase-13-results.md`, and `docs/production-shakedown/results/SUMMARY.md` as the authoritative blocker list to close.

</code_context>

<specifics>
## Specific Ideas

- Keep problem response bodies boring and stable: short titles/details, request id included, no embedded traceback text.
- Add regression tests for bogus cursor parsing and deleted-row/offline-drain behavior alongside the race-condition/IntegrityError cases already documented by the shakedown.
- Treat security headers as production defaults, but ensure dev/test environments can still function if some policies need looser values for localhost tooling.

</specifics>

<deferred>
## Deferred Ideas

- Rate limiting and Swagger/OpenAPI production exposure remain documented follow-ups for a later phase unless Phase 79 implementation naturally touches them.
- Full validation cleanup for future dates, oversized strings, null bytes, and page-size semantics belongs primarily to Phase 82.
- Campaign-create ZITADEL grant idempotency and import-worker recovery remain Phase 80 work unless needed for shared error-classification utilities.

</deferred>
