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
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"


class ImportChunkStatus(enum.StrEnum):
    """Import chunk lifecycle status."""

    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ImportChunkTaskStatus(enum.StrEnum):
    """Lifecycle for post-primary chunk tasks."""

    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


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
    last_committed_row: Mapped[int | None] = mapped_column(default=0)
    processing_started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    last_progress_at: Mapped[datetime | None] = mapped_column(nullable=True)
    orphaned_at: Mapped[datetime | None] = mapped_column(nullable=True)
    orphaned_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_exhausted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    recovery_started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    error_report_key: Mapped[str | None] = mapped_column(String(500))
    error_message: Mapped[str | None] = mapped_column()
    cancelled_at: Mapped[datetime | None] = mapped_column(nullable=True)

    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class ImportChunk(Base):
    """Internal chunk state for future parallel import processing."""

    __tablename__ = "import_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False
    )
    row_start: Mapped[int] = mapped_column(nullable=False)
    row_end: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[ImportChunkStatus] = mapped_column(
        Enum(ImportChunkStatus, name="import_chunk_status", native_enum=False),
        default=ImportChunkStatus.PENDING,
    )
    imported_rows: Mapped[int | None] = mapped_column(default=0)
    skipped_rows: Mapped[int | None] = mapped_column(default=0)
    phones_created: Mapped[int | None] = mapped_column(default=0)
    phone_task_status: Mapped[ImportChunkTaskStatus | None] = mapped_column(
        Enum(ImportChunkTaskStatus, name="import_chunk_task_status", native_enum=False),
        nullable=True,
    )
    geometry_task_status: Mapped[ImportChunkTaskStatus | None] = mapped_column(
        Enum(ImportChunkTaskStatus, name="import_chunk_task_status", native_enum=False),
        nullable=True,
    )
    phone_task_error: Mapped[str | None] = mapped_column()
    geometry_task_error: Mapped[str | None] = mapped_column()
    phone_manifest: Mapped[list | None] = mapped_column(JSONB)
    geometry_manifest: Mapped[list | None] = mapped_column(JSONB)
    last_committed_row: Mapped[int | None] = mapped_column(default=0)
    error_report_key: Mapped[str | None] = mapped_column(String(500))
    error_message: Mapped[str | None] = mapped_column()
    last_progress_at: Mapped[datetime | None] = mapped_column(nullable=True)
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
