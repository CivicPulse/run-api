"""Import service for voter file processing.

Provides fuzzy field mapping suggestions, CSV parsing, and batch upsert
logic for the voter import pipeline.  Supports per-batch commits with
RLS restoration, crash-resume from last_committed_row, and per-batch
error writes to S3/MinIO.
"""

from __future__ import annotations

import csv
import io
import math
import re
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING

from loguru import logger
from rapidfuzz import fuzz, process
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.time import utcnow
from app.db.rls import commit_and_restore_rls, set_campaign_context
from app.models.import_job import (
    ImportChunk,
    ImportChunkStatus,
    ImportChunkTaskStatus,
    ImportJob,
    ImportStatus,
)
from app.models.voter import Voter
from app.models.voter_contact import VoterPhone
from app.services.import_recovery import advisory_lock_key

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
        # L2 friendly names
        "second_address_line",
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
        # L2 friendly names
        "registered_party",
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
        # L2 typo: double-t (D-08)
        "lattitude",
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
        "zip+4",
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
        # L2 friendly names
        "mailing_address_extra_line",
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
        "mailing_zip+4",
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
        # L2 friendly names (D-15: "Mailing Apartment Type" -> mailing_type)
        "mailing_apartment_type",
    ],
    "propensity_general": [
        "propensity_general",
        "general_propensity",
        # L2 official headers
        "general_turnout_score",
        # L2 friendly names
        "likelihood_to_vote",
    ],
    "propensity_primary": [
        "propensity_primary",
        "primary_propensity",
        # L2 official headers
        "primary_turnout_score",
        # L2 friendly names
        "primary_likelihood_to_vote",
    ],
    "propensity_combined": [
        "propensity_combined",
        "combined_propensity",
        # L2 official headers
        "combined_turnout_score",
        "overall_turnout_score",
        # L2 friendly names
        "combined_general_and_primary_likelihood_to_vote",
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
        # L2 friendly names
        "military_active/veteran",
    ],
    "party_change_indicator": [
        "party_change_indicator",
        "party_change",
        # L2 official headers
        "voters_partychangeindicator",
        # L2 friendly names
        "voter_changed_party?",
    ],
    "cell_phone_confidence": [
        "cell_phone_confidence",
        "cell_phone_confidence_code",
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
        # L2 friendly name (D-13: "Mailing Household Size" -> household_size)
        "mailing_household_size",
    ],
    "family_id": [
        "family_id",
        "familyid",
        # L2 official headers
        "voters_familyid",
        # L2 friendly names (D-15: "Mailing Family ID" -> family_id)
        "mailing_family_id",
    ],
    # --- L2 detail columns (new Voter model columns) ---
    "house_number": [
        "house_number",
    ],
    "street_number_parity": [
        "street_number_parity",
        # L2 friendly name
        "street_number_odd/even",
    ],
    "mailing_house_number": [
        "mailing_house_number",
    ],
    "mailing_address_prefix": [
        "mailing_address_prefix",
    ],
    "mailing_street_name": [
        "mailing_street_name",
    ],
    "mailing_designator": [
        "mailing_designator",
        # L2 typo: missing 'i' (D-08)
        "mailng_designator",
    ],
    "mailing_suffix_direction": [
        "mailing_suffix_direction",
    ],
    "mailing_apartment_number": [
        "mailing_apartment_number",
        # L2 typo: transposed letters (D-08)
        "mailing_aptartment_number",
    ],
    "mailing_bar_code": [
        "mailing_bar_code",
    ],
    "mailing_verifier": [
        "mailing_verifier",
    ],
    "mailing_household_size": [
        # L2 official header
        # D-13: "Mailing_Families_HHCount" -> mailing_household_size
        "mailing_families_hhcount",
    ],
    "mailing_household_party_registration": [
        "mailing_household_party_registration",
    ],
}

TERMINAL_IMPORT_STATUSES = {
    ImportStatus.COMPLETED,
    ImportStatus.COMPLETED_WITH_ERRORS,
    ImportStatus.FAILED,
    ImportStatus.CANCELLED,
}
TERMINAL_CHUNK_STATUSES = {
    ImportChunkStatus.COMPLETED,
    ImportChunkStatus.FAILED,
    ImportChunkStatus.CANCELLED,
}


@dataclass(slots=True)
class ChunkFinalizationSummary:
    """Aggregate view of a parent import's chunk state."""

    total_chunks: int
    terminal_chunks: int
    completed_chunks: int
    failed_chunks: int
    cancelled_chunks: int
    imported_rows: int
    skipped_rows: int
    phones_created: int
    error_keys: list[str]


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

# Map full party names (case-insensitive) to standard abbreviations used by
# the frontend filter UI and stored in the database.
_PARTY_ABBREV: dict[str, str] = {
    "democratic": "DEM",
    "democrat": "DEM",
    "dem": "DEM",
    "republican": "REP",
    "rep": "REP",
    "gop": "REP",
    "non-partisan": "NPA",
    "nonpartisan": "NPA",
    "no party affiliation": "NPA",
    "npa": "NPA",
    "independent": "IND",
    "ind": "IND",
    "libertarian": "LIB",
    "lib": "LIB",
    "green": "GRN",
    "grn": "GRN",
}


