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
from typing import TYPE_CHECKING

from loguru import logger
from rapidfuzz import fuzz, process
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.db.rls import commit_and_restore_rls, set_campaign_context
from app.models.import_job import ImportJob, ImportStatus
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
        job: ImportJob,
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

        final_error_key = f"imports/{job.campaign_id}/{import_job_id}/errors.csv"
        await storage.upload_bytes(
            final_error_key,
            merged_buf.getvalue().encode("utf-8"),
            "text/csv",
        )
        job.error_report_key = final_error_key

        # Clean up per-batch files
        await storage.delete_objects(batch_error_keys)

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
    ) -> None:
        """Process a single batch with commit, RLS restore, and error handling.

        Updates counters dict in-place with running totals.
        """
        try:
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
            job.total_rows = counters["total_rows"]
            job.imported_rows = counters["total_imported"]
            job.skipped_rows = counters["total_skipped"]
            job.phones_created = counters["total_phones_created"]
            job.last_committed_row = counters["total_rows"]
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
            counters["total_imported"] = job.imported_rows or 0
            counters["total_skipped"] = job.skipped_rows or 0
            counters["total_phones_created"] = job.phones_created or 0

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
            job.total_rows = counters["total_rows"]
            job.skipped_rows = counters["total_skipped"]
            job.last_committed_row = counters["total_rows"]
            await commit_and_restore_rls(session, campaign_id)

    async def process_import_file(
        self,
        import_job_id: str,
        session: AsyncSession,
        storage: StorageService,
        campaign_id: str,
    ) -> None:
        """Process a full voter file import with per-batch commits.

        Streams CSV lines from S3 incrementally via stream_csv_lines(),
        parses rows one at a time in configurable batches, commits each
        batch independently with RLS restoration, writes per-batch errors
        to MinIO, merges them on completion, and supports crash-resume
        from last_committed_row.  Memory is bounded to ~2 batches + 1
        S3 chunk regardless of file size.

        Args:
            import_job_id: ImportJob UUID string.
            session: Async DB session (RLS context must be set).
            storage: StorageService for file download/upload.
            campaign_id: Campaign UUID string for RLS restore after
                each commit.
        """
        # Load the import job
        job = await session.get(ImportJob, uuid.UUID(import_job_id))
        if job is None:
            raise ValueError(f"ImportJob {import_job_id} not found")

        # Resume detection: if already PROCESSING with committed rows,
        # skip ahead
        rows_to_skip = job.last_committed_row or 0
        is_resume = rows_to_skip > 0

        # Dynamic batch size: asyncpg enforces a 32,767 bind-parameter
        # limit per query.  The bulk INSERT uses ~N columns per row, so
        # we cap the batch to stay safely under the limit.
        max_params = 32_767  # asyncpg per-query bind-parameter ceiling
        num_mapped = sum(1 for v in (job.field_mapping or {}).values() if v)
        # Voter model adds campaign_id, source_type, created_at, updated_at
        cols_per_row = max(num_mapped + 4, 1)
        effective_batch_size = min(
            settings.import_batch_size,
            max_params // cols_per_row,
        )

        if not is_resume:
            # Fresh start -- reset counters
            job.status = ImportStatus.PROCESSING
            job.imported_rows = 0
            job.skipped_rows = 0
            job.total_rows = 0
            job.last_committed_row = 0
            await commit_and_restore_rls(session, campaign_id)
        else:
            logger.info(
                "Resuming import {} from row {}",
                import_job_id,
                rows_to_skip,
            )

        # Stream CSV lines from S3 incrementally (per D-01, MEMD-01)
        # Encoding detected from first chunk; lines reconstructed across
        # chunk boundaries; memory bounded to ~2 batches + 1 chunk.
        header: list[str] | None = None
        batch: list[dict[str, str]] = []
        batch_num = 0
        total_rows = job.total_rows or 0  # Preserve on resume
        total_imported = job.imported_rows or 0  # Preserve on resume
        total_skipped = job.skipped_rows or 0  # Preserve on resume
        total_phones_created = job.phones_created or 0  # Preserve on resume
        rows_skipped = 0
        batch_error_keys: list[str] = []
        error_prefix = f"imports/{job.campaign_id}/{import_job_id}/errors/"

        counters = {
            "total_rows": total_rows,
            "total_imported": total_imported,
            "total_skipped": total_skipped,
            "total_phones_created": total_phones_created,
        }

        try:
            async for line in stream_csv_lines(storage, job.file_key):
                if header is None:
                    # First line is the CSV header -- parse field names
                    header = next(csv.reader([line]))
                    continue

                # Parse data row using known header fields
                values = next(csv.reader([line]))
                row = dict(zip(header, values, strict=False))

                # Resume skip (per D-05)
                if rows_skipped < rows_to_skip:
                    rows_skipped += 1
                    continue

                batch.append(row)
                counters["total_rows"] += 1

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
                    )
                    batch = []

                    # Cancellation check (per D-01, D-02, D-03)
                    await session.refresh(job)
                    if job.cancelled_at is not None:
                        logger.info(
                            "Import {} cancelled after batch {}",
                            import_job_id,
                            batch_num,
                        )
                        break
        except UnicodeDecodeError:
            job.status = ImportStatus.FAILED
            job.error_message = "Unable to decode file content"
            await commit_and_restore_rls(session, campaign_id)
            return

        # Process remaining rows in final batch
        if batch:
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
            )

        # Merge per-batch error files into a single errors.csv
        if batch_error_keys:
            await self._merge_error_files(storage, batch_error_keys, job, import_job_id)

        # Finalize: re-read cancelled_at to handle race with cancel
        # endpoint (Pitfall 2 from research). cancelled_at is the
        # authoritative signal for cancellation.
        await session.refresh(job)
        if job.cancelled_at is not None:
            job.status = ImportStatus.CANCELLED
        else:
            job.status = ImportStatus.COMPLETED
        await commit_and_restore_rls(session, campaign_id)

        logger.info(
            "Import {} {}: {} imported, {} phones, {} skipped of {} total",
            import_job_id,
            "cancelled" if job.cancelled_at is not None else "complete",
            counters["total_imported"],
            counters["total_phones_created"],
            counters["total_skipped"],
            counters["total_rows"],
        )
