"""Import job request and response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class ImportJobResponse(BaseSchema):
    """Import job status returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    status: str
    file_key: str
    original_filename: str
    source_type: str
    field_mapping: dict | None = None
    detected_columns: list[str] | None = None
    suggested_mapping: dict | None = None
    total_rows: int | None = None
    imported_rows: int | None = None
    skipped_rows: int | None = None
    phones_created: int | None = None
    last_committed_row: int | None = None
    last_progress_at: datetime | None = None
    orphaned_at: datetime | None = None
    orphaned_reason: str | None = None
    source_exhausted_at: datetime | None = None
    recovery_started_at: datetime | None = None
    error_report_key: str | None = None
    error_message: str | None = None
    cancelled_at: datetime | None = None
    format_detected: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime


class ImportUploadResponse(BaseSchema):
    """Response after initiating an import -- includes pre-signed upload URL."""

    job_id: uuid.UUID
    upload_url: str
    file_key: str


class ConfirmMappingRequest(BaseSchema):
    """Request to confirm field mapping and start import processing."""

    field_mapping: dict
    save_as_template: str | None = None


class FieldMappingTemplateResponse(BaseSchema):
    """Field mapping template returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID | None = None
    name: str
    source_type: str
    mapping: dict
    is_system: bool
    created_by: str | None = None
    created_at: datetime
