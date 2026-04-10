"""JWT validation, JWKS management, and role enforcement.

Uses Authlib for JWT/JWKS validation against ZITADEL OIDC.
"""

from __future__ import annotations

import uuid
from enum import IntEnum, StrEnum

import httpx
import sqlalchemy.exc
from authlib.jose import JsonWebKey, jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


class CampaignRole(IntEnum):
    """Role hierarchy -- higher value = more permissions."""

    VIEWER = 0
    VOLUNTEER = 1
    MANAGER = 2
    ADMIN = 3
    OWNER = 4


class OrgRole(StrEnum):
    """Organization-level roles (not campaign-specific)."""

    ORG_OWNER = "org_owner"
    ORG_ADMIN = "org_admin"


ORG_ROLE_CAMPAIGN_EQUIVALENT: dict[OrgRole, CampaignRole] = {
    OrgRole.ORG_ADMIN: CampaignRole.ADMIN,
    OrgRole.ORG_OWNER: CampaignRole.OWNER,
}

ORG_ROLE_LEVELS: dict[OrgRole, int] = {
    OrgRole.ORG_ADMIN: 0,
    OrgRole.ORG_OWNER: 1,
}


class AuthenticatedUser(BaseModel):
    """Authenticated user context extracted from JWT claims."""

    id: str
    org_id: str
    org_ids: list[str] = []
    role: CampaignRole
    email: str | None = None
    display_name: str | None = None


class JWKSManager:
    """Manages JWKS fetching with caching and key rotation support."""

    def __init__(self, issuer: str, base_url: str = "") -> None:
        self.issuer = issuer
        self._base_url = base_url.rstrip("/") if base_url else issuer
        self.oidc_config_url = f"{self._base_url}/.well-known/openid-configuration"
        self._jwks: dict | None = None
        self._jwks_uri: str | None = None
        # Skip TLS verification for internal URLs where the cert hostname
        # doesn't match (e.g. Docker service name vs Tailscale FQDN)
        from urllib.parse import urlparse

        base_host = urlparse(self._base_url).hostname or ""
        issuer_host = urlparse(self.issuer).hostname or ""
        issuer_netloc = urlparse(self.issuer).netloc or ""
        self._verify_tls = base_host == issuer_host
        # Send Host header matching the issuer (with port)
        # when using an internal base URL
        self._extra_headers: dict[str, str] = (
            {"Host": issuer_netloc} if base_host != issuer_host else {}
        )

    async def get_jwks(self, force_refresh: bool = False) -> dict:
        """Fetch JWKS, using cache unless force_refresh.

        Args:
            force_refresh: Force re-fetching from ZITADEL.

        Returns:
            The JWKS key set as a dict.
        """
        if self._jwks is not None and not force_refresh:
            return self._jwks

        async with httpx.AsyncClient(
            verify=self._verify_tls, headers=self._extra_headers
        ) as client:
            if self._jwks_uri is None or force_refresh:
                oidc_resp = await client.get(self.oidc_config_url)
                oidc_resp.raise_for_status()
                oidc_config = oidc_resp.json()
                jwks_uri = oidc_config["jwks_uri"]
                # Rewrite JWKS URI to use internal base_url when it differs
                # from the public issuer (e.g. Docker container networking)
                if self._base_url != self.issuer:
                    jwks_uri = jwks_uri.replace(self.issuer, self._base_url)
                self._jwks_uri = jwks_uri

            jwks_resp = await client.get(self._jwks_uri)
            jwks_resp.raise_for_status()
            self._jwks = jwks_resp.json()

        logger.debug("JWKS refreshed from {}", self._jwks_uri)
        return self._jwks

    async def validate_token(self, token: str) -> dict:
        """Validate JWT, refreshing JWKS on unknown kid.

        Args:
            token: The raw JWT string.

        Returns:
            Validated claims as a dict.

        Raises:
            Exception: If token validation fails after JWKS refresh.
        """
        jwks = await self.get_jwks()
        try:
            key_set = JsonWebKey.import_key_set(jwks)
            claims = jwt.decode(token, key_set)
            claims.validate()
            return dict(claims)
        except Exception:
            # Unknown kid or other decode failure -- try refreshing JWKS
            logger.debug("JWT decode failed, refreshing JWKS and retrying")
            jwks = await self.get_jwks(force_refresh=True)
            key_set = JsonWebKey.import_key_set(jwks)
            claims = jwt.decode(token, key_set)
            claims.validate()
            return dict(claims)


