"""Import service for voter file processing.

Provides fuzzy field mapping suggestions, CSV parsing, and batch upsert
logic for the voter import pipeline.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from loguru import logger
from rapidfuzz import fuzz, process
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.models.voter import Voter

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.storage import StorageService

# Canonical voter fields with known aliases for fuzzy matching.
# Each key is a canonical Voter model column; values are known aliases
# (lowercased, underscore-separated) that should map to that field.
CANONICAL_FIELDS: dict[str, list[str]] = {
    "source_id": [
        "source_id",
        "voter_id",
        "voterid",
        "lalvoterid",
        "l2_voter_id",
        "state_voter_id",
        "registration_number",
    ],
    "first_name": [
        "first_name",
        "firstname",
        "first",
        "fname",
        "name_first",
        "voters_firstname",
    ],
    "middle_name": [
        "middle_name",
        "middlename",
        "middle",
        "mname",
        "name_middle",
        "voters_middlename",
    ],
    "last_name": [
        "last_name",
        "lastname",
        "last",
        "lname",
        "name_last",
        "surname",
        "voters_lastname",
    ],
    "suffix": [
        "suffix",
        "name_suffix",
        "voters_namesuffix",
    ],
    "date_of_birth": [
        "date_of_birth",
        "dob",
        "birth_date",
        "birthdate",
        "voters_birthdate",
    ],
    "gender": [
        "gender",
        "sex",
        "voters_gender",
    ],
    "address_line1": [
        "address_line1",
        "address1",
        "address",
        "street",
        "street_address",
        "residential_address1",
        "residence_addresses_addressline",
    ],
    "address_line2": [
        "address_line2",
        "address2",
        "apt",
        "unit",
        "residential_address2",
    ],
    "city": [
        "city",
        "residential_city",
        "residence_addresses_city",
        "mail_city",
    ],
    "state": [
        "state",
        "residential_state",
        "residence_addresses_state",
    ],
    "zip_code": [
        "zip_code",
        "zip",
        "zipcode",
        "postal_code",
        "residence_addresses_zip",
        "residential_zip",
    ],
    "county": [
        "county",
        "residence_addresses_county",
        "county_name",
    ],
    "party": [
        "party",
        "party_affiliation",
        "political_party",
        "parties_description",
    ],
    "precinct": [
        "precinct",
        "precinct_id",
        "precinct_name",
    ],
    "congressional_district": [
        "congressional_district",
        "us_congress",
        "cd",
        "us_congressional_district",
    ],
    "state_senate_district": [
        "state_senate_district",
        "state_senate",
        "sd",
    ],
    "state_house_district": [
        "state_house_district",
        "state_house",
        "hd",
        "state_legislative_district",
    ],
    "registration_date": [
        "registration_date",
        "reg_date",
        "voter_registration_date",
        "date_registered",
    ],
    "ethnicity": [
        "ethnicity",
        "ethnic_group",
        "race",
        "ethnicgroups_ethnicgroup1desc",
    ],
    "age": [
        "age",
        "voters_age",
    ],
    "latitude": [
        "latitude",
        "lat",
        "residence_addresses_latitude",
    ],
    "longitude": [
        "longitude",
        "lng",
        "lon",
        "residence_addresses_longitude",
    ],
    "household_id": [
        "household_id",
        "householdid",
        "hh_id",
    ],
}

# Build reverse lookup: alias -> canonical field name
_ALIAS_LIST: list[str] = []
_ALIAS_TO_FIELD: dict[str, str] = {}
for _field, _aliases in CANONICAL_FIELDS.items():
    for _alias in _aliases:
        _ALIAS_LIST.append(_alias)
        _ALIAS_TO_FIELD[_alias] = _field

# Canonical field names that exist as columns on the Voter model
_VOTER_COLUMNS: set[str] = {
    "source_id",
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "date_of_birth",
    "gender",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip_code",
    "county",
    "party",
    "precinct",
    "congressional_district",
    "state_senate_district",
    "state_house_district",
    "registration_date",
    "ethnicity",
    "age",
    "latitude",
    "longitude",
    "household_id",
}


def suggest_field_mapping(csv_columns: list[str]) -> dict[str, str | None]:
    """Suggest canonical field mappings for CSV column headers.

    Uses RapidFuzz fuzzy matching with a 75% similarity threshold to map
    each CSV column header to the closest canonical voter field name.

    Args:
        csv_columns: List of column header strings from the CSV file.

    Returns:
        Dict mapping each CSV column name to a canonical field name or None
        if no match meets the threshold. None-mapped columns will be placed
        into the voter's ``extra_data`` JSONB field during import.
    """
    mapping: dict[str, str | None] = {}
    used_fields: set[str] = set()

    for col in csv_columns:
        normalized = col.strip().lower().replace(" ", "_")
        match = process.extractOne(
            normalized,
            _ALIAS_LIST,
            scorer=fuzz.ratio,
            score_cutoff=75,
        )
        if match:
            field = _ALIAS_TO_FIELD[match[0]]
            if field not in used_fields:
                mapping[col] = field
                used_fields.add(field)
            else:
                # Field already mapped by a previous column, skip duplicate
                mapping[col] = None
        else:
            mapping[col] = None

    return mapping


class ImportService:
    """Voter file import processing service.

    Handles CSV column detection, field mapping application, batch upsert
    to the voters table, and full import file orchestration.
    """

    def detect_columns(self, file_content: bytes) -> list[str]:
        """Detect CSV column headers from file content.

        Tries UTF-8 decoding first, falls back to Latin-1. Handles BOM.

        Args:
            file_content: Raw bytes of the CSV file (or first few KB).

        Returns:
            List of column header strings from the first row.
        """
        if not file_content:
            return []

        # Try UTF-8 first, fall back to Latin-1
        for encoding in ("utf-8-sig", "latin-1"):
            try:
                text = file_content.decode(encoding)
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            return []

        reader = csv.reader(io.StringIO(text))
        try:
            headers = next(reader)
        except StopIteration:
            return []

        return [h.strip() for h in headers]

    def apply_field_mapping(
        self,
        rows: list[dict[str, str]],
        field_mapping: dict[str, str | None],
        campaign_id: str,
        source_type: str,
    ) -> list[dict]:
        """Apply field mapping to CSV rows and produce voter dicts.

        Maps CSV columns to canonical voter fields. Unmapped columns (mapping
        value is None) go into ``extra_data``. Rows missing both first_name
        and last_name are flagged with an error.

        Args:
            rows: List of CSV row dicts (column_name -> value).
            field_mapping: Mapping of CSV column to canonical field (or None).
            campaign_id: Campaign UUID string.
            source_type: Source type string (e.g., "csv", "l2").

        Returns:
            List of dicts, each with "voter" (voter column dict) and optionally
            "error" (string reason if row should be skipped).
        """
        results: list[dict] = []

        for row in rows:
            voter: dict = {
                "campaign_id": campaign_id,
                "source_type": source_type,
            }
            extra_data: dict = {}

            for csv_col, value in row.items():
                canonical = field_mapping.get(csv_col)
                if canonical is not None and canonical in _VOTER_COLUMNS:
                    voter[canonical] = value
                elif value and value.strip():
                    # Unmapped or None-mapped: non-empty values go to extra_data
                    extra_data[csv_col] = value

            voter["extra_data"] = extra_data

            # Validate: must have at least first_name or last_name
            has_first = bool(voter.get("first_name", "").strip()) if voter.get("first_name") else False
            has_last = bool(voter.get("last_name", "").strip()) if voter.get("last_name") else False

            if not has_first and not has_last:
                results.append({
                    "voter": voter,
                    "error": "Missing required field: at least one of first_name or last_name is required",
                })
            else:
                results.append({"voter": voter})

        return results

    async def process_csv_batch(
        self,
        rows: list[dict[str, str]],
        field_mapping: dict[str, str | None],
        campaign_id: str,
        source_type: str,
        session: AsyncSession,
    ) -> tuple[int, list[dict]]:
        """Process a batch of CSV rows: map fields and upsert voters.

        Uses PostgreSQL ``INSERT ... ON CONFLICT DO UPDATE`` on the
        (campaign_id, source_type, source_id) unique constraint.

        Args:
            rows: Batch of CSV row dicts.
            field_mapping: CSV column -> canonical field mapping.
            campaign_id: Campaign UUID string.
            source_type: Source type string.
            session: Async DB session (must have RLS context set).

        Returns:
            Tuple of (imported_count, error_list) where error_list contains
            dicts with "row" (original row) and "reason" (error message).
        """
        mapped_results = self.apply_field_mapping(
            rows, field_mapping, campaign_id, source_type
        )

        valid_voters: list[dict] = []
        errors: list[dict] = []

        for i, result in enumerate(mapped_results):
            if result.get("error"):
                errors.append({
                    "row": rows[i] if i < len(rows) else {},
                    "reason": result["error"],
                })
            else:
                voter = result["voter"]
                # Ensure source_id has a value for upsert; generate if missing
                if not voter.get("source_id"):
                    voter["source_id"] = str(uuid.uuid4())
                valid_voters.append(voter)

        if valid_voters:
            # Build the upsert columns (exclude campaign_id, source_type, source_id from SET)
            update_cols = {
                col: getattr(insert(Voter).excluded, col)
                for col in valid_voters[0]
                if col not in ("campaign_id", "source_type", "source_id")
            }
            update_cols["updated_at"] = func.now()

            stmt = insert(Voter).values(valid_voters)
            stmt = stmt.on_conflict_do_update(
                index_elements=["campaign_id", "source_type", "source_id"],
                set_=update_cols,
            )
            await session.execute(stmt)
            await session.flush()

        return len(valid_voters), errors

    async def process_import_file(
        self,
        import_job_id: str,
        session: AsyncSession,
        storage: StorageService,
    ) -> None:
        """Process a full voter file import.

        Downloads the file from S3, streams through csv.DictReader in
        batches of 1000 rows, upserts each batch, updates ImportJob
        progress, and generates an error report if any rows failed.

        Args:
            import_job_id: ImportJob UUID string.
            session: Async DB session (RLS context must be set).
            storage: StorageService for file download/upload.
        """
        from app.db.rls import set_campaign_context
        from app.models.import_job import ImportJob, ImportStatus

        # Load the import job
        result = await session.get(ImportJob, uuid.UUID(import_job_id))
        if result is None:
            raise ValueError(f"ImportJob {import_job_id} not found")
        job = result

        # Set RLS context for voter operations
        await set_campaign_context(session, str(job.campaign_id))

        # Update status to processing
        job.status = ImportStatus.PROCESSING
        job.imported_rows = 0
        job.skipped_rows = 0
        job.total_rows = 0
        await session.flush()

        # Download file from S3
        chunks: list[bytes] = []
        async for chunk in storage.download_file(job.file_key):
            chunks.append(chunk)
        file_content = b"".join(chunks)

        # Decode content
        for encoding in ("utf-8-sig", "latin-1"):
            try:
                text = file_content.decode(encoding)
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            job.status = ImportStatus.FAILED
            job.error_message = "Unable to decode file content"
            await session.flush()
            return

        # Parse CSV and process in batches
        reader = csv.DictReader(io.StringIO(text))
        batch: list[dict[str, str]] = []
        all_errors: list[dict] = []
        total_imported = 0
        total_skipped = 0
        total_rows = 0
        batch_size = 1000

        for row in reader:
            batch.append(row)
            total_rows += 1

            if len(batch) >= batch_size:
                imported, errors = await self.process_csv_batch(
                    batch,
                    job.field_mapping,
                    str(job.campaign_id),
                    job.source_type,
                    session,
                )
                total_imported += imported
                total_skipped += len(errors)
                all_errors.extend(errors)
                batch = []

                # Update progress
                job.total_rows = total_rows
                job.imported_rows = total_imported
                job.skipped_rows = total_skipped
                await session.flush()

        # Process remaining rows
        if batch:
            imported, errors = await self.process_csv_batch(
                batch,
                job.field_mapping,
                str(job.campaign_id),
                job.source_type,
                session,
            )
            total_imported += imported
            total_skipped += len(errors)
            all_errors.extend(errors)

        # Generate error report if there were errors
        if all_errors:
            error_csv = io.StringIO()
            if all_errors:
                # Get all CSV columns from first error row
                sample_row = all_errors[0].get("row", {})
                fieldnames = list(sample_row.keys()) + ["error_reason"]
                writer = csv.DictWriter(error_csv, fieldnames=fieldnames)
                writer.writeheader()
                for err in all_errors:
                    row_data = dict(err.get("row", {}))
                    row_data["error_reason"] = err["reason"]
                    writer.writerow(row_data)

            error_key = f"imports/{job.campaign_id}/{import_job_id}/errors.csv"
            await storage.upload_bytes(
                error_key,
                error_csv.getvalue().encode("utf-8"),
                content_type="text/csv",
            )
            job.error_report_key = error_key

        # Finalize
        job.total_rows = total_rows
        job.imported_rows = total_imported
        job.skipped_rows = total_skipped
        job.status = ImportStatus.COMPLETED
        await session.flush()

        logger.info(
            "Import {} complete: {} imported, {} skipped out of {} total",
            import_job_id,
            total_imported,
            total_skipped,
            total_rows,
        )
