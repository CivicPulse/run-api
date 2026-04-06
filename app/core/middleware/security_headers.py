"""Security headers and HTTPS-redirect middleware."""

from __future__ import annotations

from starlette.datastructures import Headers
from starlette.responses import RedirectResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "connect-src 'self' https: wss:"
)
_HSTS = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware:
    """Apply defense-in-depth response headers and optional HTTPS redirects."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        forwarded_proto = headers.get("x-forwarded-proto")
        scheme = forwarded_proto or scope.get("scheme", "http")

        if settings.environment == "production" and forwarded_proto == "http":
            host = headers.get("host")
            if host:
                query = scope.get("query_string", b"").decode()
                path = scope.get("raw_path", scope.get("path", "/")).decode()
                url = f"https://{host}{path}"
                if query:
                    url = f"{url}?{query}"
                response = RedirectResponse(url=url, status_code=307)
                await response(scope, receive, send)
                return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = Headers(raw=message.get("headers", []))
                updated = list(message.get("headers", []))

                def add_header(name: bytes, value: str) -> None:
                    if response_headers.get(name.decode()) is None:
                        updated.append((name, value.encode()))

                add_header(b"content-security-policy", _CSP)
                add_header(b"x-frame-options", "DENY")
                add_header(b"x-content-type-options", "nosniff")
                if settings.environment == "production" and scheme == "https":
                    add_header(b"strict-transport-security", _HSTS)
                message["headers"] = updated
            await send(message)

        await self.app(scope, receive, send_with_headers)