def _extract_role(claims: dict, project_id: str | None = None) -> CampaignRole:
    """Extract role from ZITADEL nested claim structure.

    ZITADEL encodes roles as:
    ``urn:zitadel:iam:org:project:{projectId}:roles: {"admin": {"org-id": "domain"}}``

    Args:
        claims: Decoded JWT claims dict.
        project_id: ZITADEL project ID. Uses settings if not provided.

    Returns:
        The highest matching CampaignRole, defaulting to VIEWER.
    """
    if project_id is None:
        project_id = settings.zitadel_project_id

    role_claim_key = f"urn:zitadel:iam:org:project:{project_id}:roles"
    roles_obj = claims.get(role_claim_key, {})

    if not roles_obj:
        return CampaignRole.VIEWER

    # Find the highest role present in the claims
    best_role = CampaignRole.VIEWER
    for role_name in roles_obj:
        try:
            role = CampaignRole[role_name.upper()]
            if role > best_role:
                best_role = role
        except KeyError:
            logger.warning("Unknown role in JWT: {}", role_name)
            continue

    return best_role


async def resolve_campaign_role(
    user_id: str,
    campaign_id: uuid.UUID,
    db: AsyncSession,
    jwt_role: CampaignRole,
    user_org_id: str | None = None,
) -> CampaignRole | None:
    """Resolve the effective role for a user in a specific campaign.

    Resolution order:
    1. Explicit per-campaign ``CampaignMember.role`` (NULL treated as VIEWER).
    2. ``OrganizationMember``-derived campaign-equivalent role.
    3. Additive ``max()`` of both (D-08).
    4. ``None`` (deny) when neither source grants access (D-07: JWT
       fallback removed).

    Args:
        user_id: The user's ZITADEL ID.
        campaign_id: The campaign UUID.
        db: Async database session.
        jwt_role: The org-level role extracted from JWT (kept for signature
            compatibility but no longer used as a fallback).
        user_org_id: The user's ZITADEL organization ID from the JWT.

    Returns:
        The resolved ``CampaignRole``, or ``None`` to deny access.
    """
    from app.models.campaign import Campaign
    from app.models.campaign_member import CampaignMember
    from app.models.organization import Organization
    from app.models.organization_member import OrganizationMember

    # 1. Explicit CampaignMember role (NULL role = VIEWER for backward compat)
    explicit_campaign_role: CampaignRole | None = None
    member = await db.scalar(
        select(CampaignMember).where(
            CampaignMember.user_id == user_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    if member is not None:
        if member.role:
            try:
                explicit_campaign_role = CampaignRole[member.role.upper()]
            except KeyError:
                logger.warning(
                    "Unknown per-campaign role '{}' for user {}",
                    member.role,
                    user_id,
                )
                explicit_campaign_role = CampaignRole.VIEWER
        else:
            # NULL role treated as VIEWER for backward compatibility
            explicit_campaign_role = CampaignRole.VIEWER

    # 2. Org role lookup -- find campaign's org, check OrganizationMember
    org_derived_role: CampaignRole | None = None
    if user_org_id:
        campaign = await db.scalar(select(Campaign).where(Campaign.id == campaign_id))
        if campaign is not None and campaign.organization_id is not None:
            # Resolve effective org ID via Organization FK
            effective_org_id: str | None = await db.scalar(
                select(Organization.zitadel_org_id).where(
                    Organization.id == campaign.organization_id
                )
            )
            if not effective_org_id:
                effective_org_id = campaign.zitadel_org_id

            if effective_org_id and effective_org_id == user_org_id:
                # User's org matches campaign's org -- check org membership
                org_member_role = await db.scalar(
                    select(OrganizationMember.role).where(
                        OrganizationMember.user_id == user_id,
                        OrganizationMember.organization_id == campaign.organization_id,
                    )
                )
                if org_member_role:
                    try:
                        org_role = OrgRole(org_member_role)
                        org_derived_role = ORG_ROLE_CAMPAIGN_EQUIVALENT[org_role]
                    except (ValueError, KeyError):
                        pass

    # 3. Additive resolution: max of explicit campaign + org-derived (D-08)
    roles = [r for r in [explicit_campaign_role, org_derived_role] if r is not None]
    if roles:
        return max(roles)

    # 4. Deny -- no CampaignMember AND no OrganizationMember
    #    (D-07: JWT fallback dropped)
    return None


bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Extract and validate JWT, return authenticated user context.

    Args:
        request: The FastAPI request (provides access to app state).
        credentials: Bearer token from Authorization header.

    Returns:
        AuthenticatedUser with claims extracted from the token.

    Raises:
        HTTPException: 401 if token validation fails.
    """
    token = credentials.credentials
    try:
        claims = await request.app.state.jwks_manager.validate_token(token)
    except Exception as exc:
        logger.debug("JWT validation failed: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    org_id = claims.get("urn:zitadel:iam:user:resourceowner:id")

    # Collect ALL org IDs the user has access to from project role claims.
    # In ZITADEL multi-tenant setups, resourceowner:id is the user's home
    # org (e.g. the platform org), while tenant orgs appear in role grants.
    all_org_ids: set[str] = set()
    project_id = settings.zitadel_project_id
    role_claim_key = f"urn:zitadel:iam:org:project:{project_id}:roles"
    roles_obj = claims.get(role_claim_key, {})
    for _role_name, org_map in roles_obj.items():
        if isinstance(org_map, dict):
            all_org_ids.update(org_map.keys())

    if not org_id:
        # Fallback: use first org from role claims
        org_id = next(iter(all_org_ids), None)
    if not org_id:
        logger.warning("JWT missing organization claim for sub={}", claims.get("sub"))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing organization claim",
        )

    if org_id not in all_org_ids:
        all_org_ids.add(org_id)

    email = claims.get("email")
    display_name = claims.get("name") or claims.get("preferred_username")

    # ZITADEL access tokens don't carry profile claims (email, name) —
    # fetch them from the userinfo endpoint when missing.
    if not email or not display_name:
        try:
            userinfo_base = settings.zitadel_base_url or settings.zitadel_issuer
            # Send Host header matching the issuer for internal base URLs
            from urllib.parse import urlparse as _urlparse

            _issuer_host = _urlparse(settings.zitadel_issuer).hostname or ""
            _issuer_netloc = _urlparse(settings.zitadel_issuer).netloc or ""
            _base_host = _urlparse(userinfo_base).hostname or ""
            _headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
            _verify_tls = _base_host == _issuer_host
            if _base_host != _issuer_host:
                _headers["Host"] = _issuer_netloc
            async with httpx.AsyncClient(verify=_verify_tls) as client:
                userinfo_resp = await client.get(
                    f"{userinfo_base}/oidc/v1/userinfo",
                    headers=_headers,
                    timeout=5.0,
                )
                if userinfo_resp.status_code == 200:
                    userinfo = userinfo_resp.json()
                    email = email or userinfo.get("email")
                    display_name = (
                        display_name
                        or userinfo.get("name")
                        or userinfo.get("preferred_username")
                    )
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Userinfo endpoint returned {}: {}",
                exc.response.status_code,
                exc.response.text[:200],
            )
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.debug("Userinfo endpoint unreachable: {}", exc)
        except Exception:
            logger.debug("Failed to fetch userinfo, proceeding without profile data")

    return AuthenticatedUser(
        id=claims["sub"],
        org_id=org_id,
        org_ids=sorted(all_org_ids),
        role=_extract_role(claims),
        email=email,
        display_name=display_name or email,
    )


async def get_optional_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
) -> AuthenticatedUser | None:
    """Return the authenticated user when a bearer token is present."""
    if credentials is None:
        return None
    return await get_current_user(request, credentials)


def require_role(minimum: str):
    """FastAPI dependency factory that enforces minimum role level.

    When the request URL contains a ``campaign_id`` path parameter, the
    effective role is resolved from the ``CampaignMember.role`` column
    (per-campaign override) before falling back to the org-level JWT role.

    Args:
        minimum: The minimum role name (e.g., "manager", "admin").

    Returns:
        A FastAPI dependency function.
    """
    min_level = CampaignRole[minimum.upper()]

    from app.db.session import get_db

    async def _check_role(
        request: Request,
        current_user: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthenticatedUser:
        from app.api.deps import ensure_user_synced

        # Ensure local User + CampaignMember records exist before
        # checking membership.  Without this, first-time users who
        # hit a campaign endpoint get 403 because resolve_campaign_role
        # finds no CampaignMember row yet.  (Mirrors the pattern
        # already used in require_org_role.)
        await ensure_user_synced(current_user, db)

        effective_role = current_user.role

        # Resolve per-campaign role if campaign_id is in the path
        campaign_id_str = request.path_params.get("campaign_id")
        if campaign_id_str:
            try:
                campaign_id = uuid.UUID(campaign_id_str)
                effective_role = await resolve_campaign_role(
                    current_user.id,
                    campaign_id,
                    db,
                    current_user.role,
                    user_org_id=current_user.org_id,
                )
                if effective_role is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions",
                    )
            except (ValueError, TypeError):
                logger.debug("Invalid campaign_id format in path: {}", campaign_id_str)
            except HTTPException:
                raise
            except (sqlalchemy.exc.OperationalError, sqlalchemy.exc.DatabaseError):
                # DB unavailable — deny access rather than falling
                # back to JWT role
                logger.warning(
                    "Per-campaign role resolution failed (DB error), denying access"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions",
                ) from None

        if effective_role < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        # Update user object with resolved role so downstream code sees the right role
        current_user = current_user.model_copy(update={"role": effective_role})
        return current_user

    return _check_role


def require_org_role(minimum: str):
    """FastAPI dependency factory that enforces minimum org-level role.

    Validates the user's JWT org_id against a DB Organization record,
    then checks OrganizationMember for the required role level.
    Org endpoints use get_db() (no campaign RLS) per D-13.

    Args:
        minimum: The minimum org role name ("org_admin" or "org_owner").

    Returns:
        A FastAPI dependency function.
    """
    min_org_role = OrgRole(minimum)

    from app.db.session import get_db  # noqa: F811

    async def _check_org_role(
        current_user: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthenticatedUser:
        from app.api.deps import ensure_user_synced
        from app.models.organization import Organization
        from app.models.organization_member import OrganizationMember

        # Ensure local User + OrganizationMember records exist before
        # checking membership (org endpoints may be hit before any
        # campaign endpoint triggers ensure_user_synced).
        await ensure_user_synced(current_user, db)

        # Find org by JWT org_id first; fall back to any org the user
        # has access to via project role grants (multi-tenant support).
        org = await db.scalar(
            select(Organization).where(
                Organization.zitadel_org_id == current_user.org_id
            )
        )
        if not org and current_user.org_ids:
            org = await db.scalar(
                select(Organization).where(
                    Organization.zitadel_org_id.in_(current_user.org_ids)
                )
            )
        if not org:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization not found",
            )

        # Check OrganizationMember (D-12)
        org_member_role = await db.scalar(
            select(OrganizationMember.role).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.organization_id == org.id,
            )
        )
        if not org_member_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        # Validate role level
        try:
            user_org_role = OrgRole(org_member_role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            ) from None

        if ORG_ROLE_LEVELS[user_org_role] < ORG_ROLE_LEVELS[min_org_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        # Update org_id to the resolved org so downstream endpoint code
        # that re-queries by user.org_id finds the correct org.
        if org.zitadel_org_id != current_user.org_id:
            current_user = current_user.model_copy(
                update={"org_id": org.zitadel_org_id}
            )

        return current_user

    return _check_org_role
