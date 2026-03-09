"""ZITADEL Management API client via httpx."""

from __future__ import annotations

import time

import httpx
from loguru import logger

from app.core.errors import ZitadelUnavailableError


class ZitadelService:
    """Client for ZITADEL Management API operations.

    Handles org lifecycle, project role management, and authentication
    via client_credentials grant.
    """

    def __init__(
        self,
        issuer: str,
        client_id: str,
        client_secret: str,
    ) -> None:
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None
        self._token_expires_at: float = 0

    async def _get_token(self) -> str:
        """Get a service account token via client_credentials grant.

        Caches token and refreshes when expired.

        Returns:
            Bearer access token string.

        Raises:
            ZitadelUnavailableError: If ZITADEL is unreachable.
        """
        now = time.time()
        if self._token and now < self._token_expires_at:
            return self._token

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.issuer}/oauth/v2/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "scope": "openid urn:zitadel:iam:org:project:id:zitadel:aud",
                    },
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL token request failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL for token exchange"
            ) from exc

        self._token = data["access_token"]
        self._token_expires_at = now + data.get("expires_in", 3600) - 60
        return self._token

    def _auth_headers(self, token: str) -> dict[str, str]:
        """Build authorization headers."""
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def create_organization(self, name: str) -> dict:
        """Create a new ZITADEL organization.

        Args:
            name: Organization display name.

        Returns:
            Dict with at least an 'id' field for the new org.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.issuer}/management/v1/orgs",
                    headers=self._auth_headers(token),
                    json={"name": name},
                )
                response.raise_for_status()
                return response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL create_organization failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to create organization"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code}"
                ) from exc
            raise

    async def deactivate_organization(self, org_id: str) -> None:
        """Deactivate a ZITADEL organization (soft-delete).

        Args:
            org_id: The ZITADEL organization ID.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.issuer}/management/v1/orgs/{org_id}/_deactivate",
                    headers=self._auth_headers(token),
                )
                response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL deactivate_organization failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to deactivate organization"
            ) from exc

    async def delete_organization(self, org_id: str) -> None:
        """Delete a ZITADEL organization (compensating transaction only).

        Args:
            org_id: The ZITADEL organization ID.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.issuer}/management/v1/orgs/{org_id}",
                    headers=self._auth_headers(token),
                )
                response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL delete_organization failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to delete organization"
            ) from exc

    async def assign_project_role(
        self, org_id: str, user_id: str, role: str
    ) -> None:
        """Assign a project role to a user within an organization.

        Args:
            org_id: The ZITADEL organization ID.
            user_id: The ZITADEL user ID.
            role: The role key to assign.
        """
        token = await self._get_token()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.issuer}/management/v1/users/{user_id}/grants",
                headers=self._auth_headers(token),
                json={
                    "projectId": org_id,
                    "roleKeys": [role],
                },
            )
            response.raise_for_status()

    async def remove_project_role(
        self, org_id: str, user_id: str, role: str  # noqa: ARG002
    ) -> None:
        """Remove a project role grant from a user.

        Args:
            org_id: The ZITADEL organization ID.
            user_id: The ZITADEL user ID.
            role: The role key to remove (used to find the grant).
        """
        token = await self._get_token()
        async with httpx.AsyncClient() as client:
            # List grants to find the one to remove
            response = await client.post(
                f"{self.issuer}/management/v1/users/{user_id}/grants/_search",
                headers=self._auth_headers(token),
                json={"queries": [{"projectIdQuery": {"projectId": org_id}}]},
            )
            response.raise_for_status()
            grants = response.json().get("result", [])

            for grant in grants:
                if role in grant.get("roleKeys", []):
                    grant_id = grant["id"]
                    del_resp = await client.delete(
                        f"{self.issuer}/management/v1/users/{user_id}/grants/{grant_id}",
                        headers=self._auth_headers(token),
                    )
                    del_resp.raise_for_status()
