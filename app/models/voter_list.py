"""Voter list models: static and dynamic lists."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ListType(enum.StrEnum):
    """Voter list type."""

    STATIC = "static"
    DYNAMIC = "dynamic"


class VoterList(Base):
    """Named voter list -- either static (join table) or dynamic (filter JSON)."""

    __tablename__ = "voter_lists"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    list_type: Mapped[ListType] = mapped_column(
        Enum(ListType, name="list_type", native_enum=False), nullable=False
    )
    filter_query: Mapped[dict | None] = mapped_column(JSONB)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class VoterListMember(Base):
    """Join table for static voter list membership."""

    __tablename__ = "voter_list_members"

    voter_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voter_lists.id"), primary_key=True
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
