"""Custom domain exceptions and problem details initialization."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import FastAPI, status


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
        )

    @app.exception_handler(InsufficientPermissionsError)
    async def insufficient_permissions_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_403_FORBIDDEN,
            title="Insufficient Permissions",
            detail=exc.detail,
            type="insufficient-permissions",
        )

    @app.exception_handler(ZitadelUnavailableError)
    async def zitadel_unavailable_handler(request, exc):  # noqa: ARG001
        return problem.ProblemResponse(
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
            title="Authentication Service Unavailable",
            detail=exc.detail,
            type="zitadel-unavailable",
        )
