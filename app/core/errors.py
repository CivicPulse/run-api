"""Custom domain exceptions and problem details initialization."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import FastAPI, status

from app.core.observability import request_id_var


class CampaignNotFoundError(Exception):
    """Raised when a campaign cannot be found."""

    def __init__(self, campaign_id: uuid.UUID) -> None:
        self.campaign_id = campaign_id
        super().__init__(f"Campaign {campaign_id} not found")


class InsufficientPermissionsError(Exception):
    """Raised when user lacks required permissions."""

    def __init__(self, detail: str = "Insufficient permissions") -> None:
        self.detail = detail
        super().__init__(detail)


class VoterNotFoundError(Exception):
    """Raised when a voter cannot be found."""

    def __init__(self, voter_id: uuid.UUID) -> None:
        self.voter_id = voter_id
        super().__init__(f"Voter {voter_id} not found")


class VoterListNotFoundError(Exception):
    """Raised when a voter list cannot be found."""

    def __init__(self, list_id: uuid.UUID) -> None:
        self.list_id = list_id
        super().__init__(f"Voter list {list_id} not found")


class VoterTagNotFoundError(Exception):
    """Raised when a voter tag cannot be found."""

    def __init__(self, tag_id: uuid.UUID) -> None:
        self.tag_id = tag_id
        super().__init__(f"Voter tag {tag_id} not found")


class OrganizationNotFoundError(Exception):
    """Raised when an organization cannot be found."""

    def __init__(self, organization_id: uuid.UUID) -> None:
        self.organization_id = organization_id
        super().__init__(f"Organization {organization_id} not found")


class AlreadyRegisteredError(Exception):
    """Raised when a user is already registered for a campaign."""

    def __init__(self, campaign_id: uuid.UUID) -> None:
        self.campaign_id = campaign_id
        super().__init__(f"Already registered for campaign {campaign_id}")


class ZitadelUnavailableError(Exception):
    """Raised when ZITADEL is unreachable (503)."""

    def __init__(self, detail: str = "Authentication service unavailable") -> None:
        self.detail = detail
        super().__init__(detail)


def init_error_handlers(app: FastAPI) -> None:
    """Initialize problem details and custom exception handlers."""
    problem.init_app(app)

    @app.exception_handler(CampaignNotFoundError)
    async def campaign_not_found_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Campaign Not Found",
            detail=str(exc),
            type="campaign-not-found",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(InsufficientPermissionsError)
    async def insufficient_permissions_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_403_FORBIDDEN,
            title="Insufficient Permissions",
            detail=exc.detail,
            type="insufficient-permissions",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(VoterNotFoundError)
    async def voter_not_found_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Voter Not Found",
            detail=str(exc),
            type="voter-not-found",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(VoterListNotFoundError)
    async def voter_list_not_found_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Voter List Not Found",
            detail=str(exc),
            type="voter-list-not-found",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(VoterTagNotFoundError)
    async def voter_tag_not_found_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Voter Tag Not Found",
            detail=str(exc),
            type="voter-tag-not-found",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(OrganizationNotFoundError)
    async def organization_not_found_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Organization Not Found",
            detail=str(exc),
            type="organization-not-found",
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(AlreadyRegisteredError)
    async def already_registered_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_409_CONFLICT,
            title="Already Registered",
            detail=str(exc),
            type="volunteer-already-registered",
            campaign_id=str(exc.campaign_id),
            request_id=request_id_var.get(""),
        )

    @app.exception_handler(ZitadelUnavailableError)
    async def zitadel_unavailable_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
            title="Authentication Service Unavailable",
            detail=exc.detail,
            type="zitadel-unavailable",
            request_id=request_id_var.get(""),
        )
