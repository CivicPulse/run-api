"""User SQLAlchemy model."""

from __future__ import annotations

from datetime import datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTable
from sqlalchemy import Boolean, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(SQLAlchemyBaseUserTable[str], Base):
    """User model.

    Historically the ``id`` was the ZITADEL ``sub`` claim. Going forward it is
    either a UUID-string issued by ``fastapi-users`` on register, or the legacy
    ZITADEL ``sub`` for pre-existing rows. Keeping ``String(255)`` avoids a
    PK rewrite during the dual-auth grace period.

    The ``fastapi-users`` mixin (``SQLAlchemyBaseUserTable[str]``) contributes
    ``email``, ``hashed_password``, ``is_active``, ``is_superuser``, and
    ``is_verified``. We re-declare several of those here to (a) pin the ``id``
    as ``String(255)`` primary key, (b) drop the default ``unique=True`` on
    ``email`` until Step 4 dedupe, and (c) keep ``hashed_password`` nullable so
    existing ZITADEL-only rows remain valid during the cutover.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)

    # Override mixin defaults.
    # - email: relax unique=True (legacy rows may duplicate; Step 4 cleans up).
    # - hashed_password: nullable during dual-auth grace period.
    email: Mapped[str] = mapped_column(String(length=320), index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(  # type: ignore[assignment]
        String(length=1024), nullable=True
    )

    # Native-auth bookkeeping. ``email_verified`` is our canonical flag;
    # ``is_verified`` is the fastapi-users alias kept in sync at runtime.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )

    # Legacy columns preserved.
    display_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )
