"""Import service for voter file processing.

Provides fuzzy field mapping suggestions, CSV parsing, and batch upsert
logic for the voter import pipeline.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from typing import TYPE_CHECKING

from loguru import logger
from rapidfuzz import fuzz, process
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.models.voter import Voter
from app.models.voter_contact import VoterPhone

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.storage import StorageService

# Canonical voter fields with known aliases for fuzzy matching.
# Each key is a canonical Voter model column; values are known aliases
# (lowercased, underscore-separated) that should map to that field.
CANONICAL_FIELDS: dict[str, list[str]] = {
    "__cell_phone": [
        "__cell_phone",
        "cellphone",
        "cell_phone",
        "phone",
        "cell",
        # L2 official headers
        "voters_cellphonefull",
        "voters_cellphone",
    ],
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
    "registration_line1": [
        "registration_line1",
        "address_line1",
        "address1",
        "address",
        "street",
        "street_address",
        "residential_address1",
        "residence_addresses_addressline",
    ],
    "registration_line2": [
        "registration_line2",
        "address_line2",
        "address2",
        "apt",
        "unit",
        "residential_address2",
    ],
    "registration_city": [
        "registration_city",
        "city",
        "residential_city",
        "residence_addresses_city",
    ],
    "registration_state": [
        "registration_state",
        "state",
        "residential_state",
        "residence_addresses_state",
    ],
    "registration_zip": [
        "registration_zip",
        "zip_code",
        "zip",
        "zipcode",
        "postal_code",
        "residence_addresses_zip",
        "residential_zip",
    ],
    "registration_county": [
        "registration_county",
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
        # L2 official headers
        "voters_hhid",
    ],
    "registration_zip4": [
        "registration_zip4",
        "zip4",
        "zip_plus4",
        "residence_addresses_zip4",
        # L2 official headers
        "voters_zip4",
    ],
    "registration_apartment_type": [
        "registration_apartment_type",
        "apartment_type",
        "apt_type",
        "residence_addresses_apttype",
    ],
    "mailing_line1": [
        "mailing_line1",
        "mail_address",
        "mailing_address",
        "mail_address_line1",
        # L2 official headers
        "mail_vaddressline1",
    ],
    "mailing_line2": [
        "mailing_line2",
        "mail_address2",
        "mail_address_line2",
        # L2 official headers
        "mail_vaddressline2",
    ],
    "mailing_city": [
        "mailing_city",
        "mail_city",
        # L2 official headers
        "mail_vcity",
    ],
    "mailing_state": [
        "mailing_state",
        "mail_state",
        # L2 official headers
        "mail_vstate",
    ],
    "mailing_zip": [
        "mailing_zip",
        "mail_zip",
        "mail_zipcode",
        # L2 official headers
        "mail_vzip",
        "mail_vzipcode",
    ],
    "mailing_zip4": [
        "mailing_zip4",
        "mail_zip4",
        # L2 official headers
        "mail_vzip4",
    ],
    "mailing_country": [
        "mailing_country",
        "mail_country",
        # L2 official headers
        "mail_vcountry",
    ],
    "mailing_type": [
        "mailing_type",
        "mail_type",
    ],
    "propensity_general": [
        "propensity_general",
        "general_propensity",
        # L2 official headers
        "general_turnout_score",
    ],
    "propensity_primary": [
        "propensity_primary",
        "primary_propensity",
        # L2 official headers
        "primary_turnout_score",
    ],
    "propensity_combined": [
        "propensity_combined",
        "combined_propensity",
        # L2 official headers
        "combined_turnout_score",
        "overall_turnout_score",
    ],
    "spoken_language": [
        "spoken_language",
        "language",
        "voters_language",
    ],
    "marital_status": [
        "marital_status",
        "marital",
        # L2 official headers
        "commercialdata_maritalstatus",
    ],
    "military_status": [
        "military_status",
        "military",
        # L2 official headers
        "commercialdata_militaryactive",
    ],
    "party_change_indicator": [
        "party_change_indicator",
        "party_change",
        # L2 official headers
        "voters_partychangeindicator",
    ],
    "cell_phone_confidence": [
        "cell_phone_confidence",
        "cellphone_confidence",
        # L2 official headers
        "cellphoneconfidence",
    ],
    "household_party_registration": [
        "household_party_registration",
        "hh_party_registration",
        # L2 official headers
        "voters_hhpartyregistration",
    ],
    "household_size": [
        "household_size",
        "hh_size",
        # L2 official headers
        "voters_hhsize",
    ],
    "family_id": [
        "family_id",
        "familyid",
        # L2 official headers
        "voters_familyid",
    ],
}

# Build reverse lookup: alias -> canonical field name
_ALIAS_LIST: list[str] = []
_ALIAS_TO_FIELD: dict[str, str] = {}
for _field, _aliases in CANONICAL_FIELDS.items():
    for _alias in _aliases:
        _ALIAS_LIST.append(_alias)
        _ALIAS_TO_FIELD[_alias] = _field

# ---------------------------------------------------------------------------
# Parsing utility functions for L2 voter file import
# ---------------------------------------------------------------------------

_PROPENSITY_RE = re.compile(r"^(\d+)%?$")


def parse_propensity(value: str) -> int | None:
    """Parse a propensity percentage string to an integer (0-100) or None.

    Handles values like "77%", "42", "0%", "100".  Non-numeric strings
    ("Not Eligible", "High", "N/A"), empty strings, and out-of-range
    numbers (>100) all return None.
    """
    if not value or not value.strip():
        return None
    match = _PROPENSITY_RE.match(value.strip())
    if match:
        score = int(match.group(1))
        return score if 0 <= score <= 100 else None
    return None


def normalize_phone(value: str) -> str | None:
    """Normalize a phone number string to 10 US digits, or return None.

    Strips all non-digit characters, handles the leading US country
    code "1" for 11-digit results, and validates the final result is
    exactly 10 digits.
    """
    if not value or not value.strip():
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")
_VOTED_VALUES = frozenset({"Y", "A", "E"})


def parse_voting_history(row: dict[str, str]) -> list[str]:
    """Extract voting history entries from an L2 row dict.

    Scans keys for ``General_YYYY`` / ``Primary_YYYY`` patterns.  If the
    corresponding value (stripped, uppercased) is Y, A, or E the key is
    included in the returned sorted list.
    """
    history: list[str] = []
    for col, val in row.items():
        if _VOTING_HISTORY_RE.match(col) and val.strip().upper() in _VOTED_VALUES:
            history.append(col)
    return sorted(history)


# Columns excluded from the upsert SET clause (identity + auto-managed)
_UPSERT_EXCLUDE = frozenset(
    {
        "id",
        "campaign_id",
        "source_type",
        "source_id",
        "created_at",
        "updated_at",
        "geom",
    }
)

# Canonical field names that exist as columns on the Voter model
_VOTER_COLUMNS: set[str] = {
    "source_id",
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "date_of_birth",
    "gender",
    "registration_line1",
    "registration_line2",
    "registration_city",
    "registration_state",
    "registration_zip",
    "registration_county",
    "registration_zip4",
    "registration_apartment_type",
    "mailing_line1",
    "mailing_line2",
    "mailing_city",
    "mailing_state",
    "mailing_zip",
    "mailing_zip4",
    "mailing_country",
    "mailing_type",
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
    "propensity_general",
    "propensity_primary",
    "propensity_combined",
    "spoken_language",
    "marital_status",
    "military_status",
    "party_change_indicator",
    "cell_phone_confidence",
    "household_party_registration",
    "household_size",
    "family_id",
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
            result_dict: dict = {}

            for csv_col, value in row.items():
                canonical = field_mapping.get(csv_col)
                if canonical is not None and canonical.startswith("__"):
                    # Double-underscore prefix: route to related table data
                    if canonical == "__cell_phone" and value and value.strip():
                        result_dict["phone_value"] = value
                elif canonical is not None and canonical in _VOTER_COLUMNS:
                    voter[canonical] = value
                elif value and value.strip():
                    # Unmapped or None-mapped: non-empty values go to extra_data
                    extra_data[csv_col] = value

            # Parse propensity strings to integers
            for prop_field in (
                "propensity_general",
                "propensity_primary",
                "propensity_combined",
            ):
                raw = voter.get(prop_field)
                if isinstance(raw, str):
                    voter[prop_field] = parse_propensity(raw)

            # Coerce numeric fields from CSV strings
            for int_field in ("age", "household_size", "cell_phone_confidence"):
                raw = voter.get(int_field)
                if isinstance(raw, str):
                    raw = raw.strip()
                    try:
                        voter[int_field] = int(raw) if raw else None
                    except ValueError:
                        voter[int_field] = None

            for float_field in ("latitude", "longitude"):
                raw = voter.get(float_field)
                if isinstance(raw, str):
                    raw = raw.strip()
                    try:
                        voter[float_field] = float(raw) if raw else None
                    except ValueError:
                        voter[float_field] = None

            # Parse voting history from original CSV row columns
            voting_history = parse_voting_history(row)
            if voting_history:
                voter["voting_history"] = voting_history

            voter["extra_data"] = extra_data

            # Validate: must have at least first_name or last_name
            has_first = (
                bool(voter.get("first_name", "").strip())
                if voter.get("first_name")
                else False
            )
            has_last = (
                bool(voter.get("last_name", "").strip())
                if voter.get("last_name")
                else False
            )

            if not has_first and not has_last:
                result_dict.update(
                    {
                        "voter": voter,
                        "error": (
                            "Missing required field: at least"
                            " one of first_name or last_name"
                            " is required"
                        ),
                    }
                )
            else:
                result_dict["voter"] = voter

            results.append(result_dict)

        return results

    async def process_csv_batch(
        self,
        rows: list[dict[str, str]],
        field_mapping: dict[str, str | None],
        campaign_id: str,
        source_type: str,
        session: AsyncSession,
    ) -> tuple[int, list[dict], int]:
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
            Tuple of (imported_count, error_list, phones_created) where
            error_list contains dicts with "row" (original row) and "reason"
            (error message), and phones_created is the number of VoterPhone
            records created in this batch.
        """
        mapped_results = self.apply_field_mapping(
            rows, field_mapping, campaign_id, source_type
        )

        valid_voters: list[dict] = []
        phone_values: list[str | None] = []
        errors: list[dict] = []

        for i, result in enumerate(mapped_results):
            if result.get("error"):
                errors.append(
                    {
                        "row": rows[i] if i < len(rows) else {},
                        "reason": result["error"],
                    }
                )
            else:
                voter = result["voter"]
                # Ensure source_id has a value for upsert; generate if missing
                if not voter.get("source_id"):
                    voter["source_id"] = str(uuid.uuid4())
                # Extract phone_value before inserting (not a Voter column)
                phone_values.append(result.get("phone_value"))
                valid_voters.append(voter)

        phones_created = 0

        if valid_voters:
            # Build SET clause from Voter model columns (not from row keys)
            stmt = insert(Voter).values(valid_voters)
            update_cols = {
                col.name: getattr(stmt.excluded, col.name)
                for col in Voter.__table__.columns
                if col.name not in _UPSERT_EXCLUDE
            }
            update_cols["updated_at"] = func.now()

            stmt = stmt.on_conflict_do_update(
                index_elements=["campaign_id", "source_type", "source_id"],
                set_=update_cols,
            ).returning(Voter.id)

            result = await session.execute(stmt)
            voter_ids = [row[0] for row in result.all()]
            await session.flush()

            # Create VoterPhone records for voters with phone data
            phone_records: list[dict] = []
            for i, phone_raw in enumerate(phone_values):
                if phone_raw and i < len(voter_ids):
                    normalized = normalize_phone(phone_raw)
                    if normalized is not None:
                        phone_records.append(
                            {
                                "campaign_id": valid_voters[i]["campaign_id"],
                                "voter_id": voter_ids[i],
                                "value": normalized,
                                "type": "cell",
                                "source": "import",
                                "is_primary": True,
                            }
                        )

            if phone_records:
                phone_stmt = insert(VoterPhone).values(phone_records)
                phone_stmt = phone_stmt.on_conflict_do_update(
                    constraint="uq_voter_phone_campaign_voter_value",
                    set_={
                        "type": phone_stmt.excluded.type,
                        "source": phone_stmt.excluded.source,
                        "updated_at": func.now(),
                        # is_primary deliberately EXCLUDED -- preserve user edits
                    },
                )
                await session.execute(phone_stmt)
                await session.flush()

            phones_created = len(phone_records)

        return len(valid_voters), errors, phones_created

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
        total_phones_created = 0
        total_rows = 0
        batch_size = 1000

        for row in reader:
            batch.append(row)
            total_rows += 1

            if len(batch) >= batch_size:
                imported, errors, phones = await self.process_csv_batch(
                    batch,
                    job.field_mapping,
                    str(job.campaign_id),
                    job.source_type,
                    session,
                )
                total_imported += imported
                total_skipped += len(errors)
                total_phones_created += phones
                all_errors.extend(errors)
                batch = []

                # Update progress
                job.total_rows = total_rows
                job.imported_rows = total_imported
                job.skipped_rows = total_skipped
                await session.flush()

        # Process remaining rows
        if batch:
            imported, errors, phones = await self.process_csv_batch(
                batch,
                job.field_mapping,
                str(job.campaign_id),
                job.source_type,
                session,
            )
            total_imported += imported
            total_skipped += len(errors)
            total_phones_created += phones
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
        job.phones_created = total_phones_created
        job.status = ImportStatus.COMPLETED
        await session.flush()

        logger.info(
            "Import %s complete: %s imported, %s phones created,"
            " %s skipped out of %s total",
            import_job_id,
            total_imported,
            total_phones_created,
            total_skipped,
            total_rows,
        )
