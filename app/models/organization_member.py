"""OrganizationMember SQLAlchemy model (org-level membership)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OrganizationMember(Base):
    """Organization membership table.

    Tracks which users belong to an organization and their org-level role.
    The ``role`` column is NOT NULL (unlike CampaignMember) because every
    org member must have an explicit org role.
    """

    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_organization"),
        CheckConstraint(
            "role IN ('org_owner', 'org_admin')",
            name="ck_organization_members_role_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    invited_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
