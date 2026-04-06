"""Custom domain exceptions and problem details initialization."""

from __future__ import annotations

import uuid
from typing import Any

import fastapi_problem_details as problem
from fastapi import FastAPI, status
from sqlalchemy.exc import DatabaseError, DataError, IntegrityError

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


class InvalidCursorError(Exception):
    """Raised when a pagination cursor cannot be decoded safely."""

    def __init__(self, detail: str = "Invalid cursor") -> None:
        self.detail = detail
        super().__init__(detail)


def _exception_message(exc: BaseException | None) -> str:
    """Return a lowercase message string for exception classification."""
    if exc is None:
        return ""
    return str(exc).lower()


def _is_unique_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    class_name = getattr(orig, "__class__", type(orig)).__name__.lower()
    message = _exception_message(orig) or _exception_message(exc)
    return "uniqueviolation" in class_name or "unique constraint" in message


def _is_foreign_key_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    class_name = getattr(orig, "__class__", type(orig)).__name__.lower()
    message = _exception_message(orig) or _exception_message(exc)
    return "foreignkeyviolation" in class_name or "foreign key constraint" in message


def _problem_response(
    *,
    status_code: int,
    title: str,
    detail: str,
    type_: str,
    extra: dict[str, Any] | None = None,
):
    """Build a problem-details response with a consistent request id."""
    payload: dict[str, Any] = {
        "status": status_code,
        "title": title,
        "detail": detail,
        "type": type_,
        "request_id": request_id_var.get(""),
    }
    if extra:
        payload.update(extra)
    return problem.ProblemResponse(**payload)


def init_error_handlers(app: FastAPI) -> None:
    """Initialize problem details and custom exception handlers."""
    problem.init_app(app)

    @app.exception_handler(CampaignNotFoundError)
    async def campaign_not_found_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Campaign Not Found",
            detail=str(exc),
            type_="campaign-not-found",
        )

    @app.exception_handler(InsufficientPermissionsError)
    async def insufficient_permissions_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_403_FORBIDDEN,
            title="Insufficient Permissions",
            detail=exc.detail,
            type_="insufficient-permissions",
        )

    @app.exception_handler(VoterNotFoundError)
    async def voter_not_found_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Voter Not Found",
            detail=str(exc),
            type_="voter-not-found",
        )

    @app.exception_handler(VoterListNotFoundError)
    async def voter_list_not_found_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Voter List Not Found",
            detail=str(exc),
            type_="voter-list-not-found",
        )

    @app.exception_handler(VoterTagNotFoundError)
    async def voter_tag_not_found_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Voter Tag Not Found",
            detail=str(exc),
            type_="voter-tag-not-found",
        )

    @app.exception_handler(OrganizationNotFoundError)
    async def organization_not_found_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Organization Not Found",
            detail=str(exc),
            type_="organization-not-found",
        )

    @app.exception_handler(AlreadyRegisteredError)
    async def already_registered_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_409_CONFLICT,
            title="Already Registered",
            detail=str(exc),
            type_="volunteer-already-registered",
            extra={"campaign_id": str(exc.campaign_id)},
        )

    @app.exception_handler(ZitadelUnavailableError)
    async def zitadel_unavailable_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            title="Authentication Service Unavailable",
            detail=exc.detail,
            type_="zitadel-unavailable",
        )

    @app.exception_handler(InvalidCursorError)
    async def invalid_cursor_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Invalid Cursor",
            detail=exc.detail,
            type_="invalid-cursor",
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request, exc):  # noqa: ARG001
        if _is_unique_violation(exc):
            return _problem_response(
                status_code=status.HTTP_409_CONFLICT,
                title="Conflict",
                detail="Request conflicts with existing data",
                type_="integrity-conflict",
            )
        if _is_foreign_key_violation(exc):
            return _problem_response(
                status_code=status.HTTP_404_NOT_FOUND,
                title="Referenced Resource Not Found",
                detail="A referenced resource was not found",
                type_="foreign-key-not-found",
            )
        return _problem_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Unprocessable Request",
            detail="The request could not be completed safely",
            type_="integrity-error",
        )

    async def database_input_error_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Unprocessable Request",
            detail="The request payload or parameters are invalid",
            type_="invalid-request",
        )

    app.add_exception_handler(DataError, database_input_error_handler)
    app.add_exception_handler(DatabaseError, database_input_error_handler)
    app.add_exception_handler(ValueError, database_input_error_handler)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc):  # noqa: ARG001
        return _problem_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            title="Internal Server Error",
            detail="Internal server error",
            type_="internal-server-error",
        )
