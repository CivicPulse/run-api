"""Import workflow endpoints.

Provides the multi-step voter file import flow: initiate upload,
detect columns, confirm mapping, poll status, list jobs, and
list mapping templates.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.models.import_job import (
    FieldMappingTemplate,
    ImportJob,
    ImportStatus,
)
from app.schemas.common import PaginatedResponse
from app.schemas.import_job import (
    ConfirmMappingRequest,
    FieldMappingTemplateResponse,
    ImportJobResponse,
    ImportUploadResponse,
)
from app.services.import_service import ImportService, suggest_field_mapping
from app.tasks.import_task import process_import

router = APIRouter()
_service = ImportService()


@router.post(
    "/campaigns/{campaign_id}/imports",
    response_model=ImportUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def initiate_import(
    campaign_id: uuid.UUID,
    request: Request,
    original_filename: str = Query(..., description="Name of the file being uploaded"),
    source_type: str = Query("csv", description="Source type (csv, l2, etc.)"),
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Initiate a voter file import by generating a pre-signed upload URL.

    Step 1 of the import flow. The client uploads the file directly to
    object storage using the returned URL, then calls the detect endpoint.

    Args:
        campaign_id: Campaign UUID.
        request: FastAPI request.
        original_filename: Name of the file being uploaded.
        source_type: Source type identifier.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        ImportUploadResponse with job_id, upload_url, and file_key.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    storage = request.app.state.storage_service

    # Create import job
    job = ImportJob(
        campaign_id=campaign_id,
        status=ImportStatus.PENDING,
        original_filename=original_filename,
        source_type=source_type,
        file_key="",  # Will be set below
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    # Generate S3 key and pre-signed URL
    file_key = f"imports/{campaign_id}/{job.id}/{original_filename}"
    job.file_key = file_key
    await db.commit()

    upload_url = await storage.generate_upload_url(file_key)

    return ImportUploadResponse(
        job_id=job.id,
        upload_url=upload_url,
        file_key=file_key,
    )


@router.post(
    "/campaigns/{campaign_id}/imports/{import_id}/detect",
    response_model=ImportJobResponse,
)
async def detect_columns(
    campaign_id: uuid.UUID,
    import_id: uuid.UUID,
    request: Request,
    template_id: uuid.UUID | None = Query(
        None, description="Optional template ID to load instead of auto-suggest"
    ),
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Detect CSV columns and suggest field mappings after file upload.

    Step 1b of the import flow. Downloads the first portion of the file
    from S3, detects column headers, and either auto-suggests mappings
    via fuzzy matching or loads a saved template.

    Args:
        campaign_id: Campaign UUID.
        import_id: Import job UUID.
        request: FastAPI request.
        template_id: Optional mapping template to apply instead of auto-suggest.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        ImportJobResponse with detected_columns and suggested_mapping.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    job = await db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import job not found",
        )

    storage = request.app.state.storage_service

    # Download first portion of the file for header detection
    chunks: list[bytes] = []
    total_size = 0
    async for chunk in storage.download_file(job.file_key):
        chunks.append(chunk)
        total_size += len(chunk)
        if total_size >= 8192:  # First 8KB is enough for header detection
            break
    file_head = b"".join(chunks)

    # Detect columns
    columns = _service.detect_columns(file_head)
    if not columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Could not detect CSV columns from uploaded file",
        )

    # Generate mapping suggestions
    if template_id is not None:
        template = await db.get(FieldMappingTemplate, template_id)
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mapping template not found",
            )
        suggested = template.mapping
    else:
        suggested = suggest_field_mapping(columns)

    # Update job
    job.detected_columns = columns
    job.suggested_mapping = suggested
    job.status = ImportStatus.UPLOADED
    await db.commit()
    await db.refresh(job)

    return ImportJobResponse.model_validate(job)


@router.post(
    "/campaigns/{campaign_id}/imports/{import_id}/confirm",
    response_model=ImportJobResponse,
)
async def confirm_mapping(
    campaign_id: uuid.UUID,
    import_id: uuid.UUID,
    body: ConfirmMappingRequest,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Confirm field mapping and start background import processing.

    Step 2 of the import flow. Saves the confirmed mapping, optionally
    saves it as a reusable template, then dispatches the background task.

    Args:
        campaign_id: Campaign UUID.
        import_id: Import job UUID.
        body: Confirmed field mapping and optional template save.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        ImportJobResponse with status=QUEUED.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    job = await db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import job not found",
        )

    if job.status not in (ImportStatus.UPLOADED, ImportStatus.PENDING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm mapping for job in status '{job.status}'",
        )

    # Save confirmed mapping
    job.field_mapping = body.field_mapping
    job.status = ImportStatus.QUEUED

    # Optionally save as template
    if body.save_as_template:
        template = FieldMappingTemplate(
            campaign_id=campaign_id,
            name=body.save_as_template,
            source_type=job.source_type,
            mapping=body.field_mapping,
            is_system=False,
            created_by=user.id,
        )
        db.add(template)

    await db.commit()
    await db.refresh(job)

    # Dispatch background task
    await process_import.kiq(str(import_id))

    return ImportJobResponse.model_validate(job)


@router.get(
    "/campaigns/{campaign_id}/imports/{import_id}",
    response_model=ImportJobResponse,
)
async def get_import_status(
    campaign_id: uuid.UUID,
    import_id: uuid.UUID,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of an import job.

    Returns current status, progress counts, and error report URL
    (pre-signed download URL if errors were encountered).

    Args:
        campaign_id: Campaign UUID.
        import_id: Import job UUID.
        request: FastAPI request.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        ImportJobResponse with current status and counts.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    job = await db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import job not found",
        )

    response = ImportJobResponse.model_validate(job)

    # Generate pre-signed download URL for error report if it exists
    if job.error_report_key:
        storage = request.app.state.storage_service
        response.error_report_key = await storage.generate_download_url(
            job.error_report_key
        )

    return response


@router.delete(
    "/campaigns/{campaign_id}/imports/{import_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_import(
    campaign_id: uuid.UUID,
    import_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Delete an import job record.

    Requires admin role.

    Args:
        campaign_id: Campaign UUID.
        import_id: Import job UUID.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        204 No Content on success.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    job = await db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import job not found",
        )

    if job.status in (ImportStatus.QUEUED, ImportStatus.PROCESSING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an import that is currently in progress",
        )

    await db.delete(job)
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/imports",
    response_model=PaginatedResponse[ImportJobResponse],
)
async def list_imports(
    campaign_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = Query(None),
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """List import jobs for a campaign with cursor-based pagination.

    Args:
        campaign_id: Campaign UUID.
        limit: Max results per page.
        cursor: Pagination cursor (import job ID).
        user: Authenticated admin user.
        db: Database session.

    Returns:
        Paginated list of ImportJobResponse.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    from app.schemas.common import PaginationResponse

    query = (
        select(ImportJob)
        .where(ImportJob.campaign_id == campaign_id)
        .order_by(ImportJob.created_at.desc())
        .limit(limit + 1)
    )

    if cursor:
        cursor_job = await db.get(ImportJob, uuid.UUID(cursor))
        if cursor_job:
            query = query.where(ImportJob.created_at < cursor_job.created_at)

    result = await db.execute(query)
    jobs = list(result.scalars().all())

    has_more = len(jobs) > limit
    if has_more:
        jobs = jobs[:limit]

    items = [ImportJobResponse.model_validate(j) for j in jobs]
    next_cursor = str(jobs[-1].id) if has_more and jobs else None

    return PaginatedResponse[ImportJobResponse](
        items=items,
        pagination=PaginationResponse(
            next_cursor=next_cursor,
            has_more=has_more,
        ),
    )


@router.get(
    "/campaigns/{campaign_id}/imports/templates",
    response_model=list[FieldMappingTemplateResponse],
)
async def list_mapping_templates(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """List available field mapping templates.

    Returns system-wide templates (campaign_id IS NULL, is_system=True)
    plus campaign-specific templates.

    Args:
        campaign_id: Campaign UUID.
        user: Authenticated admin user.
        db: Database session.

    Returns:
        List of FieldMappingTemplateResponse.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    query = (
        select(FieldMappingTemplate)
        .where(
            or_(
                FieldMappingTemplate.campaign_id == campaign_id,
                FieldMappingTemplate.campaign_id.is_(None),
            )
        )
        .order_by(FieldMappingTemplate.is_system.desc(), FieldMappingTemplate.name)
    )

    result = await db.execute(query)
    templates = list(result.scalars().all())

    return [FieldMappingTemplateResponse.model_validate(t) for t in templates]
