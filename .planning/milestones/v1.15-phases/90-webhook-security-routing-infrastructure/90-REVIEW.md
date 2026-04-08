---
phase: 90-webhook-security-routing-infrastructure
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - alembic/versions/031_webhook_events.py
  - app/api/v1/router.py
  - app/api/v1/webhooks.py
  - app/core/config.py
  - app/models/__init__.py
  - app/models/webhook_event.py
  - app/schemas/webhook.py
  - app/services/twilio_webhook.py
  - tests/unit/test_twilio_webhook.py
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-04-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase delivers Twilio webhook ingress infrastructure: a migration, ORM model, Pydantic schema, FastAPI dependency chain (org resolution → signature verification), three placeholder route handlers, and unit tests covering the happy/sad paths.

The security design is solid — the URL reconstruction from `settings.webhook_base_url` (rather than `request.url`) correctly defends against Host-header spoofing, the HMAC check is per-org, and idempotency uses a Postgres-level unique constraint. No hardcoded secrets were found.

There are three issues worth addressing before Phase 91/92 build on this infrastructure: one Critical (form body consumed twice), two Warnings (unguarded `TwilioConfigError` propagation and missing `db.commit()` in idempotency helper), and three Info items.

---

## Critical Issues

### CR-01: Request form body consumed twice — signature validation uses stale data

**File:** `app/services/twilio_webhook.py:67,111`

**Issue:**
`resolve_org_from_phone` calls `await request.form()` at line 67 to extract `To`/`Called`. FastAPI/Starlette caches the result the first time but only if `await request.form()` has been called and the stream has been consumed. When `verify_twilio_signature` (which depends on `resolve_org_from_phone`) then calls `await request.form()` again at line 111, it relies on the cached `FormData` object.

The risk: Starlette's `Request.form()` does cache after the first read, so this works in practice today. However, the caching behaviour is an implementation detail and the correctness of HMAC verification depends on the `params` dict passed to `validator.validate()` containing exactly the same key/value pairs that Twilio signed. If the form is ever re-parsed differently (e.g., after middleware touches the body), the signature check will silently fail open (validator returns `False` → 403) or, worse, pass with a subtly different payload.

The safe pattern is to read the form exactly once, cache it on the request's `state`, and pass it explicitly. This is a correctness and defence-in-depth concern directly touching the primary security control of the webhook system.

**Fix:**
```python
# In resolve_org_from_phone and verify_twilio_signature, share one form read:

async def _get_form(request: Request) -> dict:
    """Read and cache the form body on request.state to avoid double consumption."""
    if not hasattr(request.state, "twilio_form"):
        request.state.twilio_form = dict(await request.form())
    return request.state.twilio_form


async def resolve_org_from_phone(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    form_data = await _get_form(request)
    to_number = form_data.get("To") or form_data.get("Called")
    ...

async def verify_twilio_signature(
    request: Request,
    org: Organization = Depends(resolve_org_from_phone),
) -> Organization:
    ...
    params = await _get_form(request)   # same cached dict
    if not validator.validate(public_url, params, signature):
        ...
```

---

## Warnings

### WR-01: `TwilioConfigError` from decryption bubbles up as an unhandled 500

**File:** `app/services/twilio_webhook.py:103`

**Issue:**
`TwilioConfigService().credentials_for_org(org)` at line 103 returns `None` when `account_sid`, `ciphertext`, or `key_id` are absent — that case is handled by the 403 at line 105. But `credentials_for_org` calls `self.decrypt_auth_token(...)` which raises `TwilioConfigError` if decryption fails (bad key, key rotation mismatch, corrupted ciphertext). That exception is not caught in `verify_twilio_signature`, so it will propagate as an unhandled 500 to the Twilio callback, which will retry the delivery and flood logs.

**Fix:**
```python
from app.services.twilio_config import TwilioConfigError

async def verify_twilio_signature(...) -> Organization:
    ...
    try:
        creds = TwilioConfigService().credentials_for_org(org)
    except TwilioConfigError:
        raise HTTPException(
            status_code=403,
            detail="Twilio not configured for organization",
        )
    if creds is None:
        raise HTTPException(
            status_code=403,
            detail="Twilio not configured for organization",
        )
    ...
```

### WR-02: `check_idempotency` does not commit — rows are silently invisible to concurrent workers

**File:** `app/services/twilio_webhook.py:148`

**Issue:**
`check_idempotency` executes the `INSERT ... ON CONFLICT DO NOTHING` but never calls `await db.commit()`. In the current caller pattern the handler returns immediately after the placeholder `return ""`, so if the session is closed (and rolled back) before any outer commit point, the webhook event row is never persisted. Duplicate Twilio retries will then pass the idempotency check and be processed again.

