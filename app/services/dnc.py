"""Do Not Call list service -- CRUD, bulk import, phone checking."""

from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select

from app.models.dnc import DoNotCallEntry
from app.schemas.dnc import DNCCheckResponse, DNCEntryResponse, DNCImportResponse

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# Phone number validation: 10-15 digits only
PHONE_REGEX = re.compile(r"^\d{10,15}$")


class DNCService:
    """Do Not Call list management: CRUD, bulk import, phone checking."""

    async def add_entry(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        phone_number: str,
        reason: str,
        added_by: str,
    ) -> DoNotCallEntry:
        """Add a phone number to the DNC list.

        Returns existing entry if duplicate (campaign_id + phone_number).

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            phone_number: The phone number to add.
            reason: DNC reason enum value.
            added_by: User ID who added it.

        Returns:
            The created or existing DoNotCallEntry.
        """
        # Check for existing entry
        existing_result = await session.execute(
            select(DoNotCallEntry).where(
                DoNotCallEntry.campaign_id == campaign_id,
                DoNotCallEntry.phone_number == phone_number,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing is not None:
            return existing

        entry = DoNotCallEntry(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            phone_number=phone_number,
            reason=reason,
            added_by=added_by,
            added_at=datetime.now(UTC),
        )
        session.add(entry)
        return entry

    async def bulk_import(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        csv_content: str,
        added_by: str,
    ) -> DNCImportResponse:
        """Bulk import DNC entries from CSV content.

        Requires a `phone_number` column. Optional `reason` column
        (defaults to REGISTRY_IMPORT).

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            csv_content: Raw CSV string with phone_number column.
            added_by: User ID performing the import.

        Returns:
            DNCImportResponse with counts of added, skipped, invalid.
        """
        reader = csv.DictReader(io.StringIO(csv_content))

        added = 0
        skipped = 0
        invalid = 0

        for row in reader:
            phone = row.get("phone_number", "").strip()
            reason = row.get("reason", "registry_import").strip()

            # Validate phone format
            if not PHONE_REGEX.match(phone):
                invalid += 1
                continue

            # Check for existing
            existing_result = await session.execute(
                select(DoNotCallEntry).where(
                    DoNotCallEntry.campaign_id == campaign_id,
                    DoNotCallEntry.phone_number == phone,
                )
            )
            if existing_result.scalar_one_or_none() is not None:
                skipped += 1
                continue

            entry = DoNotCallEntry(
                id=uuid.uuid4(),
                campaign_id=campaign_id,
                phone_number=phone,
                reason=reason,
                added_by=added_by,
                added_at=datetime.now(UTC),
            )
            session.add(entry)
            added += 1

        logger.info(
            "DNC bulk import for campaign {}: added={}, skipped={}, invalid={}",
            campaign_id,
            added,
            skipped,
            invalid,
        )

        return DNCImportResponse(added=added, skipped=skipped, invalid=invalid)

    async def delete_entry(
        self,
        session: AsyncSession,
        dnc_id: uuid.UUID,
    ) -> None:
        """Delete a DNC entry by ID.

        Args:
            session: Async database session.
            dnc_id: The DNC entry UUID.

        Raises:
            ValueError: If entry not found.
        """
        result = await session.execute(
            select(DoNotCallEntry).where(DoNotCallEntry.id == dnc_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            msg = f"DNC entry {dnc_id} not found"
            raise ValueError(msg)

        await session.delete(entry)

    async def check_number(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        phone_number: str,
    ) -> DNCCheckResponse:
        """Check if a phone number is on the campaign's DNC list.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            phone_number: Phone number to check.

        Returns:
            DNCCheckResponse with is_dnc flag and optional entry.
        """
        result = await session.execute(
            select(DoNotCallEntry).where(
                DoNotCallEntry.campaign_id == campaign_id,
                DoNotCallEntry.phone_number == phone_number,
            )
        )
        entry = result.scalar_one_or_none()

        if entry is not None:
            return DNCCheckResponse(
                is_dnc=True,
                entry=DNCEntryResponse.model_validate(entry),
            )

        return DNCCheckResponse(is_dnc=False, entry=None)

    async def list_entries(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[DoNotCallEntry]:
        """List all DNC entries for a campaign.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.

        Returns:
            List of DoNotCallEntry objects.
        """
        result = await session.execute(
            select(DoNotCallEntry)
            .where(DoNotCallEntry.campaign_id == campaign_id)
            .order_by(DoNotCallEntry.added_at.desc())
        )
        return list(result.scalars().all())
