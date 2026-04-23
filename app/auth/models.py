"""SQLAlchemy model for fastapi-users access tokens (DatabaseStrategy)."""

from __future__ import annotations

from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyBaseAccessTokenTable
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AccessToken(SQLAlchemyBaseAccessTokenTable[str], Base):
    """Server-side opaque session tokens backing ``DatabaseStrategy``.

    The base mixin contributes ``token`` (PK) and ``created_at``. We declare
    ``user_id`` here because the FK type depends on the parent ``User`` PK
    type (``String(255)`` in this project), which the mixin cannot know.
    """

    __tablename__ = "auth_access_tokens"

    user_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