The function's docstring says "not a dependency — called explicitly by handlers." Phase 91/92 handlers must ensure they commit, but that's easy to miss. The function itself should either commit, or its docstring should prominently warn that the caller is responsible for committing the session.

**Fix (option A — commit inside helper):**
```python
async def check_idempotency(...) -> bool:
    stmt = (
        pg_insert(WebhookEvent)
        .values(...)
        .on_conflict_do_nothing(constraint="uq_webhook_events_sid_type")
    )
    result = await db.execute(stmt)
    await db.commit()          # <-- persist immediately
    return result.rowcount == 0
```

**Fix (option B — strong docstring warning):**
```python
async def check_idempotency(...) -> bool:
    """...
    IMPORTANT: The caller is responsible for committing `db` after this call.
    If the session is rolled back the idempotency row will be lost and the
    event may be processed again on retry.
    """
```

Option A is safer for this use case since idempotency tracking should be committed as early as possible, independently of the main handler's transaction.

### WR-03: Webhook routes are mounted under the authenticated `/api/v1` prefix — Twilio cannot authenticate

**File:** `app/api/v1/router.py:59`

**Issue:**
The webhooks router is registered on the main `router` with prefix `/api/v1/webhooks/twilio`. If the application mounts authentication middleware (ZITADEL/OIDC) as a dependency on all `/api/v1` routes (which is the established project pattern), Twilio's unauthenticated POST requests will be rejected with a 401 before `verify_twilio_signature` ever runs.

The webhook routes must be excluded from the OIDC auth requirement, either by mounting them on a separate top-level router or by using a FastAPI dependency override / route-level exclusion.

**Fix:**
Check how the app applies OIDC auth. If it is applied globally to the `APIRouter` or the `FastAPI` app with an `include_in_schema` dependency, the webhooks router must be mounted at a separate prefix outside that scope:

```python
# In app/main.py (or wherever the router is included):
# Authenticated routes
app.include_router(v1_router)

# Unauthenticated Twilio webhook ingress (auth handled by HMAC, not OIDC)
app.include_router(webhooks.router, prefix="/api/v1/webhooks/twilio", tags=["webhooks"])
```

Verify this is already handled (e.g., auth is applied per-route rather than globally) before considering this a blocker. If per-route auth is the pattern, this warning can be closed as-is.

---

## Info

### IN-01: `twilio_encryption_current_key` defaults to empty string — no dev warning

**File:** `app/core/config.py:41`

**Issue:**
`twilio_encryption_current_key` defaults to `""`. The `twilio_encryption_keys` property returns `{}` in this case. If a developer runs the webhook flow locally without setting this env var, `TwilioConfigService` will raise `TwilioConfigError("Twilio encryption is not configured")` which surfaces as an unhandled 500. A startup validation or at least a log warning when the keyring is empty would aid debugging.

**Fix:** Add a validator or log warning:
```python
@cached_property
def twilio_encryption_keys(self) -> dict[str, str]:
    ...
    result = {key_id: ...}
    if not result:
        import logging
        logging.getLogger(__name__).warning(
            "Twilio encryption keys not configured. Webhook signature "
            "validation will fail until TWILIO_ENCRYPTION_CURRENT_KEY is set."
        )
    return result
```

### IN-02: `WebhookEvent.created_at` has no ORM-side `default` — value missing until flush

**File:** `app/models/webhook_event.py:33`

**Issue:**
`created_at` relies solely on `server_default=func.now()`. Until the row is flushed/committed and refreshed, `instance.created_at` will be `None`. The `WebhookEventRead` schema declares `created_at: datetime` (not `datetime | None`), so serialising an unflushed instance would raise a validation error. This is low risk today because `check_idempotency` does not return the object, but it is a latent bug if the model is ever used in-process before flush.

**Fix:**
```python
from datetime import datetime, timezone

created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    default=lambda: datetime.now(timezone.utc),   # ORM-side default
)
```

### IN-03: Test classes use `async def` without `@pytest.mark.asyncio` or class-level marker

**File:** `tests/unit/test_twilio_webhook.py:56-288`

**Issue:**
All test methods are `async def` inside plain classes with no `@pytest.mark.asyncio` decorator (neither on the class nor the methods). The project's `pytest` config sets `asyncio_mode=auto`, which should handle this automatically. If `asyncio_mode=auto` is ever changed or the test is run in a context without that config, all tests will silently pass without executing (coroutines are never awaited). This is safe given the current config but worth noting.

**Fix:** If keeping `asyncio_mode=auto`, add a comment. Otherwise apply the decorator:
```python
@pytest.mark.asyncio
class TestUrlReconstruction:
    ...
```

---

_Reviewed: 2026-04-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
