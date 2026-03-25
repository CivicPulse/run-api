# Phase 40: Production Hardening & Observability — Research

**Researched:** 2026-03-24
**Phase Goal:** Production errors are captured with full context, requests are traced end-to-end, and rate limiting uses real client IPs

## 1. Sentry Integration (OBS-01)

### SDK Setup

- **Package:** `sentry-sdk[fastapi]` — includes FastAPI/Starlette/ASGI integrations automatically
- **Init location:** Module-level in `app/core/sentry.py`, called from `create_app()` before middleware registration. Sentry SDK must init before any request handling starts. Lifespan is too late (requests could arrive during startup)
- **Graceful disable:** Check `settings.sentry_dsn` — if empty/None, skip `sentry_sdk.init()` entirely. No-op by default in dev

### Configuration

```python
sentry_sdk.init(
    dsn=settings.sentry_dsn,
    traces_sample_rate=settings.sentry_traces_sample_rate,  # 0.1-0.2
    environment=settings.environment,  # "development", "production"
    before_send=scrub_pii,
    send_default_pii=False,
)
```

### PII Scrubbing (before_send hook)

Per D-02: Strip phone numbers and emails via regex patterns. Keep request bodies and most context.

```python
import re

PHONE_RE = re.compile(r'\b(\+?1?\d{10,15})\b')
EMAIL_RE = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

def scrub_pii(event, hint):
    """Strip voter PII from Sentry events while preserving debugging context."""
    # Walk event data and redact phone/email patterns
    # Focus on: exception values, breadcrumb messages, extra data
    return event
```

Key fields to scrub: `event["exception"]["values"][*]["value"]`, `event["breadcrumbs"]["values"][*]["message"]`, `event["extra"]`. Do NOT scrub `event["tags"]` (user_id/campaign_id are operational, not PII).

### Sentry Tags from Request Context

Per D-04/D-13: Read from ContextVar set by structlog middleware:
- `sentry_sdk.set_tag("request_id", request_id)`
- `sentry_sdk.set_tag("user_id", user_id)`
- `sentry_sdk.set_tag("campaign_id", campaign_id)`
- `sentry_sdk.set_tag("http_path", path)`

Best place: structlog middleware sets ContextVar, Sentry's `before_send` reads them and attaches as tags. This avoids duplicate middleware.

### Performance Traces

Per D-03: `traces_sample_rate=0.1` (10%) is good for self-hosted Sentry where storage cost matters. The FastAPI integration auto-instruments all endpoints. Health checks should be excluded via `traces_sampler` callback or `ignore_transactions` config.

## 2. Structured Logging with structlog (OBS-02)

### Package & Architecture

- **Package:** `structlog` — pure Python, no C deps
- **Architecture per D-07:** structlog handles ONLY request-level telemetry (middleware). loguru stays untouched for application logs. Two independent log streams

### Middleware Design

ASGI middleware (not Starlette BaseHTTPMiddleware, which has known issues with streaming responses):

```python
class StructlogMiddleware:
    """Pure ASGI middleware for request telemetry."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # ... timing, context extraction, log emission
```

### Log Fields per Request (D-06)

Required fields per log line:
- `request_id` — from X-Request-ID header or generated UUID4 (D-08)
- `user_id` — extracted from JWT if authenticated, null for public endpoints
- `campaign_id` — from URL path param if present
- `method` — HTTP method
- `path` — URL path
- `status_code` — response status
- `duration_ms` — time.perf_counter() delta in milliseconds
- `query_params` — URL query string (for debugging)
- `response_size` — Content-Length header value
- `client_ip` — real client IP (from CF-Connecting-IP or request.client.host)
- `user_agent` — User-Agent header

### ContextVar for request_id (D-13)

```python
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
campaign_id_var: ContextVar[str] = ContextVar("campaign_id", default="")
```

Set in structlog middleware. Readable by:
- Sentry `before_send` hook
- Error handlers in `app/core/errors.py` (for RFC 9457 responses)
- loguru custom format (if needed later)

### Health Check Exclusion (D-14)

Skip logging for paths starting with `/health/`. K8s probes fire every 10s — that's 8,640 log lines/day of noise per probe.

### structlog Processor Chain

```python
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
```

Output goes to stdout as JSON. No file logging — container orchestration (K8s) captures stdout.

## 3. Rate Limiting Fix (OBS-03, OBS-04)

### Current State

`app/core/rate_limit.py` uses `get_remote_address` which reads `request.client.host`. Behind Cloudflare + Traefik, this is always the proxy IP, not the real client.

### Trusted Proxy Solution (D-09)

```python
from ipaddress import ip_address, ip_network

CLOUDFLARE_CIDRS = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
    "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
    "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    # IPv6
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32",
]
```

