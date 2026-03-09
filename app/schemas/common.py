"""Common Pydantic schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema with ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)


class PaginationResponse(BaseModel):
    """Pagination metadata for list responses."""

    next_cursor: str | None = None
    has_more: bool = False


class PaginatedResponse[T](BaseModel):
    """Generic paginated response wrapper."""

    items: list[T]
    pagination: PaginationResponse
