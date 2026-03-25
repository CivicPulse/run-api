# Phase 40: Production Hardening & Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 40-production-hardening-observability
**Areas discussed:** Sentry configuration, Structured logging, Rate limiting strategy, Error context & tracing

---

## Sentry Configuration

### Sentry Environment

| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted Sentry | Run your own Sentry instance. DSN is internal, no data leaves your infra. | ✓ |
| Sentry SaaS (sentry.io) | Managed Sentry cloud. Faster setup, no maintenance. | |
| You decide | Claude picks based on project constraints. | |

**User's choice:** Self-hosted Sentry
**Notes:** Matches existing self-hosted pattern (ZITADEL, MinIO)

### PII Scrubbing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Strict | Strip request bodies, SQL error data, voter PII. Attach only UUIDs and HTTP metadata. | |
| Moderate | Strip voter PII but keep request bodies for non-voter endpoints. | |
| Minimal | Only strip obvious PII (phone numbers, emails via regex). Keep most context. | ✓ |

**User's choice:** Minimal
**Notes:** Maximum debuggability preferred over strict scrubbing

### Performance Traces

| Option | Description | Selected |
|--------|-------------|----------|
| Errors only | Start with error tracking only. Add performance traces later if needed. | |
| Errors + sampled traces | Capture performance traces at 10-20% sample rate. | ✓ |

**User's choice:** Errors + sampled traces

### DSN Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable | SENTRY_DSN env var. Empty/missing = disabled. | ✓ |
| Always required | App fails to start without SENTRY_DSN. | |

**User's choice:** Environment variable

---

## Structured Logging

### Log Fields

| Option | Description | Selected |
|--------|-------------|----------|
| Required set only | request_id, user_id, campaign_id, method, path, status, duration_ms | |
| Extended | Add query params, response size, IP address, user-agent | ✓ |
| You decide | Claude picks based on requirements | |

**User's choice:** Extended

### Log Format

| Option | Description | Selected |
|--------|-------------|----------|
| JSON always | Structured JSON in all environments | ✓ |
| JSON prod, pretty dev | JSON in production, colored human-readable in local dev | |
| You decide | Claude picks | |

**User's choice:** JSON always

### Loguru Format

| Option | Description | Selected |
|--------|-------------|----------|
| Keep loguru as-is | Loguru stays human-readable for app logs | ✓ |
| Unify to JSON | Configure loguru to also output JSON | |

**User's choice:** Keep loguru as-is

### Request ID Propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Middleware generates UUID | Generate UUID4 per request, store in request.state | |
| Honor incoming header | Use X-Request-ID from upstream if present, generate if missing | ✓ |

**User's choice:** Honor incoming header

---

## Rate Limiting Strategy

### Proxy Header Guard

| Option | Description | Selected |
|--------|-------------|----------|
| Trusted proxy list | Only trust CF-Connecting-IP when request.client.host is in trusted CIDR list | ✓ |
| Always trust header | Always use CF-Connecting-IP if present | |
| Environment toggle | TRUSTED_PROXY_HEADER env var | |

**User's choice:** Trusted proxy list

### Rate Limits

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative | Unauth: 10/min per IP. Auth: 60/min per user + 120/min per IP | |
| Permissive | Unauth: 30/min per IP. Auth: 120/min per user + 300/min per IP | ✓ |
| You decide | Claude picks reasonable defaults | |

**User's choice:** Permissive

### Rate Limit Headers

| Option | Description | Selected |
|--------|-------------|----------|
| Yes | Standard rate limit response headers | ✓ |
| No | Don't expose rate limit info | |

**User's choice:** Yes

---

## Error Context & Tracing

### Request ID in Error Responses

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in all error responses | Add request_id to RFC 9457 problem detail responses | ✓ |
| Only in 5xx errors | Include request_id only for server errors | |
| No | Don't expose request_id in responses | |

**User's choice:** Yes, in all error responses

### Correlation Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| ContextVar | Store request_id in Python ContextVar. Single source of truth. | ✓ |
| request.state only | Store on request.state. Simpler but not accessible from deep service layers. | |

**User's choice:** ContextVar

### Sentry Tags

| Option | Description | Selected |
|--------|-------------|----------|
| Yes | Set Sentry tags from request context: user_id, campaign_id, request_id, HTTP path | ✓ |
| request_id only | Only attach request_id as Sentry tag | |

**User's choice:** Yes

### Health Check Logging

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude | Skip logging and Sentry for /health endpoints | ✓ |
| Include | Log everything including health checks | |

**User's choice:** Exclude

---

## Claude's Discretion

- Structlog processor chain configuration and middleware implementation details
- Sentry SDK initialization placement (lifespan vs module-level)
- Cloudflare IP CIDR list management approach
- ContextVar accessor design and loguru integration approach
- slowapi key_func implementation for dual per-user + per-IP limiting

## Deferred Ideas

None -- discussion stayed within phase scope
