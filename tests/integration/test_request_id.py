"""UAT: X-Request-ID response header verification (Phase 40 OBS-02).

Tests that the request logging middleware:
1. Returns X-Request-ID in response headers
2. Echoes back client-provided X-Request-ID
3. Generates a new UUID when no X-Request-ID is sent
"""

import re
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

UUID_HEX_RE = re.compile(r"^[a-f0-9]{32}$")


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.mark.integration
class TestRequestIdHeader:
    async def test_response_includes_request_id_header(self, client: AsyncClient):
        """Non-health endpoint returns X-Request-ID in response headers."""
        resp = await client.get("/api/v1/org", headers={"Authorization": "Bearer fake"})
        # We don't care about auth — just that the middleware runs
        request_id = resp.headers.get("x-request-id")
        assert request_id is not None, "X-Request-ID header missing from response"
        assert UUID_HEX_RE.match(request_id), f"Expected UUID hex, got: {request_id}"

    async def test_echoes_client_provided_request_id(self, client: AsyncClient):
        """When client sends X-Request-ID, the same value is echoed back."""
        custom_id = uuid.uuid4().hex
        resp = await client.get(
            "/api/v1/org",
            headers={
                "Authorization": "Bearer fake",
                "X-Request-ID": custom_id,
            },
        )
        assert resp.headers.get("x-request-id") == custom_id

    async def test_health_endpoint_excluded(self, client: AsyncClient):
        """Health check endpoints skip request logging middleware."""
        resp = await client.get("/health")
        # Health endpoints may or may not include X-Request-ID
        # The key behavior is that they return 200 and don't log
        assert resp.status_code == 200
