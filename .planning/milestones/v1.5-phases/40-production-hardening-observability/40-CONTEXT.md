# Phase 40: Production Hardening & Observability - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Production errors are captured with full context, requests are traced end-to-end, and rate limiting uses real client IPs. This phase delivers Sentry error tracking with performance traces, structlog request middleware with structured JSON logging, correct rate limiting behind Cloudflare/Traefik, and per-user rate limits on authenticated endpoints. No new UI features -- backend observability infrastructure only.

</domain>

<decisions>
## Implementation Decisions

### Sentry Configuration
- **D-01:** Self-hosted Sentry instance. DSN provided via `SENTRY_DSN` environment variable in Settings; empty/missing = Sentry disabled (graceful no-op)
- **D-02:** Minimal PII scrubbing -- strip obvious PII (phone numbers, emails) via regex in `before_send` hook. Keep request bodies and most context for maximum debuggability
- **D-03:** Enable performance traces at 10-20% sample rate in addition to error tracking. Useful for spotting slow endpoints early
- **D-04:** Attach Sentry tags from request context: user_id, campaign_id, request_id, HTTP path. Enables filtering errors by campaign or user in Sentry dashboard

### Structured Logging
- **D-05:** Structlog request middleware emits JSON-formatted log lines in all environments (dev and prod). No environment-specific formatting
- **D-06:** Extended log fields per request: request_id, user_id, campaign_id, HTTP method, path, status code, duration_ms, query params, response size, client IP, user-agent
- **D-07:** Loguru stays human-readable for application logs (services, startup, background tasks). Structlog handles machine-parseable request telemetry. Two streams, two purposes
- **D-08:** Honor incoming `X-Request-ID` header from upstream (Cloudflare/Traefik) if present; generate UUID4 if missing. Enables end-to-end correlation across services

### Rate Limiting
- **D-09:** Trusted proxy CIDR list for CF-Connecting-IP validation. Only trust the header when `request.client.host` is in a configured trusted proxy list (Cloudflare IP ranges). Fall back to `request.client.host` for untrusted sources
- **D-10:** Permissive rate limits: unauthenticated endpoints (login, join) 30/min per IP; authenticated endpoints 120/min per user + 300/min per IP
- **D-11:** Include standard rate limit response headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset). slowapi supports this natively

### Error Context & Tracing
- **D-12:** Include request_id in all RFC 9457 problem detail error responses. Users/support can correlate errors to logs and Sentry events
- **D-13:** Use Python ContextVar to store request_id. Structlog middleware sets it, Sentry `before_send` reads it, loguru can access it via custom format. Single source of truth, no threading issues
- **D-14:** Exclude health check endpoints (/health, /health/ready) from request logging and Sentry. K8s probes fire every 10s and create noise

### Claude's Discretion
- Structlog processor chain configuration and middleware implementation details
- Sentry SDK initialization placement (lifespan vs module-level)
- Cloudflare IP CIDR list management (hardcoded vs fetched vs config)
- ContextVar accessor design and loguru integration approach
- slowapi key_func implementation for per-user + per-IP dual limiting

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Infrastructure
- `app/main.py` -- Application factory, middleware registration, lifespan handler
- `app/core/rate_limit.py` -- Current slowapi limiter (uses broken `get_remote_address`)
- `app/core/config.py` -- Settings class (add SENTRY_DSN, TRUSTED_PROXY_CIDRS here)
- `app/core/errors.py` -- RFC 9457 error handlers (add request_id to responses here)

### Logging
- `app/core/config.py:settings` -- Loguru is configured implicitly (no explicit setup file)
- Codebase uses `from loguru import logger` throughout all services

### Auth & Security
- `app/core/security.py` -- JWT validation, AuthenticatedUser model (user_id source for rate limiting and Sentry tags)
- `app/api/deps.py` -- FastAPI dependency chain (auth -> role -> DB session)

### Rate Limiting Usage
- `app/api/v1/join.py` -- Only route currently using `@limiter.limit()` decorator

### Requirements
- `.planning/REQUIREMENTS.md` -- OBS-01 through OBS-04 (lines 18-24)

### Architecture
- `.planning/codebase/ARCHITECTURE.md` -- Layered architecture, middleware integration points
- `.planning/codebase/CONVENTIONS.md` -- Coding patterns, error handling patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `slowapi` already installed and wired into `app/main.py` -- needs key_func replacement, not full rewrite
- `fastapi-problem-details` error handlers in `app/core/errors.py` -- extend with request_id field
- `app/core/config.py` Settings class -- add SENTRY_DSN, TRUSTED_PROXY_CIDRS, rate limit config
- `loguru` throughout codebase -- keep untouched, structlog is additive middleware only

### Established Patterns
- Middleware registered via `app.add_middleware()` in `create_app()` -- structlog middleware goes here
- Lifespan handler for service initialization -- Sentry SDK init could go here or at module level
- FastAPI `Depends()` chain for auth -- user_id available for per-user rate limiting
- RFC 9457 problem details for all error responses -- natural place for request_id injection

### Integration Points
- `create_app()` in `app/main.py` -- middleware and Sentry initialization
- `app/core/errors.py` -- error handler functions need request_id from ContextVar
- `app/core/rate_limit.py` -- replace `get_remote_address` with trusted proxy-aware key function
- `app/api/deps.py` -- user_id extraction point for per-user rate limiting

</code_context>

<specifics>
## Specific Ideas

- Self-hosted Sentry aligns with existing self-hosted pattern (ZITADEL, MinIO) -- keeps all data on owned infra
- v1.5 Research already decided: "Keep loguru for app logging; add structlog only as request middleware"
- Honoring X-Request-ID from upstream enables full request tracing across Cloudflare -> Traefik -> API
- Performance traces at 10-20% sample rate catches slow endpoints without significant overhead on self-hosted Sentry

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 40-production-hardening-observability*
*Context gathered: 2026-03-24*
