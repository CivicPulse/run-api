"""Rate limiting with trusted proxy IP extraction and per-user keys."""

from __future__ import annotations

import base64
import json
from ipaddress import ip_address, ip_network

from fastapi import Request
from slowapi import Limiter

from app.core.config import settings


def _parse_trusted_networks() -> list:
    """Parse CIDR strings into ip_network objects (cached at import)."""
    return [ip_network(cidr) for cidr in settings.trusted_proxy_cidrs]


_trusted_networks = _parse_trusted_networks()


def _is_trusted_proxy(host: str) -> bool:
    """Check if host IP is in trusted proxy CIDR list."""
    try:
        addr = ip_address(host)
        return any(addr in net for net in _trusted_networks)
    except ValueError:
        return False


def get_real_ip(request: Request) -> str:
    """Extract real client IP, honoring CF-Connecting-IP from trusted proxies only.

    Per D-09: Only trust the header when request.client.host is in configured
    trusted proxy CIDRs. Fall back to request.client.host for untrusted sources.
    """
    client_host = request.client.host if request.client else "127.0.0.1"

    if _is_trusted_proxy(client_host):
        # Trust proxy headers in priority order
        real_ip = request.headers.get(
            "cf-connecting-ip"
        ) or request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

    return client_host


def get_user_or_ip_key(request: Request) -> str:
    """Extract user_id from JWT for per-user limiting, fallback to IP.

    For authenticated requests: returns "user:{user_id}" so rate limits
    track per-user regardless of IP rotation (OBS-04).
    For unauthenticated requests: returns the real client IP.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            # Decode WITHOUT verification -- we only need the sub claim
            # for rate limit keying. Auth middleware handles full validation.
            payload_b64 = token.split(".")[1]
            # Add padding
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass

    return get_real_ip(request)


limiter = Limiter(
    key_func=get_real_ip,
    default_limits=[settings.rate_limit_unauthenticated],
)
