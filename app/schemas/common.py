"""Common Pydantic schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


def _contains_null_byte(value: Any) -> bool:
    """Recursively detect NUL characters in inbound payload values."""
    if isinstance(value, str):
        return "\x00" in value
    if isinstance(value, dict):
        return any(_contains_null_byte(v) for v in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(_contains_null_byte(v) for v in value)
    return False


class BaseSchema(BaseModel):
    """Base schema with ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def reject_null_bytes(cls, value: Any) -> Any:
        """Fail fast on strings that PostgreSQL will reject."""
        if _contains_null_byte(value):
            raise ValueError("Strings may not contain null bytes")
        return value


class PaginationResponse(BaseModel):
    """Pagination metadata for list responses."""

    next_cursor: str | None = None
    has_more: bool = False


class PaginatedResponse[T](BaseModel):
    """Generic paginated response wrapper."""

    items: list[T]
    pagination: PaginationResponse
