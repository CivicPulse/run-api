"""Do Not Call list model -- campaign-scoped phone number exclusions."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DNCReason(enum.StrEnum):
    """Reason a phone number was added to the Do Not Call list."""

    REFUSED = "refused"
    VOTER_REQUEST = "voter_request"
    REGISTRY_IMPORT = "registry_import"
    MANUAL = "manual"


class DoNotCallEntry(Base):
    """A phone number on the campaign's Do Not Call list.

    Phone numbers are scoped per campaign. A number may appear in
    multiple campaigns' DNC lists independently.
    """

    __tablename__ = "do_not_call"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id", "phone_number", name="uq_dnc_campaign_phone"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    phone_number: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    added_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