def normalize_party(value: str) -> str | None:
    """Normalize a party name to its standard abbreviation.

    Returns the abbreviation if recognized, otherwise returns the
    original value stripped of whitespace.  Returns ``None`` for
    empty or whitespace-only input.
    """
    if not value or not value.strip():
        return None
    return _PARTY_ABBREV.get(value.strip().lower(), value.strip())


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


_CANONICAL_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")
_VOTED_IN_RE = re.compile(r"^Vote[dr]?\s+in\s+(\d{4})(?:\s+Primary)?$", re.IGNORECASE)
_BARE_YEAR_RE = re.compile(r"^(\d{4})$")
_VOTED_VALUES = frozenset({"Y", "A", "E"})


def parse_voting_history(row: dict[str, str]) -> list[str]:
    """Extract voting history entries from an L2 row dict.

    Scans keys for voting history column patterns and maps them to
    canonical ``General_YYYY`` / ``Primary_YYYY`` entries.

    Supported patterns (per D-01 through D-04):
      - ``General_YYYY`` / ``Primary_YYYY`` (canonical)
      - ``Voted in YYYY`` -> ``General_YYYY``
      - ``Voted in YYYY Primary`` -> ``Primary_YYYY``
      - ``Voter in YYYY Primary`` (L2 typo) -> ``Primary_YYYY``
      - Bare ``YYYY`` -> ``General_YYYY``

    Values Y, A, or E (case-insensitive) indicate voter participation.
    """
    history: list[str] = []
    for col, val in row.items():
        if not val or val.strip().upper() not in _VOTED_VALUES:
            continue
        # Pattern 1: General_YYYY / Primary_YYYY (canonical)
        if _CANONICAL_HISTORY_RE.match(col):
            history.append(col)
            continue
        # Patterns 2-4: "Voted in YYYY", "Voted in YYYY Primary",
        # "Voter in YYYY Primary" (D-01, D-02, D-04)
        m = _VOTED_IN_RE.match(col)
        if m:
            year = m.group(1)
            is_primary = col.strip().lower().endswith("primary")
            canonical = f"Primary_{year}" if is_primary else f"General_{year}"
            history.append(canonical)
            continue
        # Pattern 5: Bare "YYYY" -> General_YYYY (D-03)
        m = _BARE_YEAR_RE.match(col.strip())
        if m:
            history.append(f"General_{m.group(1)}")
            continue
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
    }
)

DEFAULT_MAX_BIND_PARAMS = 32_767
DEFAULT_EXTRA_COLUMNS_PER_ROW = 4

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
    # L2 detail columns
    "house_number",
    "street_number_parity",
    "mailing_house_number",
    "mailing_address_prefix",
    "mailing_street_name",
    "mailing_designator",
    "mailing_suffix_direction",
    "mailing_apartment_number",
    "mailing_bar_code",
    "mailing_verifier",
    "mailing_household_party_registration",
    "mailing_household_size",
}


def calculate_effective_rows_per_write(
    mapped_column_count: int,
    target_rows: int,
    max_bind_params: int = DEFAULT_MAX_BIND_PARAMS,
    extra_columns_per_row: int = DEFAULT_EXTRA_COLUMNS_PER_ROW,
) -> int:
    """Clamp a row count to the asyncpg bind-parameter ceiling."""
    cols_per_row = max(mapped_column_count + extra_columns_per_row, 1)
    bind_limited_rows = max_bind_params // cols_per_row
    return max(1, min(target_rows, bind_limited_rows))


