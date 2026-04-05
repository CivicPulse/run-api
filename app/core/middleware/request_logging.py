"""Structured request logging middleware using structlog."""

from __future__ import annotations

import contextlib
import re
import time
import uuid
from typing import Any

import sentry_sdk
import structlog

from app.core.observability import (
    campaign_id_var,
    request_id_var,
    user_id_var,
)
from app.core.rate_limit import _is_trusted_proxy  # noqa: PLC2701

# Campaign UUID extraction from URL path
_CAMPAIGN_PATH_RE = re.compile(r"/api/v1/campaigns/([0-9a-f-]{36})")

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

_logger = structlog.get_logger()


def _get_header(headers: list[tuple[bytes, bytes]], name: bytes) -> str | None:
    """Extract a header value from raw ASGI headers."""
    for key, value in headers:
        if key.lower() == name:
            return value.decode("latin-1")
    return None


class StructlogMiddleware:
    """Pure ASGI middleware for structured request logging."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Any,
        send: Any,
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")

        # Skip health check endpoints
        if path.startswith("/health"):
            await self.app(scope, receive, send)
            return

        headers = scope.get("headers", [])

        # Request ID: honor incoming or generate
        request_id = _get_header(headers, b"x-request-id") or uuid.uuid4().hex
        request_id_var.set(request_id)

        # Extract campaign_id from URL path
        match = _CAMPAIGN_PATH_RE.search(path)
        if match:
            campaign_id_var.set(match.group(1))

        # Extract client metadata
        user_agent = _get_header(headers, b"user-agent") or ""
        scope_client = scope.get("client") or ("",)
        scope_client_ip = scope_client[0] if scope_client else ""
        if scope_client_ip and _is_trusted_proxy(scope_client_ip):
            client_ip = (
                _get_header(headers, b"cf-connecting-ip")
                or _get_header(headers, b"x-real-ip")
                or scope_client_ip
            )
        else:
            client_ip = scope_client_ip

        start = time.perf_counter()
        status_code = 500
        content_length = 0

        async def send_wrapper(message: dict[str, Any]) -> None:
            nonlocal status_code, content_length
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
                # Inject X-Request-ID response header
                resp_headers = list(message.get("headers", []))
                resp_headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": resp_headers}
                # Extract content-length if present
                for k, v in resp_headers:
                    if k.lower() == b"content-length":
                        with contextlib.suppress(ValueError, TypeError):
                            content_length = int(v)
                        break
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            query_params = scope.get("query_string", b"").decode("latin-1")

            # Set Sentry tags
            sentry_sdk.set_tag("request_id", request_id)
            uid = user_id_var.get("")
            if uid:
                sentry_sdk.set_tag("user_id", uid)
            cid = campaign_id_var.get("")
            if cid:
                sentry_sdk.set_tag("campaign_id", cid)
            sentry_sdk.set_tag("http_path", path)

            _logger.info(
                "request",
                request_id=request_id,
                user_id=user_id_var.get(""),
                campaign_id=campaign_id_var.get(""),
                method=scope.get("method", ""),
                path=path,
                status_code=status_code,
                duration_ms=duration_ms,
                query_params=query_params,
                response_size=content_length,
                client_ip=client_ip,
                user_agent=user_agent,
            )
