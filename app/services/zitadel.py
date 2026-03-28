"""ZITADEL Management API client via httpx."""

from __future__ import annotations

import time
from urllib.parse import urlparse

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
        base_url: str = "",
    ) -> None:
        self.issuer = issuer.rstrip("/")
        self.base_url = base_url.rstrip("/") if base_url else self.issuer
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None
        self._token_expires_at: float = 0
        # Send Host header matching the issuer (with port)
        # when using an internal base URL
        issuer_host = urlparse(self.issuer).hostname or ""
        issuer_netloc = urlparse(self.issuer).netloc or ""
        base_host = urlparse(self.base_url).hostname or ""
        self._extra_headers: dict[str, str] = (
            {"Host": issuer_netloc} if base_host != issuer_host else {}
        )
        # Skip TLS verification for internal URLs where the cert hostname
        # doesn't match (e.g. Docker service name vs Tailscale FQDN)
        self._verify_tls = base_host == issuer_host

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
            async with httpx.AsyncClient(
                headers=self._extra_headers, verify=self._verify_tls
            ) as client:
                response = await client.post(
                    f"{self.base_url}/oauth/v2/token",
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
        except httpx.HTTPStatusError as exc:
            logger.error(
                "ZITADEL token request returned {}: {}",
                exc.response.status_code,
                exc.response.text[:200],
            )
            raise ZitadelUnavailableError(
                f"ZITADEL token exchange failed with status {exc.response.status_code}"
            ) from exc

        self._token = data["access_token"]
        self._token_expires_at = now + data.get("expires_in", 3600) - 60
        return self._token

    def _auth_headers(self, token: str) -> dict[str, str]:
        """Build authorization headers."""
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            **self._extra_headers,
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
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/orgs",
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

        The ``x-zitadel-orgid`` header is required so ZITADEL can locate orgs
        that were not created by the service account's own org context.

        Args:
            org_id: The ZITADEL organization ID.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            headers["x-zitadel-orgid"] = org_id
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/orgs/{org_id}/_deactivate",
                    headers=headers,
                )
                response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL deactivate_organization failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to deactivate organization"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code} "
                    "during deactivate_organization"
                ) from exc
            raise

    async def delete_organization(self, org_id: str) -> None:
        """Delete a ZITADEL organization (compensating transaction only).

        The ``x-zitadel-orgid`` header is required so ZITADEL can locate orgs
        that were not created by the service account's own org context.

        Args:
            org_id: The ZITADEL organization ID.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            headers["x-zitadel-orgid"] = org_id
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.delete(
                    f"{self.base_url}/management/v1/orgs/{org_id}",
                    headers=headers,
                )
                response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL delete_organization failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to delete organization"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code} "
                    "during delete_organization"
                ) from exc
            raise

    async def assign_project_role(
        self,
        project_id: str,
        user_id: str,
        role: str,
        *,
        project_grant_id: str | None = None,
        org_id: str | None = None,
    ) -> None:
        """Assign a project role to a user within an organization.

        Args:
            project_id: The ZITADEL project ID.
            user_id: The ZITADEL user ID.
            role: The role key to assign.
            project_grant_id: Optional project grant ID to scope the role assignment
                to a specific granted organization.
            org_id: Optional organization ID. When provided, sets the
                ``x-zitadel-orgid`` header so the request is scoped to that org.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            if org_id:
                headers["x-zitadel-orgid"] = org_id
            body: dict = {
                "projectId": project_id,
                "roleKeys": [role],
            }
            if project_grant_id:
                body["projectGrantId"] = project_grant_id
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/users/{user_id}/grants",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL assign_project_role failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to assign project role"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 409:
                # Grant already exists — treat as success
                logger.debug(
                    "Project role grant already exists for user {}",
                    user_id,
                )
                return
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code}"
                ) from exc
            raise

    async def remove_project_role(
        self,
        project_id: str,
        user_id: str,
        role: str,
        *,
        org_id: str | None = None,
        project_grant_id: str | None = None,
    ) -> None:
        """Remove a project role grant from a user.

        Args:
            project_id: The ZITADEL project ID.
            user_id: The ZITADEL user ID.
            role: The role key to remove (used to find the grant).
            org_id: Optional organization ID. When provided, sets the
                ``x-zitadel-orgid`` header so the request is scoped to that org.
            project_grant_id: Optional project grant ID. When provided, only
                grants matching this ID are considered for removal.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            if org_id:
                headers["x-zitadel-orgid"] = org_id
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                # List grants to find the one to remove
                response = await client.post(
                    f"{self.base_url}/management/v1/users/{user_id}/grants/_search",
                    headers=headers,
                    json={"queries": [{"projectIdQuery": {"projectId": project_id}}]},
                )
                response.raise_for_status()
                grants = response.json().get("result", [])

                # Scope to a specific project grant when provided
                if project_grant_id:
                    grants = [
                        g
                        for g in grants
                        if g.get("grantId") == project_grant_id
                        or g.get("id") == project_grant_id
                    ]

                matched = False
                for grant in grants:
                    if role in grant.get("roleKeys", []):
                        matched = True
                        grant_id = grant["id"]
                        del_resp = await client.delete(
                            f"{self.base_url}/management/v1/users/{user_id}/grants/{grant_id}",
                            headers=headers,
                        )
                        del_resp.raise_for_status()

                if not matched:
                    logger.warning(
                        "No grant with role '{}' found for user {} in project {} "
                        "(found {} grants, none matched)",
                        role,
                        user_id,
                        project_id,
                        len(grants),
                    )
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL remove_project_role failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to remove project role"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code}"
                ) from exc
            raise

    async def remove_all_project_roles(
        self,
        project_id: str,
        user_id: str,
        *,
        org_id: str | None = None,
    ) -> None:
        """Remove ALL project role grants for a user.

        Unlike :meth:`remove_project_role` which targets a specific role key,
        this removes every grant the user has in the project.  Used when fully
        removing a member so no stale grants remain.

        Args:
            project_id: The ZITADEL project ID.
            user_id: The ZITADEL user ID.
            org_id: Optional organization ID for scoping.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            if org_id:
                headers["x-zitadel-orgid"] = org_id
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/users/{user_id}/grants/_search",
                    headers=headers,
                    json={"queries": [{"projectIdQuery": {"projectId": project_id}}]},
                )
                response.raise_for_status()
                grants = response.json().get("result", [])

                for grant in grants:
                    grant_id = grant["id"]
                    del_resp = await client.delete(
                        f"{self.base_url}/management/v1/users/{user_id}/grants/{grant_id}",
                        headers=headers,
                    )
                    del_resp.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL remove_all_project_roles failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to remove project roles"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code}"
                ) from exc
            raise

    async def create_project_grant(
        self,
        project_id: str,
        granted_org_id: str,
        role_keys: list[str],
    ) -> dict:
        """Create a project grant for an organization.

        Args:
            project_id: The ZITADEL project ID.
            granted_org_id: The org receiving the grant.
            role_keys: List of role keys to grant.

        Returns:
            Dict with grant details including ``grantId``.

        Raises:
            ZitadelUnavailableError: On connection error or 5xx.
        """
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/projects/{project_id}/grants",
                    headers=headers,
                    json={
                        "grantedOrgId": granted_org_id,
                        "roleKeys": role_keys,
                    },
                )
                response.raise_for_status()
                return response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL create_project_grant failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to create project grant"
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise ZitadelUnavailableError(
                    f"ZITADEL returned {exc.response.status_code}"
                ) from exc
            raise

    async def ensure_project_grant(
        self,
        project_id: str,
        granted_org_id: str,
        role_keys: list[str],
    ) -> str:
        """Ensure a project grant exists (idempotent).

        Tries to create the grant first. If it already exists (409 Conflict),
        searches for the existing grant and returns its ID.

        Args:
            project_id: The ZITADEL project ID.
            granted_org_id: The org receiving the grant.
            role_keys: List of role keys to grant.

        Returns:
            The project grant ID (existing or newly created).
        """
        # Try creating first — most calls will be for new orgs
        try:
            result = await self.create_project_grant(
                project_id, granted_org_id, role_keys
            )
            return result["grantId"]
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 409:
                raise
            # Grant already exists — search for it
            logger.debug(
                "Project grant creation returned {}, searching for existing grant",
                exc.response.status_code,
            )

        # Fall back to listing all grants and filtering client-side
        try:
            token = await self._get_token()
            headers = self._auth_headers(token)
            async with httpx.AsyncClient(verify=self._verify_tls) as client:
                response = await client.post(
                    f"{self.base_url}/management/v1/projects/{project_id}/grants/_search",
                    headers=headers,
                    json={},
                )
                response.raise_for_status()
                for grant in response.json().get("result", []):
                    if grant.get("grantedOrgId") == granted_org_id:
                        return grant["grantId"]
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("ZITADEL ensure_project_grant search failed: {}", exc)
            raise ZitadelUnavailableError(
                "Cannot reach ZITADEL to search project grants"
            ) from exc

        # If we still can't find it, try creating again and let it raise
        result = await self.create_project_grant(project_id, granted_org_id, role_keys)
        return result["grantId"]
