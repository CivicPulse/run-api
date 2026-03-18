"""JWT validation, JWKS management, and role enforcement.

Uses Authlib for JWT/JWKS validation against ZITADEL OIDC.
"""

from __future__ import annotations

import uuid
from enum import IntEnum

import httpx
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


class AuthenticatedUser(BaseModel):
    """Authenticated user context extracted from JWT claims."""

    id: str
    org_id: str
    role: CampaignRole
    email: str | None = None
    display_name: str | None = None


class JWKSManager:
    """Manages JWKS fetching with caching and key rotation support."""

    def __init__(self, issuer: str) -> None:
        self.issuer = issuer
        self.oidc_config_url = f"{issuer}/.well-known/openid-configuration"
        self._jwks: dict | None = None
        self._jwks_uri: str | None = None

    async def get_jwks(self, force_refresh: bool = False) -> dict:
        """Fetch JWKS, using cache unless force_refresh.

        Args:
            force_refresh: Force re-fetching from ZITADEL.

        Returns:
            The JWKS key set as a dict.
        """
        if self._jwks is not None and not force_refresh:
            return self._jwks

        async with httpx.AsyncClient() as client:
            if self._jwks_uri is None or force_refresh:
                oidc_resp = await client.get(self.oidc_config_url)
                oidc_resp.raise_for_status()
                oidc_config = oidc_resp.json()
                self._jwks_uri = oidc_config["jwks_uri"]

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
) -> CampaignRole:
    """Resolve the effective role for a user in a specific campaign.

    Resolution order:
    1. Explicit per-campaign role stored in ``CampaignMember.role``.
    2. JWT role, if the campaign's ZITADEL org matches the user's current org.
    3. VIEWER (deny) for cross-org access with no explicit grant.

    Args:
        user_id: The user's ZITADEL ID.
        campaign_id: The campaign UUID.
        db: Async database session.
        jwt_role: The org-level role extracted from JWT.
        user_org_id: The user's ZITADEL organization ID from the JWT.  When
            provided it is used to verify that the user belongs to the campaign
            org before honouring the JWT role.  Old campaigns that have not yet
            been migrated to the Organization model are matched via the
            ``Campaign.zitadel_org_id`` column directly.

    Returns:
        The resolved CampaignRole.
    """
    from app.models.campaign import Campaign
    from app.models.campaign_member import CampaignMember
    from app.models.organization import Organization

    # 1. Check for an explicit per-campaign role override in the DB.
    member_role = await db.scalar(
        select(CampaignMember.role).where(
            CampaignMember.user_id == user_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    if member_role:
        try:
            return CampaignRole[member_role.upper()]
        except KeyError:
            logger.warning(
                "Unknown per-campaign role '{}' for user {}", member_role, user_id
            )

    # 2. If no explicit DB role, verify the JWT role is valid for this campaign.
    #    The JWT role is only authoritative when the user's current ZITADEL org
    #    is the same org that owns the campaign.
    if user_org_id:
        campaign = await db.scalar(
            select(Campaign).where(Campaign.id == campaign_id)
        )
        if campaign is not None:
            # Resolve the campaign's effective ZITADEL org ID.
            effective_org_id: str | None = None
            if campaign.organization_id is not None:
                effective_org_id = await db.scalar(
                    select(Organization.zitadel_org_id).where(
                        Organization.id == campaign.organization_id
                    )
                )
            # Fall back to the legacy direct column for campaigns not yet migrated.
            if not effective_org_id:
                effective_org_id = campaign.zitadel_org_id

            if effective_org_id and effective_org_id == user_org_id:
                return jwt_role

        # User is from a different org and has no explicit grant — deny.
        return CampaignRole.VIEWER

    # user_org_id not provided (legacy callers): preserve old behaviour.
    return jwt_role


bearer_scheme = HTTPBearer()


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
    if not org_id:
        # Fallback: extract org_id from role claim structure where org_id
        # is the key inside role values, e.g.:
        # "urn:zitadel:iam:org:project:{pid}:roles": {"admin": {"org-id": "domain"}}
        project_id = settings.zitadel_project_id
        role_claim_key = f"urn:zitadel:iam:org:project:{project_id}:roles"
        roles_obj = claims.get(role_claim_key, {})
        for _role_name, org_map in roles_obj.items():
            if isinstance(org_map, dict):
                org_id = next(iter(org_map), None)
                if org_id:
                    break
    if not org_id:
        logger.warning("JWT missing organization claim for sub={}", claims.get("sub"))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing organization claim",
        )

    return AuthenticatedUser(
        id=claims["sub"],
        org_id=org_id,
        role=_extract_role(claims),
        email=claims.get("email"),
        display_name=claims.get("name") or claims.get("preferred_username") or claims.get("email"),
    )


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

    async def _check_role(
        request: Request,
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        effective_role = current_user.role

        # Resolve per-campaign role if campaign_id is in the path
        campaign_id_str = request.path_params.get("campaign_id")
        if campaign_id_str:
            try:
                campaign_id = uuid.UUID(campaign_id_str)
                from app.db.session import get_db

                # Get a DB session for the role lookup
                async for db in get_db():
                    effective_role = await resolve_campaign_role(
                        current_user.id,
                        campaign_id,
                        db,
                        current_user.role,
                        user_org_id=current_user.org_id,
                    )
                    break
            except (ValueError, TypeError):
                pass
            except Exception:
                # DB unavailable (e.g. in tests or connection failure) —
                # fall back to the JWT role
                logger.debug("Per-campaign role resolution failed, using JWT role")

        if effective_role < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        # Update user object with resolved role so downstream code sees the right role
        current_user = current_user.model_copy(update={"role": effective_role})
        return current_user

    return _check_role
