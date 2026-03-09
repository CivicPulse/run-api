"""Shared test fixtures for JWT generation and test app."""

from __future__ import annotations

import base64
import time

import pytest
from authlib.jose import JsonWebKey, jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

from app.main import create_app

# --- RSA key pair for test JWT signing ---


def _generate_rsa_key_pair():
    """Generate an RSA key pair for test JWT signing."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem, private_key, public_key


PRIVATE_PEM, PUBLIC_PEM, PRIVATE_KEY, PUBLIC_KEY = _generate_rsa_key_pair()

# Generate a second key pair for "wrong key" tests
BAD_PRIVATE_PEM, BAD_PUBLIC_PEM, _, _ = _generate_rsa_key_pair()

TEST_KID = "test-key-id-1"
TEST_ISSUER = "https://auth.civpulse.org"
TEST_PROJECT_ID = "test-project-123"


def _int_to_base64url(n: int) -> str:
    """Convert an integer to base64url-encoded string."""
    byte_length = (n.bit_length() + 7) // 8
    return (
        base64.urlsafe_b64encode(n.to_bytes(byte_length, byteorder="big"))
        .rstrip(b"=")
        .decode("ascii")
    )


def build_jwks(public_key=None) -> dict:
    """Build a JWKS dict from the test public key."""
    if public_key is None:
        public_key = PUBLIC_KEY
    pub_numbers = public_key.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "kid": TEST_KID,
                "use": "sig",
                "alg": "RS256",
                "n": _int_to_base64url(pub_numbers.n),
                "e": _int_to_base64url(pub_numbers.e),
            }
        ]
    }


def make_jwt(
    sub: str = "user-123",
    org_id: str = "org-456",
    role: str = "admin",
    project_id: str = TEST_PROJECT_ID,
    issuer: str = TEST_ISSUER,
    exp_offset: int = 3600,
    private_pem: bytes = PRIVATE_PEM,
    kid: str = TEST_KID,
    include_org: bool = True,
    include_role: bool = True,
) -> str:
    """Generate a signed JWT for testing.

    Args:
        sub: Subject claim.
        org_id: Organization ID claim.
        role: Role name to include.
        project_id: ZITADEL project ID for role claim key.
        issuer: Token issuer.
        exp_offset: Seconds from now until expiry (negative for expired).
        private_pem: PEM-encoded private key for signing.
        kid: Key ID for JWT header.
        include_org: Whether to include org claim.
        include_role: Whether to include role claim.

    Returns:
        Signed JWT string.
    """
    now = int(time.time())
    header = {"alg": "RS256", "kid": kid}
    payload = {
        "sub": sub,
        "iss": issuer,
        "aud": [project_id],
        "iat": now,
        "exp": now + exp_offset,
        "email": f"{sub}@test.com",
        "name": f"Test User {sub}",
    }

    if include_org:
        payload["urn:zitadel:iam:user:resourceowner:id"] = org_id
        payload["urn:zitadel:iam:user:resourceowner:name"] = "Test Campaign"

    if include_role:
        role_claim_key = f"urn:zitadel:iam:org:project:{project_id}:roles"
        payload[role_claim_key] = {role: {org_id: "test.civpulse.org"}}

    # Use authlib to sign the JWT
    key = JsonWebKey.import_key(private_pem, {"kty": "RSA"})
    token = jwt.encode(header, payload, key)
    return token.decode("utf-8") if isinstance(token, bytes) else token


@pytest.fixture
def test_jwks():
    """Return test JWKS key set."""
    return build_jwks()


@pytest.fixture
def test_app():
    """Create a test FastAPI app instance."""
    return create_app()


@pytest.fixture
async def client(test_app):
    """Create an async test client."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