**Key function logic:**
1. Check if `request.client.host` is in trusted proxy CIDRs
2. If trusted: read `CF-Connecting-IP` header (Cloudflare) or `X-Real-IP` (Traefik)
3. If not trusted: use `request.client.host` directly (prevents header spoofing)
4. `TRUSTED_PROXY_CIDRS` configurable via Settings for non-Cloudflare deployments

### Per-User Rate Limiting (D-10, OBS-04)

slowapi supports multiple key functions. For authenticated endpoints:

```python
def get_user_key(request: Request) -> str:
    """Extract user_id from JWT for per-user rate limiting."""
    # Read from Authorization header, decode JWT, return sub claim
    # Fallback to IP if no valid JWT
```

**Rate limit tiers per D-10:**
- Unauthenticated: `30/minute` per IP (login, join, public endpoints)
- Authenticated: `120/minute` per user + `300/minute` per IP (defense-in-depth)

**Dual limiting approach:** Apply IP limit globally via middleware, user limit via decorator on authenticated routes. slowapi supports `key_func` per-decorator override.

### Response Headers (D-11)

slowapi includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` by default when `headers_enabled=True` (which is the default). No extra work needed.

## 4. Error Context Enhancement (OBS-01, OBS-02)

### RFC 9457 request_id Injection (D-12)

Current error handlers in `app/core/errors.py` return `ProblemResponse`. Add `request_id` field:

```python
from app.core.observability import request_id_var

# In each exception handler:
return problem.ProblemResponse(
    status=...,
    title=...,
    detail=...,
    type=...,
    request_id=request_id_var.get(""),  # ContextVar populated by middleware
)
```

Also add to the global unhandled exception handler that fastapi-problem-details provides.

### Response Header

Also return `X-Request-ID` response header from the structlog middleware so clients/support can quote it.

## 5. Integration Points & File Map

### New Files

| File | Purpose |
|------|---------|
| `app/core/observability.py` | ContextVars (request_id, user_id, campaign_id), structlog config |
| `app/core/sentry.py` | Sentry SDK init, PII scrubbing before_send |
| `app/core/middleware/request_logging.py` | ASGI structlog request telemetry middleware |

### Modified Files

| File | Changes |
|------|---------|
| `app/core/config.py` | Add SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE, ENVIRONMENT, TRUSTED_PROXY_CIDRS, rate limit settings |
| `app/core/rate_limit.py` | Replace `get_remote_address` with trusted-proxy-aware key function, add per-user key function |
| `app/core/errors.py` | Add `request_id` to all ProblemResponse calls |
| `app/main.py` | Call `init_sentry()`, add StructlogMiddleware, add X-Request-ID response header |
| `pyproject.toml` | Add `sentry-sdk[fastapi]`, `structlog` dependencies |

### Dependency Order

1. `app/core/observability.py` — ContextVars (no deps)
2. `app/core/config.py` — Settings additions (no deps)
3. `app/core/sentry.py` — depends on config + observability
4. `app/core/middleware/request_logging.py` — depends on observability + config
5. `app/core/rate_limit.py` — depends on config
6. `app/core/errors.py` — depends on observability
7. `app/main.py` — wires everything together

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| structlog + loguru conflict | Keep completely separate: structlog for request middleware only, loguru untouched for app logs |
| Sentry SDK slows requests | Performance traces at 10% sample rate; error tracking is async (queued) |
| Rate limit breaks behind different proxy | Configurable TRUSTED_PROXY_CIDRS; fallback to request.client.host |
| ContextVar not set for background tasks | Only used in request context; TaskIQ workers don't need request_id |
| PII leaks in Sentry | before_send regex scrubbing + send_default_pii=False + explicit test |

## 7. Validation Architecture

### Unit Tests
- `test_scrub_pii` — verify phone/email regex strips from event payloads
- `test_trusted_proxy_key_func` — verify CF-Connecting-IP used when proxy trusted, ignored when not
- `test_per_user_key_func` — verify JWT user_id extraction for rate limiting
- `test_health_check_excluded` — verify /health/ paths skip logging

### Integration Tests
- `test_request_id_propagation` — send request with X-Request-ID header, verify it appears in response header, log output, and error responses
- `test_rate_limit_real_ip` — verify rate limiting uses real IP behind proxy
- `test_sentry_event_sent` — mock sentry transport, verify error events sent with correct tags and without PII
- `test_structured_log_format` — capture stdout, verify JSON log line has all required fields

### Success Criteria Verification
- SC-1: Mock Sentry transport captures event within test; event has request_id + user_id tags; event does NOT contain phone/email patterns
- SC-2: Capture middleware log output; parse JSON; verify all 11 fields present
- SC-3: Send request with CF-Connecting-IP from trusted CIDR; verify rate limit key uses header IP, not proxy IP
- SC-4: Send authenticated requests; verify rate limit key is user_id, not IP

---

*Phase: 40-production-hardening-observability*
*Research completed: 2026-03-24*
