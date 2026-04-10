"""Sentry SDK initialization with PII scrubbing and health-check exclusion."""

from __future__ import annotations

import re
from typing import Any

from app.core.observability import campaign_id_var, request_id_var, user_id_var

PHONE_RE = re.compile(r"\b(\+?1?\d{10,15})\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
MAILGUN_KEY_RE = re.compile(r"\bkey-[A-Za-z0-9]+\b")
AUTH_HEADER_RE = re.compile(r"(?i)\b(?:basic|bearer)\s+[A-Za-z0-9+/=._-]+\b")


def _scrub_string(value: str) -> str:
    """Replace phone numbers and emails in a string."""
    value = PHONE_RE.sub("[REDACTED_PHONE]", value)
    value = EMAIL_RE.sub("[REDACTED_EMAIL]", value)
    value = MAILGUN_KEY_RE.sub("[REDACTED_SECRET]", value)
    return AUTH_HEADER_RE.sub("[REDACTED_AUTH]", value)


def scrub_pii(event: dict[str, Any], hint: Any) -> dict[str, Any]:  # noqa: ARG001
    """Remove PII from Sentry events and attach request context tags."""
    # Scrub exception values
    if "exception" in event:
        for exc_info in event["exception"].get("values", []):
            if "value" in exc_info and isinstance(exc_info["value"], str):
                exc_info["value"] = _scrub_string(exc_info["value"])

    # Scrub breadcrumb messages
    if "breadcrumbs" in event:
        for breadcrumb in event["breadcrumbs"].get("values", []):
            if "message" in breadcrumb and isinstance(breadcrumb["message"], str):
                breadcrumb["message"] = _scrub_string(breadcrumb["message"])

    # Scrub extra string values
    for key, val in event.get("extra", {}).items():
        if isinstance(val, str):
            event["extra"][key] = _scrub_string(val)

    # Attach context tags from ContextVars
    tags = event.setdefault("tags", {})
    req_id = request_id_var.get("")
    if req_id:
        tags["request_id"] = req_id
    uid = user_id_var.get("")
    if uid:
        tags["user_id"] = uid
    cid = campaign_id_var.get("")
    if cid:
        tags["campaign_id"] = cid

    return event


def _traces_sampler(sampling_context: dict[str, Any]) -> float:
    """Return 0.0 for health-check paths, configured rate for others."""
    from app.core.config import settings

    asgi_scope = sampling_context.get("asgi_scope", {})
    path = asgi_scope.get("path", "")
    if path.startswith("/health"):
        return 0.0
    return settings.sentry_traces_sample_rate


def init_sentry() -> None:
    """Initialize Sentry SDK if SENTRY_DSN is configured; no-op otherwise."""
    from app.core.config import settings

    if not settings.sentry_dsn:
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sampler=_traces_sampler,
        environment=settings.environment,
        before_send=scrub_pii,
        send_default_pii=False,
        enable_tracing=True,
        integrations=[FastApiIntegration()],
    )
