"""CampaignMember SQLAlchemy model (join table)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignMember(Base):
    """Campaign membership join table for RLS filtering.

    The optional ``role`` column stores a per-campaign override role.
    When ``None``, the caller should fall back to the org-level ZITADEL role
    carried in the JWT claims.
    """

    __tablename__ = "campaign_members"
    __table_args__ = (
        UniqueConstraint("user_id", "campaign_id", name="uq_user_campaign"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    synced_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)
