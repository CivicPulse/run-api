"""Campaign-scoped search surface for voter lookup."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VoterSearchRecord(Base):
    """Denormalized lookup record refreshed from voter/contact/import writes."""

    __tablename__ = "voter_search_records"
    __table_args__ = (
        Index("ix_voter_search_records_campaign_id", "campaign_id"),
        Index("ix_voter_search_records_name_full", "name_full"),
        Index("ix_voter_search_records_phone_digits", "phone_digits"),
        Index("ix_voter_search_records_source_ids", "source_ids"),
    )

    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id", ondelete="CASCADE"),
        primary_key=True,
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"),
        nullable=False,
    )
    name_full: Mapped[str] = mapped_column(String(511), default="")
    name_first: Mapped[str] = mapped_column(String(255), default="")
    name_last: Mapped[str] = mapped_column(String(255), default="")
    city: Mapped[str] = mapped_column(String(255), default="")
    state: Mapped[str] = mapped_column(String(2), default="")
    zip_code: Mapped[str] = mapped_column(String(10), default="")
    source_ids: Mapped[str] = mapped_column(Text, default="")
    email_values: Mapped[str] = mapped_column(Text, default="")
    phone_values: Mapped[str] = mapped_column(Text, default="")
    phone_digits: Mapped[str] = mapped_column(Text, default="")
    address_text: Mapped[str] = mapped_column(Text, default="")
    document: Mapped[str] = mapped_column(Text, default="")
    refreshed_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
