"""Import job and field mapping template models."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImportStatus(enum.StrEnum):
    """Import job lifecycle status."""

    PENDING = "pending"
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportJob(Base):
    """Tracks a voter file import from upload through processing."""

    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, name="import_status", native_enum=False),
        default=ImportStatus.PENDING,
    )
    file_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="csv")
    field_mapping: Mapped[dict | None] = mapped_column(JSONB)
    detected_columns: Mapped[list | None] = mapped_column(JSONB)
    suggested_mapping: Mapped[dict | None] = mapped_column(JSONB)

    # Results
    total_rows: Mapped[int | None] = mapped_column()
    imported_rows: Mapped[int | None] = mapped_column()
    skipped_rows: Mapped[int | None] = mapped_column()
    phones_created: Mapped[int | None] = mapped_column()
    error_report_key: Mapped[str | None] = mapped_column(String(500))
    error_message: Mapped[str | None] = mapped_column()

    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class FieldMappingTemplate(Base):
    """Reusable field mapping template for voter file imports.

    System templates (is_system=True) have campaign_id=NULL and are available
    to all campaigns (e.g., the L2 preset).
    """

    __tablename__ = "field_mapping_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("campaigns.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    mapping: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_system: Mapped[bool] = mapped_column(default=False)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