def plan_chunk_ranges(
    total_rows: int,
    mapped_column_count: int,
    chunk_size_default: int,
    file_size_bytes: int | None = None,
) -> list[tuple[int, int]]:
    """Plan deterministic 1-based inclusive chunk ranges."""
    if total_rows <= 0:
        return []

    bind_limited_rows = calculate_effective_rows_per_write(
        mapped_column_count=mapped_column_count,
        target_rows=chunk_size_default,
    )
    chunk_rows = bind_limited_rows
    if file_size_bytes is not None:
        average_bytes_per_row = max(file_size_bytes // max(total_rows, 1), 1)
        target_chunk_bytes = 2_000_000
        file_limited_rows = max(1, target_chunk_bytes // average_bytes_per_row)
        chunk_rows = max(
            1,
            min(bind_limited_rows, file_limited_rows, chunk_size_default),
        )
    return [
        (row_start, min(row_start + chunk_rows - 1, total_rows))
        for row_start in range(1, total_rows + 1, chunk_rows)
    ]


def should_use_serial_import(total_rows: int | None, serial_threshold: int) -> bool:
    """Keep unknown and below-threshold imports on the serial path."""
    if total_rows is None or not isinstance(total_rows, int):
        return True
    return total_rows <= serial_threshold


def _voter_conflict_sort_key(voter: dict) -> tuple[str, str, str]:
    """Order voter upserts by their conflict target to reduce lock inversion."""
    return (
        str(voter.get("campaign_id") or ""),
        str(voter.get("source_type") or ""),
        str(voter.get("source_id") or ""),
    )


def _phone_conflict_sort_key(phone_record: dict) -> tuple[str, str, str]:
    """Order phone upserts by their uniqueness contract."""
    return (
        str(phone_record.get("campaign_id") or ""),
        str(phone_record.get("voter_id") or ""),
        str(phone_record.get("value") or ""),
    )


def suggest_field_mapping(csv_columns: list[str]) -> dict[str, dict]:
    """Suggest canonical field mappings for CSV column headers.

    Uses exact alias lookup first, then RapidFuzz fuzzy matching with a
    75% similarity threshold to map each CSV column header to the closest
    canonical voter field name.

    Args:
        csv_columns: List of column header strings from the CSV file.

    Returns:
        Dict mapping each CSV column to ``{"field": str|None,
        "match_type": "exact"|"fuzzy"|None}``.  None-mapped columns will
        be placed into the voter's ``extra_data`` JSONB field during import.
    """
    mapping: dict[str, dict] = {}
    used_fields: set[str] = set()

    for col in csv_columns:
        normalized = col.strip().lower().replace(" ", "_")

        # Try exact alias lookup first
        if normalized in _ALIAS_TO_FIELD:
            field = _ALIAS_TO_FIELD[normalized]
            if field not in used_fields:
                mapping[col] = {"field": field, "match_type": "exact"}
                used_fields.add(field)
            else:
                mapping[col] = {"field": None, "match_type": None}
            continue

        # Fall back to fuzzy matching
        match = process.extractOne(
            normalized,
            _ALIAS_LIST,
            scorer=fuzz.ratio,
            score_cutoff=75,
        )
        if match:
            field = _ALIAS_TO_FIELD[match[0]]
            if field not in used_fields:
                mapping[col] = {"field": field, "match_type": "fuzzy"}
                used_fields.add(field)
            else:
                mapping[col] = {"field": None, "match_type": None}
        else:
            mapping[col] = {"field": None, "match_type": None}

    return mapping


def detect_l2_format(mapping_result: dict[str, dict]) -> str | None:
    """Detect if columns indicate an L2 voter file format.

    Returns ``'l2'`` if >80% of columns have exact alias matches,
    ``'generic'`` otherwise.  Returns ``None`` if no columns.
    """
    total = len(mapping_result)
    if total == 0:
        return None
    exact_count = sum(
        1
        for v in mapping_result.values()
        if v.get("match_type") == "exact" and v.get("field") is not None
    )
    ratio = exact_count / total
    return "l2" if ratio > 0.80 else "generic"


_STREAM_CHUNK_SIZE = 65_536  # 64KB -- override aiobotocore 1024 default


def _detect_encoding(first_chunk: bytes) -> str:
    """Detect file encoding from the first S3 chunk.

    Tries utf-8-sig (handles BOM) first, falls back to latin-1.
    Per D-03: same logic as existing code but applied to one chunk.
    """
    try:
        first_chunk.decode("utf-8-sig")
        return "utf-8-sig"
    except (UnicodeDecodeError, ValueError):
        return "latin-1"


async def stream_csv_lines(
    storage: StorageService,
    file_key: str,
) -> AsyncIterator[str]:
    """Yield decoded text lines from an S3 CSV file.

    Streams byte chunks via StorageService.download_file(), reconstructs
    complete lines across chunk boundaries, detects encoding from the
    first chunk. Per D-01, D-03, D-04.

    Memory: one chunk buffer (~64KB) + one partial-line remainder.
    """
    encoding: str | None = None
    remainder = b""

    async for chunk in storage.download_file(file_key, chunk_size=_STREAM_CHUNK_SIZE):
        if encoding is None:
            encoding = _detect_encoding(chunk)

        data = remainder + chunk
        parts = data.split(b"\n")
        remainder = parts.pop()

        for raw_line in parts:
            line = raw_line.rstrip(b"\r").decode(encoding)
            if line:  # Skip empty lines
                yield line

    # Flush final remainder (last line without trailing newline)
    if remainder:
        line = remainder.rstrip(b"\r").decode(encoding or "utf-8")
        if line:
            yield line


async def count_csv_data_rows(storage: StorageService, file_key: str) -> int:
    """Count CSV data rows with O(1) memory by streaming the file once."""
    header_seen = False
    total_rows = 0

    async for _line in stream_csv_lines(storage, file_key):
        if not header_seen:
            header_seen = True
            continue
        total_rows += 1

    return total_rows


class ImportService:
    """Voter file import processing service.

    Handles CSV column detection, field mapping application, batch upsert
    to the voters table, and full import file orchestration.
    """

    @staticmethod
    def _mark_progress(job: ImportJob) -> None:
        """Persist the latest durable progress timestamp on the import job."""
        job.last_progress_at = utcnow()

    @staticmethod
    def _normalize_task_status(
        value: ImportChunkTaskStatus | str | None,
    ) -> ImportChunkTaskStatus | None:
        if value is None or isinstance(value, ImportChunkTaskStatus):
            return value
        return ImportChunkTaskStatus(value)

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
            for int_field in (
                "age",
                "household_size",
                "cell_phone_confidence",
                "mailing_household_size",
            ):
                raw = voter.get(int_field)
                if isinstance(raw, str):
                    raw = raw.strip()
                    try:
                        voter[int_field] = int(raw) if raw else None
                    except ValueError:
                        logger.debug(
                            "Could not coerce %s=%r to int, setting to NULL",
                            int_field,
                            raw,
                        )
                        voter[int_field] = None

            for float_field in ("latitude", "longitude"):
                raw = voter.get(float_field)
                if isinstance(raw, str):
                    raw = raw.strip()
                    try:
                        parsed = float(raw) if raw else None
                        voter[float_field] = (
                            parsed if parsed is None or math.isfinite(parsed) else None
                        )
                    except (ValueError, TypeError):
                        logger.debug(
                            "Could not coerce %s=%r to float, setting to NULL",
                            float_field,
                            raw,
                        )
                        voter[float_field] = None

            # Normalize party name to standard abbreviation
            if voter.get("party") and isinstance(voter["party"], str):
                voter["party"] = normalize_party(voter["party"])

            # geom is computed post-insert from lat/lon (bulk insert
            # can't handle PostGIS Geometry as bound parameters)
            voter.pop("geom", None)

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
            ordered_pairs = sorted(
                zip(valid_voters, phone_values, strict=False),
                key=lambda pair: _voter_conflict_sort_key(pair[0]),
            )
            valid_voters = [pair[0] for pair in ordered_pairs]
            phone_values = [pair[1] for pair in ordered_pairs]

            # Build SET clause from Voter model columns (not from row keys)
            stmt = insert(Voter).values(valid_voters)
            update_cols = {
                col.name: getattr(stmt.excluded, col.name)
                for col in Voter.__table__.columns
                if col.name not in _UPSERT_EXCLUDE
            }
            update_cols["updated_at"] = func.now()
            # Keep lat/lon in sync — preserve existing values when
            # incoming coordinates are incomplete (NULL).
            update_cols["latitude"] = func.coalesce(
                stmt.excluded.latitude, Voter.__table__.c.latitude
            )
            update_cols["longitude"] = func.coalesce(
                stmt.excluded.longitude, Voter.__table__.c.longitude
            )
            # geom is excluded from bulk insert/update (PostGIS Geometry
            # can't be a bound parameter in multi-row VALUES); computed below.
            update_cols.pop("geom", None)

            stmt = stmt.on_conflict_do_update(
                index_elements=["campaign_id", "source_type", "source_id"],
                set_=update_cols,
            ).returning(Voter.id)

            result = await session.execute(stmt)
            voter_ids = [row[0] for row in result.all()]
            await session.flush()

            # Compute PostGIS geometry from lat/lon for upserted voters
            if voter_ids:
                await session.execute(
                    text(
                        "UPDATE voters"
                        " SET geom = ST_SetSRID("
                        "ST_MakePoint(longitude, latitude), 4326)"
                        " WHERE id = ANY(:ids)"
                        " AND latitude IS NOT NULL"
                        " AND longitude IS NOT NULL"
                    ),
                    {"ids": voter_ids},
                )

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
                phone_records.sort(key=_phone_conflict_sort_key)
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

    async def process_csv_batch_primary(
        self,
        rows: list[dict[str, str]],
        field_mapping: dict[str, str | None],
        campaign_id: str,
        source_type: str,
        session: AsyncSession,
    ) -> tuple[int, list[dict], list[dict], list[str]]:
        """Process only the voter upsert and emit durable secondary work items."""
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
                if not voter.get("source_id"):
                    voter["source_id"] = str(uuid.uuid4())
                phone_values.append(result.get("phone_value"))
                valid_voters.append(voter)

        if not valid_voters:
            return 0, errors, [], []

        ordered_pairs = sorted(
            zip(valid_voters, phone_values, strict=False),
            key=lambda pair: _voter_conflict_sort_key(pair[0]),
        )
        valid_voters = [pair[0] for pair in ordered_pairs]
        phone_values = [pair[1] for pair in ordered_pairs]

        stmt = insert(Voter).values(valid_voters)
        update_cols = {
            col.name: getattr(stmt.excluded, col.name)
            for col in Voter.__table__.columns
            if col.name not in _UPSERT_EXCLUDE
        }
        update_cols["updated_at"] = func.now()
        update_cols["latitude"] = func.coalesce(
            stmt.excluded.latitude, Voter.__table__.c.latitude
        )
        update_cols["longitude"] = func.coalesce(
            stmt.excluded.longitude, Voter.__table__.c.longitude
        )
        update_cols.pop("geom", None)

        result = await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["campaign_id", "source_type", "source_id"],
                set_=update_cols,
            ).returning(Voter.id)
        )
        voter_ids = [str(row[0]) for row in result.all()]
        await session.flush()

        phone_manifest: list[dict] = []
        geometry_manifest: list[str] = []
        for index, voter in enumerate(valid_voters):
            if index >= len(voter_ids):
                continue
            voter_id = voter_ids[index]
            phone_raw = phone_values[index]
            if phone_raw:
                normalized = normalize_phone(phone_raw)
                if normalized is not None:
                    phone_manifest.append(
                        {
                            "campaign_id": voter["campaign_id"],
                            "voter_id": voter_id,
                            "value": normalized,
                            "type": "cell",
                            "source": "import",
                            "is_primary": True,
                        }
                    )
            if voter.get("latitude") is not None and voter.get("longitude") is not None:
                geometry_manifest.append(voter_id)

        return len(valid_voters), errors, phone_manifest, geometry_manifest

    async def _apply_phone_manifest(
        self, session: AsyncSession, phone_manifest: list[dict]
    ) -> int:
        """Bulk apply deferred phone work for one chunk."""
        if not phone_manifest:
            return 0
        phone_records = sorted(phone_manifest, key=_phone_conflict_sort_key)
        phone_stmt = insert(VoterPhone).values(phone_records)
        phone_stmt = phone_stmt.on_conflict_do_update(
            constraint="uq_voter_phone_campaign_voter_value",
            set_={
                "type": phone_stmt.excluded.type,
                "source": phone_stmt.excluded.source,
                "updated_at": func.now(),
            },
        )
        await session.execute(phone_stmt)
        await session.flush()
        return len(phone_records)

    async def _apply_geometry_manifest(
        self, session: AsyncSession, geometry_manifest: list[str]
    ) -> None:
        """Bulk apply deferred geometry backfill for one chunk."""
        if not geometry_manifest:
            return
        await session.execute(
            text(
                "UPDATE voters"
                " SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)"
                " WHERE id = ANY(:ids)"
                " AND latitude IS NOT NULL"
                " AND longitude IS NOT NULL"
            ),
            {"ids": geometry_manifest},
        )

    async def maybe_complete_chunk_after_secondary_tasks(
        self,
        *,
        session: AsyncSession,
        storage: StorageService,
        job: ImportJob,
        chunk: ImportChunk,
        campaign_id: str,
    ) -> bool:
        """Mark a chunk terminal only after secondary work reaches terminal state."""
        phone_status = self._normalize_task_status(chunk.phone_task_status)
        geometry_status = self._normalize_task_status(chunk.geometry_task_status)
        terminal_statuses = {
            ImportChunkTaskStatus.COMPLETED,
            ImportChunkTaskStatus.FAILED,
            ImportChunkTaskStatus.CANCELLED,
        }
        if (
            phone_status not in terminal_statuses
            or geometry_status not in terminal_statuses
        ):
            return False

        if chunk.status in TERMINAL_CHUNK_STATUSES:
            return await self.maybe_finalize_chunked_import(
                session=session,
                storage=storage,
                job=job,
                campaign_id=campaign_id,
            )

        if (
            phone_status == ImportChunkTaskStatus.FAILED
            or geometry_status == ImportChunkTaskStatus.FAILED
        ):
            chunk.status = ImportChunkStatus.FAILED
            chunk.error_message = chunk.phone_task_error or chunk.geometry_task_error
        elif job.cancelled_at is not None and (
            phone_status == ImportChunkTaskStatus.CANCELLED
            or geometry_status == ImportChunkTaskStatus.CANCELLED
        ):
            chunk.status = ImportChunkStatus.CANCELLED
            chunk.error_message = None
        else:
            chunk.status = ImportChunkStatus.COMPLETED
            chunk.error_message = None

        self._mark_progress(chunk)
        await commit_and_restore_rls(session, campaign_id)
        return await self.maybe_finalize_chunked_import(
            session=session,
            storage=storage,
            job=job,
            campaign_id=campaign_id,
        )

    @staticmethod
    def _build_error_csv(errors: list[dict]) -> bytes:
        """Build CSV bytes from error dicts.

        Each error dict has "row" (original CSV row dict) and "reason"
        (string).  Returns UTF-8 encoded CSV bytes with header row.
        """
        if not errors:
            return b""
        buf = io.StringIO()
        sample_row = errors[0].get("row", {})
        fieldnames = list(sample_row.keys()) + ["error_reason"]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for err in errors:
            row_data = dict(err.get("row", {}))
            row_data["error_reason"] = err.get("reason", "Unknown error")
            writer.writerow(row_data)
        return buf.getvalue().encode("utf-8")

    async def _merge_error_files(
        self,
        storage: StorageService,
        batch_error_keys: list[str],
        job: ImportJob | ImportChunk,
        import_job_id: str,
    ) -> None:
        """Merge per-batch error CSVs into a single error report.

        Downloads each batch error file, concatenates them (header from
        first file only), uploads the merged file, and deletes batch
        files.
        """
        merged_buf = io.StringIO()
        is_first = True

        for key in sorted(batch_error_keys):
            chunks: list[bytes] = []
            async for chunk in storage.download_file(key):
                chunks.append(chunk)
            content = b"".join(chunks).decode("utf-8")

            if is_first:
                merged_buf.write(content)
                is_first = False
            else:
                # Skip header line from subsequent files
                lines = content.split("\n", 1)
                if len(lines) > 1 and lines[1]:
                    merged_buf.write(lines[1])

        if isinstance(job, ImportChunk):
            final_error_key = (
                f"imports/{job.campaign_id}/{import_job_id}/chunks/{job.id}/errors.csv"
            )
        else:
            final_error_key = f"imports/{job.campaign_id}/{import_job_id}/errors.csv"
        await storage.upload_bytes(
            final_error_key,
            merged_buf.getvalue().encode("utf-8"),
            "text/csv",
        )
        job.error_report_key = final_error_key

        # Clean up per-batch files
        await storage.delete_objects(batch_error_keys)

    async def _try_claim_chunk_finalization_lock(
        self,
        session: AsyncSession,
        import_job_id: uuid.UUID,
    ) -> bool:
        """Claim a short-lived xact advisory lock for chunk fan-in."""
        result = await session.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": -advisory_lock_key(import_job_id)},
        )
        scalar = result.scalar()
        return bool(await scalar if hasattr(scalar, "__await__") else scalar)

    async def _get_chunk_finalization_summary(
        self,
        session: AsyncSession,
        import_job_id: uuid.UUID,
    ) -> ChunkFinalizationSummary:
        """Read aggregate chunk state for one parent import."""
        summary_result = await session.execute(
            select(
                func.count(ImportChunk.id),
                func.count(ImportChunk.id).filter(
                    ImportChunk.status.in_(TERMINAL_CHUNK_STATUSES)
                ),
                func.count(ImportChunk.id).filter(
                    ImportChunk.status == ImportChunkStatus.COMPLETED
                ),
                func.count(ImportChunk.id).filter(
                    ImportChunk.status == ImportChunkStatus.FAILED
                ),
                func.count(ImportChunk.id).filter(
                    ImportChunk.status == ImportChunkStatus.CANCELLED
                ),
                func.coalesce(func.sum(ImportChunk.imported_rows), 0),
                func.coalesce(func.sum(ImportChunk.skipped_rows), 0),
                func.coalesce(func.sum(ImportChunk.phones_created), 0),
            ).where(ImportChunk.import_job_id == import_job_id)
        )
        row = summary_result.one()
        error_key_rows = await session.execute(
            select(ImportChunk.error_report_key).where(
                ImportChunk.import_job_id == import_job_id,
                ImportChunk.error_report_key.is_not(None),
            )
        )
        error_keys = [key for key in error_key_rows.scalars().all() if key]
        return ChunkFinalizationSummary(
            total_chunks=int(row[0] or 0),
            terminal_chunks=int(row[1] or 0),
            completed_chunks=int(row[2] or 0),
            failed_chunks=int(row[3] or 0),
            cancelled_chunks=int(row[4] or 0),
            imported_rows=int(row[5] or 0),
            skipped_rows=int(row[6] or 0),
            phones_created=int(row[7] or 0),
            error_keys=error_keys,
        )

    def _determine_chunked_parent_status(
        self,
        job: ImportJob,
        summary: ChunkFinalizationSummary,
    ) -> ImportStatus:
        """Map terminal chunk outcomes to one parent terminal status."""
        if (
            job.cancelled_at is not None
            and summary.cancelled_chunks > 0
            and summary.failed_chunks == 0
        ):
            return ImportStatus.CANCELLED
        unsuccessful_chunks = summary.failed_chunks + summary.cancelled_chunks
        if summary.completed_chunks > 0 and unsuccessful_chunks > 0:
            return ImportStatus.COMPLETED_WITH_ERRORS
        if unsuccessful_chunks > 0 and summary.completed_chunks == 0:
            return ImportStatus.FAILED
        return ImportStatus.COMPLETED

    def _build_chunked_parent_error_message(
        self,
        summary: ChunkFinalizationSummary,
        status: ImportStatus,
    ) -> str | None:
        """Create the parent summary error message for chunk fan-in."""
        unsuccessful_chunks = summary.failed_chunks + summary.cancelled_chunks
        if status == ImportStatus.CANCELLED:
            return (
                f"Import cancelled after {summary.completed_chunks} of "
                f"{summary.total_chunks} chunks completed."
            )
        if status == ImportStatus.COMPLETED_WITH_ERRORS:
            return (
                f"Import completed with errors: {unsuccessful_chunks} of "
                f"{summary.total_chunks} chunks failed. See merged error report."
            )
        if status == ImportStatus.FAILED:
            return (
                f"Import failed: all {summary.total_chunks} chunks failed. "
                "See merged error report for row-level details."
            )
        return None

    async def maybe_finalize_chunked_import(
        self,
        *,
        session: AsyncSession,
        storage: StorageService,
        job: ImportJob,
        campaign_id: str,
    ) -> bool:
        """Finalize a chunked parent import exactly once when all chunks terminate."""
        if job.status in TERMINAL_IMPORT_STATUSES:
            return False

        if not await self._try_claim_chunk_finalization_lock(session, job.id):
            return False

        await session.refresh(job)
        if job.status in TERMINAL_IMPORT_STATUSES:
            return False

        summary = await self._get_chunk_finalization_summary(session, job.id)
        if summary.total_chunks == 0 or summary.terminal_chunks != summary.total_chunks:
            return False

        status = self._determine_chunked_parent_status(job, summary)
        if summary.error_keys:
            await self._merge_error_files(
                storage=storage,
                batch_error_keys=summary.error_keys,
                job=job,
                import_job_id=str(job.id),
            )
        else:
            job.error_report_key = None

        job.imported_rows = summary.imported_rows
        job.skipped_rows = summary.skipped_rows
        job.phones_created = summary.phones_created
        job.error_message = self._build_chunked_parent_error_message(summary, status)
        job.status = status
        self._mark_progress(job)
        await commit_and_restore_rls(session, campaign_id)
        return True

    async def _process_single_batch(
        self,
        batch: list[dict[str, str]],
        batch_num: int,
        job: ImportJob,
        campaign_id: str,
        session: AsyncSession,
        storage: StorageService,
        error_prefix: str,
        batch_error_keys: list[str],
        counters: dict,
        *,
        progress_target: ImportJob | ImportChunk,
    ) -> None:
        """Process a single batch with commit, RLS restore, and error handling.

        Updates counters dict in-place with running totals.
        """
        is_chunk_target = isinstance(progress_target, ImportChunk)
        try:
            if is_chunk_target:
                (
                    imported,
                    errors,
                    phone_manifest,
                    geometry_manifest,
                ) = await self.process_csv_batch_primary(
                    batch,
                    job.field_mapping,
                    campaign_id,
                    job.source_type,
                    session,
                )
                phones = 0
                counters["phone_manifest"].extend(phone_manifest)
                counters["geometry_manifest"].extend(geometry_manifest)
            else:
                imported, errors, phones = await self.process_csv_batch(
                    batch,
                    job.field_mapping,
                    campaign_id,
                    job.source_type,
                    session,
                )
            counters["total_imported"] += imported
            counters["total_skipped"] += len(errors)
            counters["total_phones_created"] += phones

            # Write per-batch errors to MinIO immediately
            if errors:
                error_csv_bytes = self._build_error_csv(errors)
                batch_error_key = f"{error_prefix}batch_{batch_num:04d}.csv"
                await storage.upload_bytes(batch_error_key, error_csv_bytes, "text/csv")
                batch_error_keys.append(batch_error_key)

            # Update counters and commit
            if is_chunk_target:
                progress_target.imported_rows = counters["total_imported"]
                progress_target.skipped_rows = counters["total_skipped"]
                progress_target.phones_created = counters["total_phones_created"]
                progress_target.phone_manifest = counters["phone_manifest"]
                progress_target.geometry_manifest = counters["geometry_manifest"]
                progress_target.last_committed_row = counters["last_absolute_row"]
                self._mark_progress(progress_target)
            else:
                job.total_rows = counters["total_rows"]
                job.imported_rows = counters["total_imported"]
                job.skipped_rows = counters["total_skipped"]
                job.phones_created = counters["total_phones_created"]
                job.last_committed_row = counters["last_absolute_row"]
                self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)

            logger.debug(
                "Batch {} committed: {} imported, {} skipped, {} total",
                batch_num,
                imported,
                len(errors),
                counters["total_rows"],
            )

        except Exception:
            # Batch failure: rollback, write errors, continue
            logger.exception(
                "Batch {} failed for import {}",
                batch_num,
                str(job.id),
            )
            await session.rollback()
            await set_campaign_context(session, campaign_id)

            # Re-read counters from job object (reflects last committed
            # state because expire_on_commit=False and rollback reverts
            # to last commit)
            counters["total_imported"] = progress_target.imported_rows or 0
            counters["total_skipped"] = progress_target.skipped_rows or 0
            counters["total_phones_created"] = (
                progress_target.phones_created or 0
                if is_chunk_target
                else job.phones_created or 0
            )

            # Write entire failed batch to error file
            failed_errors = [
                {"row": r, "reason": "Batch processing failed"} for r in batch
            ]
            counters["total_skipped"] += len(failed_errors)
            error_csv_bytes = self._build_error_csv(failed_errors)
            batch_error_key = f"{error_prefix}batch_{batch_num:04d}.csv"
            await storage.upload_bytes(batch_error_key, error_csv_bytes, "text/csv")
            batch_error_keys.append(batch_error_key)

            # Update counters and commit after error accounting
            if is_chunk_target:
                progress_target.skipped_rows = counters["total_skipped"]
                progress_target.phones_created = counters["total_phones_created"]
                progress_target.phone_manifest = counters["phone_manifest"]
                progress_target.geometry_manifest = counters["geometry_manifest"]
                progress_target.last_committed_row = counters["last_absolute_row"]
                self._mark_progress(progress_target)
            else:
                job.total_rows = counters["total_rows"]
                job.skipped_rows = counters["total_skipped"]
                job.last_committed_row = counters["last_absolute_row"]
                self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)

    async def process_import_range(
        self,
        *,
        job: ImportJob,
        import_job_id: str,
        session: AsyncSession,
        storage: StorageService,
        campaign_id: str,
        row_start: int,
        row_end: int | None,
        chunk: ImportChunk | None = None,
    ) -> None:
        """Process an inclusive absolute CSV row range with serial durability."""
        progress_target: ImportJob | ImportChunk = chunk or job
        is_chunk_target = chunk is not None
        effective_row_start = max(row_start, 1)
        rows_to_skip = max(
            progress_target.last_committed_row or 0,
            effective_row_start - 1,
        )
        is_resume = (progress_target.last_committed_row or 0) > 0

        num_mapped = sum(1 for v in (job.field_mapping or {}).values() if v)
        effective_batch_size = calculate_effective_rows_per_write(
            mapped_column_count=num_mapped,
            target_rows=settings.import_batch_size,
        )

        if not is_resume:
            if is_chunk_target:
                progress_target.status = ImportChunkStatus.PROCESSING
                progress_target.imported_rows = 0
                progress_target.skipped_rows = 0
                progress_target.phones_created = 0
                progress_target.phone_task_status = ImportChunkTaskStatus.PENDING
                progress_target.geometry_task_status = ImportChunkTaskStatus.PENDING
                progress_target.phone_task_error = None
                progress_target.geometry_task_error = None
                progress_target.phone_manifest = []
                progress_target.geometry_manifest = []
                progress_target.last_committed_row = 0
                progress_target.error_report_key = None
                progress_target.error_message = None
                self._mark_progress(progress_target)
            else:
                job.status = ImportStatus.PROCESSING
                job.imported_rows = 0
                job.skipped_rows = 0
                job.total_rows = 0
                job.last_committed_row = 0
                if getattr(job, "processing_started_at", None) is None:
                    job.processing_started_at = utcnow()
                job.error_message = None
                job.orphaned_at = None
                job.orphaned_reason = None
                job.source_exhausted_at = None
                self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)
        else:
            logger.info(
                "Resuming import {} from row {}",
                import_job_id,
                rows_to_skip,
            )

        header: list[str] | None = None
        batch: list[dict[str, str]] = []
        batch_num = 0
        absolute_row_number = 0
        batch_error_keys: list[str] = []
        chunk_cancelled = bool(is_chunk_target and job.cancelled_at is not None)
        if is_chunk_target:
            error_prefix = (
                f"imports/{job.campaign_id}/{import_job_id}/chunks/{chunk.id}/errors/"
            )
        else:
            error_prefix = f"imports/{job.campaign_id}/{import_job_id}/errors/"
        counters = {
            "total_rows": (
                (progress_target.imported_rows or 0)
                + (progress_target.skipped_rows or 0)
                if is_chunk_target
                else job.total_rows or 0
            ),
            "total_imported": progress_target.imported_rows or 0,
            "total_skipped": progress_target.skipped_rows or 0,
            "total_phones_created": (
                progress_target.phones_created or 0
                if is_chunk_target
                else job.phones_created or 0
            ),
            "phone_manifest": list(progress_target.phone_manifest or [])
            if is_chunk_target
            else [],
            "geometry_manifest": list(progress_target.geometry_manifest or [])
            if is_chunk_target
            else [],
            "last_absolute_row": progress_target.last_committed_row or 0,
        }

        if chunk_cancelled:
            progress_target.status = ImportChunkStatus.CANCELLED
            progress_target.error_message = None
            self._mark_progress(progress_target)
            await commit_and_restore_rls(session, campaign_id)
            return

        try:
            async for line in stream_csv_lines(storage, job.file_key):
                if header is None:
                    header = next(csv.reader([line]))
                    continue

                absolute_row_number += 1
                if absolute_row_number <= rows_to_skip:
                    continue
                if row_end is not None and absolute_row_number > row_end:
                    break

                values = next(csv.reader([line]))
                row = dict(zip(header, values, strict=False))
                batch.append(row)
                counters["total_rows"] += 1
                counters["last_absolute_row"] = absolute_row_number

                if len(batch) >= effective_batch_size:
                    batch_num += 1
                    await self._process_single_batch(
                        batch,
                        batch_num,
                        job,
                        campaign_id,
                        session,
                        storage,
                        error_prefix,
                        batch_error_keys,
                        counters,
                        progress_target=progress_target,
                    )
                    batch = []

                    await session.refresh(job)
                    if job.cancelled_at is not None:
                        logger.info(
                            "Import {} cancelled after batch {}",
                            import_job_id,
                            batch_num,
                        )
                        chunk_cancelled = is_chunk_target
                        break
        except UnicodeDecodeError:
            if is_chunk_target:
                progress_target.status = ImportChunkStatus.FAILED
                progress_target.error_message = "Unable to decode file content"
                self._mark_progress(progress_target)
            else:
                job.status = ImportStatus.FAILED
                job.error_message = "Unable to decode file content"
                self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)
            return
        except Exception as exc:
            if is_chunk_target:
                progress_target.status = ImportChunkStatus.FAILED
                progress_target.error_message = str(exc)
                self._mark_progress(progress_target)
                await commit_and_restore_rls(session, campaign_id)
            raise

        if batch:
            batch_num += 1
            try:
                await self._process_single_batch(
                    batch,
                    batch_num,
                    job,
                    campaign_id,
                    session,
                    storage,
                    error_prefix,
                    batch_error_keys,
                    counters,
                    progress_target=progress_target,
                )
            except Exception as exc:
                if is_chunk_target:
                    progress_target.status = ImportChunkStatus.FAILED
                    progress_target.error_message = str(exc)
                    self._mark_progress(progress_target)
                    await commit_and_restore_rls(session, campaign_id)
                raise
            await session.refresh(job)
            if is_chunk_target and job.cancelled_at is not None:
                chunk_cancelled = True

        if batch_error_keys:
            await self._merge_error_files(
                storage, batch_error_keys, progress_target, import_job_id
            )

        if is_chunk_target:
            if chunk_cancelled:
                progress_target.status = ImportChunkStatus.CANCELLED
                progress_target.phone_task_status = ImportChunkTaskStatus.CANCELLED
                progress_target.geometry_task_status = ImportChunkTaskStatus.CANCELLED
            progress_target.error_message = None
            self._mark_progress(progress_target)
            await commit_and_restore_rls(session, campaign_id)
        else:
            job.source_exhausted_at = utcnow()
            self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)

            await session.refresh(job)
            if job.cancelled_at is not None:
                job.status = ImportStatus.CANCELLED
            else:
                job.status = ImportStatus.COMPLETED
            self._mark_progress(job)
            await commit_and_restore_rls(session, campaign_id)

        logger.info(
            "Import {} {}: {} imported, {} phones, {} skipped of {} total",
            import_job_id,
            (
                "chunk-complete"
                if is_chunk_target
                else "cancelled"
                if job.cancelled_at is not None
                else "complete"
            ),
            counters["total_imported"],
            counters["total_phones_created"],
            counters["total_skipped"],
            counters["total_rows"],
        )

    async def process_import_file(
        self,
        import_job_id: str,
        session: AsyncSession,
        storage: StorageService,
        campaign_id: str,
    ) -> None:
        """Process a full import by delegating to the shared range engine."""
        job = await session.get(ImportJob, uuid.UUID(import_job_id))
        if job is None:
            raise ValueError(f"ImportJob {import_job_id} not found")

        await self.process_import_range(
            job=job,
            import_job_id=import_job_id,
            session=session,
            storage=storage,
            campaign_id=campaign_id,
            row_start=1,
            row_end=None,
            chunk=None,
        )
