# Phase 76: Reliability — Backend Infrastructure - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

HTTP clients, DB connections, rate limits, uploads, and log IP resolution have the defaults and safeguards needed for production. Closes H1, H2, H11, H12, H14, H16 from CODEBASE-REVIEW-2026-04-04.md. Backend-only.

</domain>

<decisions>
## Implementation Decisions

### Timeouts & Rate Limiting
- **REL-04 ZitadelService HTTP timeouts**: **10s per call** applied to all `httpx.AsyncClient` instantiations in `app/services/zitadel.py`.
- **REL-05 DB engine timeouts**: Set `pool_timeout=10` on `create_async_engine` and pass `connect_args={"server_settings": {"statement_timeout": "30000"}}` for per-statement 30s cap.
- **REL-06 Duplicate Settings fields (H11)**: In `app/core/config.py:45,69` remove the **first** declarations of `trusted_proxy_cidrs` and `rate_limit_unauthenticated`; keep the later ones (current defaults).
- **REL-06 Rate limit default (H12)**: Change `docker-compose.yml:25` default to `DISABLE_RATE_LIMIT:-false` — rate limiting ENABLED by default. Devs opt out explicitly.

### Upload Safety & IP Logging
- **REL-09 DNC CSV max size (H1)**: **10 MB** limit. Enforce by checking `Content-Length` header AND stream-reading with byte cap.
- **REL-10 Import filename sanitization (H2)**: Strip path separators and disallowed chars, prepend UUID — `{uuid}-{safe-basename}`. Applied before use in S3 object keys.
- **REL-07 Request-logging IP (H16)**: Call existing `_is_trusted_proxy(ip)` check before trusting `X-Real-IP`/`X-Forwarded-For` headers. Fall back to `request.client.host` otherwise.
- **REL-11 alembic.ini**: Replace hardcoded DB URL at `alembic.ini:5` with `%(DATABASE_URL_SYNC)s` interpolation (H15 fix if in scope).

### Claude's Discretion
- Whether to add env-var override for MAX_CSV_SIZE or ZITADEL_TIMEOUT — at Claude's discretion if trivial.
- Exact regex/allowlist for filename sanitization — match industry-standard safe-filename patterns.
- Whether H13 (TLS verification scope fix) should be included in this phase or deferred — Claude to judge based on existing code shape.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_is_trusted_proxy` helper already exists in middleware — reuse for H16.
- `httpx.AsyncClient` timeout param supports `httpx.Timeout(10.0)` or float seconds.
- SQLAlchemy `create_async_engine` accepts `connect_args` + pool params directly.

### Established Patterns
- Settings class uses Pydantic BaseSettings — env-var mapping automatic.
- docker-compose env defaults use `:-<default>` shell syntax.
- Existing middleware at `app/core/middleware/request_logging.py:81-85` with existing `_is_trusted_proxy` nearby.

### Integration Points
- `app/services/zitadel.py` — AsyncClient instantiations need timeout= param.
- `app/db/session.py:16-22` — create_async_engine call.
- `app/core/config.py:45,69` — duplicate Settings fields.
- `docker-compose.yml:25` — DISABLE_RATE_LIMIT default.
- `app/api/v1/dnc.py:91` — DNC CSV upload read.
- `app/api/v1/imports.py:136` — import filename to S3 key.
- `app/core/middleware/request_logging.py:81-85` — client IP extraction.

</code_context>

<specifics>
## Specific Ideas

- Follow exact fix snippets from CODEBASE-REVIEW H1, H2, H11, H12, H14, H16.
- Test timeout behavior with mock httpx/asyncpg responses (not real network).
- Test DNC upload rejects > 10MB with clear 413 error.
- Test filename sanitization rejects/transforms `../`, null bytes, unicode edge cases.

</specifics>

<deferred>
## Deferred Ideas

- H13 TLS verification scope fix — defer unless trivial.
- H17 Dockerfile uv version pin — defer (supply chain, separate CI concern).
- Broader query timeout tuning per-endpoint — deferred.

</deferred>
