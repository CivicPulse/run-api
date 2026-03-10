# Phase 2: Voter Data Import and CRM - Research

**Researched:** 2026-03-09
**Domain:** CSV import pipeline, voter CRM data model, async background jobs, S3-compatible object storage
**Confidence:** HIGH

## Summary

Phase 2 introduces the voter data backbone of the platform: a CSV import pipeline with pre-signed URL uploads to S3-compatible storage (Cloudflare R2 / MinIO), async processing via TaskIQ background jobs, a canonical voter model with JSONB extras, composable search/filter endpoints, tagging, static/dynamic voter lists, append-only interaction history, and multi-channel contact management. All voter tables require RLS isolation on `campaign_id` following the established Phase 1 pattern.

The import pipeline is the most complex piece: pre-signed URL upload, column detection with fuzzy auto-mapping via RapidFuzz, user-confirmed field mappings with saveable templates, then batch upsert processing in a TaskIQ background job. The voter search system uses structured JSON filter objects with composable AND/OR logic, translated to SQLAlchemy queries server-side. Dynamic lists store filter JSON and evaluate at query time; static lists use a join table.

**Primary recommendation:** Build the data model and RLS first, then the import pipeline (storage + TaskIQ + CSV processing), then search/filter/lists, then interaction history and contact management. Use RapidFuzz for column auto-mapping, aioboto3 for S3 operations, and TaskIQ with InMemoryBroker for local dev (Redis broker is production concern for later).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pre-signed URL upload flow: API returns a pre-signed S3-compatible URL, client uploads directly to object storage, then notifies API to start processing
- Object storage: Cloudflare R2 in production, MinIO container in docker-compose for local dev (both S3-compatible, use boto3/aioboto3)
- Async processing via TaskIQ background jobs -- upload triggers a job, API returns an import job ID immediately
- Client polls a status endpoint for progress/completion (no SSE in v1)
- Bad row handling: skip invalid rows, continue importing valid ones. Import result includes count of skipped rows and a downloadable error report with row numbers and reasons
- Duplicate handling: upsert on source file ID as match key (e.g., L2's LALVOTERID). Each data source has its own ID field; matching is within the same source type. Different sources can create duplicate voter records (cross-source dedup is v2)
- Two-step field mapping flow: Step 1 -- upload file, API returns detected columns + auto-suggested mappings. Step 2 -- user reviews/adjusts mappings, confirms to start import
- Auto-suggestion via fuzzy string similarity matching (CSV column headers to canonical field names)
- Saved mapping templates: after confirming a mapping, user can save it as a named template. L2 preset is a system-provided template
- Canonical voter model has real columns for core fields (name, address, party, voting history, demographics, lat/long, household ID)
- Extra/unmapped fields stored in a JSONB `extra_data` column on the voter record
- Structured filter objects via POST endpoint with JSON filter body: composable filters with AND/OR logic
- Unified voter list model with type field (static/dynamic) in a single `voter_lists` table
- Static lists have a many-to-many join table of voter IDs
- Dynamic lists store the filter JSON and evaluate at query time
- Target universes = named dynamic lists -- no separate universe concept
- Free-form tags per campaign: many-to-many voter-tag join table, campaign-scoped, filterable
- Append-only event table with type enum: Phase 2 defines 'note', 'tag_added', 'tag_removed', 'import', 'contact_updated'. Extensible via Alembic migrations
- JSONB `payload` column per event -- schema varies by type
- True immutability: events never modified or deleted. Corrections recorded as new events
- Separate contact tables: `voter_phones`, `voter_emails`, `voter_addresses` with type, is_primary flag, source

### Claude's Discretion
- Exact fuzzy matching algorithm/library for field mapping auto-suggestion
- Import job status endpoint polling interval recommendations
- Database indexing strategy for voter search performance
- JSONB extra_data indexing approach (GIN index or not)
- Batch size for import processing
- Exact filter JSON schema structure and validation
- Pre-signed URL expiry duration

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOTER-01 | Campaign admin can import voter data from generic CSV files | Import pipeline: pre-signed URL upload, CSV parsing, field mapping, batch upsert via TaskIQ |
| VOTER-02 | Campaign admin can import voter data from L2-format files with pre-configured field mapping | System-provided L2 mapping template, same pipeline as VOTER-01 with pre-loaded template |
| VOTER-03 | System suggests field mappings automatically based on column name similarity | RapidFuzz fuzzy matching of CSV headers against canonical field names |
| VOTER-04 | Voter records conform to canonical model | Voter SQLAlchemy model with typed columns + JSONB extra_data for unmapped fields |
| VOTER-05 | Campaign user can search and filter voters by demographic, geographic, voting history, and tag criteria | POST filter endpoint with composable JSON filter body, SQLAlchemy query builder |
| VOTER-06 | Campaign user can build target universes | Dynamic voter lists storing filter JSON, evaluated at query time |
| VOTER-07 | Campaign user can tag voters and manage static voter lists | Voter tags (many-to-many), static voter lists with join table |
| VOTER-08 | Campaign user can create dynamic voter lists from saved filter queries | Dynamic list type in unified voter_lists table, stores filter JSON |
| VOTER-09 | System records interaction history per voter as append-only event log | voter_interactions table with type enum + JSONB payload, immutable rows |
| VOTER-10 | Campaign user can view and manage contact information with primary/secondary designation | Separate voter_phones, voter_emails, voter_addresses tables with is_primary flag |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| taskiq | 0.12.1 | Async background job queue | Purpose-built for async Python, FastAPI-native dependency injection via taskiq-fastapi |
| taskiq-fastapi | 0.4.0 | TaskIQ-FastAPI integration | Reuses FastAPI dependencies in task functions |
| aioboto3 | 15.5.0 | Async S3-compatible storage client | Async wrapper around boto3, needed for pre-signed URLs and R2/MinIO operations |
| rapidfuzz | 3.14.3 | Fuzzy string matching | C++ backed, MIT license, 10x faster than thefuzz, ideal for column name auto-mapping |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python csv (stdlib) | 3.13 | CSV parsing | Streaming row-by-row parsing of uploaded voter files |
| pydantic | 2.12+ | Filter schema validation | Validate structured filter JSON from POST body |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RapidFuzz | thefuzz | thefuzz is GPL licensed, 10x slower, uses same API surface |
| TaskIQ | Celery | Celery is sync-first, heavier setup, no native async/FastAPI DI |
| TaskIQ | arq | arq requires Redis always; TaskIQ supports InMemoryBroker for dev |
| aioboto3 | boto3 (sync) | Would block the event loop; aioboto3 is async-native |

### Installation
```bash
uv add taskiq taskiq-fastapi aioboto3 rapidfuzz
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── models/
│   ├── voter.py              # Voter, VoterTag models
│   ├── voter_contact.py      # VoterPhone, VoterEmail, VoterAddress
│   ├── voter_list.py         # VoterList, VoterListMember
│   ├── voter_interaction.py  # VoterInteraction (append-only)
│   ├── import_job.py         # ImportJob, FieldMappingTemplate
│   └── __init__.py           # Updated to register new models
├── schemas/
│   ├── voter.py              # Voter request/response schemas
│   ├── voter_filter.py       # Filter JSON schema + validation
│   ├── voter_list.py         # List CRUD schemas
│   ├── import_job.py         # Import job schemas
│   └── voter_contact.py      # Contact CRUD schemas
├── services/
│   ├── voter.py              # VoterService (CRUD, search, filter)
│   ├── import_service.py     # ImportService (CSV processing, upsert)
│   ├── storage.py            # StorageService (pre-signed URLs, file download)
│   └── voter_list.py         # VoterListService
├── api/v1/
│   ├── voters.py             # Voter CRUD + search endpoints
│   ├── voter_lists.py        # List management endpoints
│   ├── voter_tags.py         # Tag management endpoints
│   ├── imports.py            # Import upload + status endpoints
│   └── voter_contacts.py     # Contact management endpoints
├── tasks/
│   ├── broker.py             # TaskIQ broker configuration
│   └── import_task.py        # Background import processing task
└── core/
    └── config.py             # Extended with S3/MinIO settings
```

### Pattern 1: Pre-signed URL Upload Flow
**What:** Client gets a pre-signed PUT URL, uploads directly to object storage, then notifies API to start processing.
**When to use:** All file uploads (voter CSV files).
**Example:**
```python
# app/services/storage.py
import aioboto3
from app.core.config import settings

class StorageService:
    """S3-compatible object storage operations."""

    def __init__(self) -> None:
        self.session = aioboto3.Session()

    async def generate_upload_url(
        self, key: str, content_type: str = "text/csv"
    ) -> str:
        """Generate a pre-signed PUT URL for direct client upload."""
        async with self.session.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
        ) as s3:
            url = await s3.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": settings.s3_bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=3600,  # 1 hour expiry
            )
            return url
```

### Pattern 2: TaskIQ Background Job with FastAPI Integration
**What:** Define async tasks that run in background workers, dispatched from API endpoints.
**When to use:** CSV import processing (long-running, should not block request).
**Example:**
```python
# app/tasks/broker.py
from taskiq import InMemoryBroker

# InMemoryBroker for local dev; swap to Redis/RabbitMQ broker for prod
broker = InMemoryBroker()

# app/tasks/import_task.py
from app.tasks.broker import broker

@broker.task
async def process_import(import_job_id: str) -> dict:
    """Process a voter file import in the background."""
    # Download file from S3, parse CSV, batch upsert voters
    ...
    return {"imported": count, "skipped": skipped, "errors": errors}

# In FastAPI endpoint:
async def start_import(...):
    task = await process_import.kiq(str(import_job.id))
    return {"job_id": import_job.id, "status": "processing"}
```

### Pattern 3: Composable Filter Query Builder
**What:** Translate structured JSON filter objects into SQLAlchemy WHERE clauses.
**When to use:** Voter search, dynamic list evaluation.
**Example:**
```python
# app/services/voter.py
from sqlalchemy import and_, or_, select
from app.models.voter import Voter

def build_voter_query(filters: dict) -> select:
    """Build SQLAlchemy query from structured filter dict."""
    query = select(Voter)
    conditions = []

    if "party" in filters:
        conditions.append(Voter.party == filters["party"])
    if "precinct" in filters:
        conditions.append(Voter.precinct == filters["precinct"])
    if "voted_in" in filters:
        # voting_history is an array column or JSONB
        for election in filters["voted_in"]:
            conditions.append(Voter.voting_history.contains([election]))
    if "tags" in filters:
        # Subquery join to voter_tags
        ...

    if filters.get("logic") == "OR":
        query = query.where(or_(*conditions))
    else:
        query = query.where(and_(*conditions))

    return query
```

### Pattern 4: Append-Only Interaction History
**What:** Immutable event log per voter with typed events and JSONB payloads.
**When to use:** Any voter state change (tag added, contact updated, note, import).
**Example:**
```python
# app/models/voter_interaction.py
class InteractionType(enum.StrEnum):
    NOTE = "note"
    TAG_ADDED = "tag_added"
    TAG_REMOVED = "tag_removed"
    IMPORT = "import"
    CONTACT_UPDATED = "contact_updated"

class VoterInteraction(Base):
    __tablename__ = "voter_interactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"))
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id"))
    type: Mapped[InteractionType] = mapped_column(
        Enum(InteractionType, name="interaction_type", native_enum=False)
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Pattern 5: Upsert on Source ID
**What:** Use PostgreSQL `ON CONFLICT ... DO UPDATE` for dedup within a data source.
**When to use:** Voter import processing -- each source type has a unique external ID.
**Example:**
```python
from sqlalchemy.dialects.postgresql import insert

stmt = insert(Voter).values(rows)
stmt = stmt.on_conflict_do_update(
    index_elements=["campaign_id", "source_type", "source_id"],
    set_={
        "first_name": stmt.excluded.first_name,
        "last_name": stmt.excluded.last_name,
        # ... update all mapped fields
        "extra_data": stmt.excluded.extra_data,
        "updated_at": func.now(),
    },
)
await session.execute(stmt)
```

### Anti-Patterns to Avoid
- **Loading entire CSV into memory:** Use streaming csv.DictReader with batch processing (1000-2000 rows per batch). L2 files can be 500K+ rows.
- **Synchronous S3 calls:** Always use aioboto3, never sync boto3 in async context.
- **Mutable interaction history:** Never UPDATE or DELETE from voter_interactions. Corrections are new events referencing originals.
- **Application-level tenant filtering:** Use PostgreSQL RLS via `set_campaign_context()` -- do not add WHERE campaign_id clauses manually.
- **Blocking import in request handler:** Always dispatch to TaskIQ background job; return job ID immediately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Levenshtein from scratch | RapidFuzz `fuzz.ratio` / `process.extractOne` | C++ performance, handles edge cases (unicode, casing), well-tested |
| S3 pre-signed URLs | Custom HMAC signing | aioboto3 `generate_presigned_url` | Signature v4 is complex, R2/MinIO compatibility handled by SDK |
| Background job queue | asyncio.create_task + DB polling | TaskIQ with broker | Retries, timeouts, result tracking, worker process management |
| CSV parsing | Manual line splitting | stdlib `csv.DictReader` | Handles quoting, escaping, encoding edge cases correctly |
| Upsert logic | SELECT then INSERT/UPDATE | PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` | Atomic, race-condition free, single round-trip |

**Key insight:** The import pipeline has many edge cases (encoding detection, malformed CSV, partial failures, large file memory pressure) that are best handled by proven libraries rather than custom code.

## Common Pitfalls

### Pitfall 1: GIN Index Write Overhead During Bulk Import
**What goes wrong:** GIN indexes on JSONB `extra_data` or array columns slow down bulk inserts dramatically.
**Why it happens:** GIN index maintenance is expensive per-row during INSERT/UPDATE.
**How to avoid:** For the initial implementation, add GIN indexes only on columns that are actively queried (voting_history, extra_data). Consider deferring GIN index creation until after bulk import completes for very large files. The batch upsert approach (1000 rows at a time) mitigates this somewhat.
**Warning signs:** Import jobs taking 10x longer than expected for large files.

### Pitfall 2: Pre-signed URL Signature Mismatch with R2
**What goes wrong:** Pre-signed URLs generated for R2 fail with `SignatureDoesNotMatch`.
**Why it happens:** Cloudflare R2 requires SigV4 signatures and the `region_name` must be set to `"auto"`. Content-Type must match between pre-signed URL generation and actual upload.
**How to avoid:** Always set `region_name="auto"` for R2. Lock Content-Type to `"text/csv"` in the pre-signed URL params. Use `botocore.config.Config(signature_version="s3v4")` explicitly.
**Warning signs:** 403 errors on client-side upload despite valid credentials.

### Pitfall 3: RLS Context Not Set in Background Jobs
**What goes wrong:** TaskIQ background tasks query the database without setting RLS campaign context, returning no rows or leaking data.
**Why it happens:** Background jobs run outside the FastAPI request lifecycle where `set_campaign_context()` is normally called.
**How to avoid:** Store `campaign_id` in the import job record. In the background task, create a new DB session and call `set_campaign_context()` before any queries.
**Warning signs:** Import jobs completing with 0 rows imported despite valid data.

### Pitfall 4: CSV Encoding Issues
**What goes wrong:** Voter files from various sources use different encodings (UTF-8, Latin-1, Windows-1252). csv.DictReader fails or produces garbled data.
**Why it happens:** Government/vendor voter files are not always UTF-8.
**How to avoid:** Read the first few KB of the file and attempt encoding detection. Default to UTF-8 with fallback to Latin-1. Log encoding used per import.
**Warning signs:** Names with accents or special characters appearing as garbage.

### Pitfall 5: Dynamic List Performance on Large Voter Tables
**What goes wrong:** Dynamic lists re-evaluate filter queries on every access, becoming slow with 100K+ voters.
**Why it happens:** No query caching or materialization.
**How to avoid:** Add appropriate B-tree indexes on frequently filtered columns (party, precinct, city, state, zip). Cursor-based pagination limits result set size. For v1, this is acceptable; materialized views are a v2 optimization.
**Warning signs:** Dynamic list endpoint response times exceeding 2 seconds.

### Pitfall 6: Import Job Status Race Conditions
**What goes wrong:** Client polls status endpoint and sees stale data because the background task hasn't started yet or DB write hasn't committed.
**Why it happens:** TaskIQ dispatches the job asynchronously; there's a window between dispatch and first DB update.
**How to avoid:** Set initial status to "queued" in the API endpoint (before dispatch). Background task updates to "processing" on start, then "completed"/"failed" on finish. All status transitions happen via the import_jobs table.
**Warning signs:** Client sees "queued" status indefinitely.

## Code Examples

### Canonical Voter Model
```python
# app/models/voter.py
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Voter(Base):
    """Canonical voter record."""

    __tablename__ = "voters"
    __table_args__ = (
        Index("ix_voters_campaign_source", "campaign_id", "source_type", "source_id", unique=True),
        Index("ix_voters_campaign_party", "campaign_id", "party"),
        Index("ix_voters_campaign_precinct", "campaign_id", "precinct"),
        Index("ix_voters_campaign_zip", "campaign_id", "zip_code"),
        Index("ix_voters_campaign_last_name", "campaign_id", "last_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"), nullable=False)

    # Source tracking
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "l2", "csv", etc.
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # LALVOTERID for L2

    # Core fields
    first_name: Mapped[str | None] = mapped_column(String(255))
    middle_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    suffix: Mapped[str | None] = mapped_column(String(50))
    date_of_birth: Mapped[date | None] = mapped_column()
    gender: Mapped[str | None] = mapped_column(String(20))

    # Address
    address_line1: Mapped[str | None] = mapped_column(String(500))
    address_line2: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str | None] = mapped_column(String(2))
    zip_code: Mapped[str | None] = mapped_column(String(10))
    county: Mapped[str | None] = mapped_column(String(255))

    # Political
    party: Mapped[str | None] = mapped_column(String(50))
    precinct: Mapped[str | None] = mapped_column(String(100))
    congressional_district: Mapped[str | None] = mapped_column(String(10))
    state_senate_district: Mapped[str | None] = mapped_column(String(10))
    state_house_district: Mapped[str | None] = mapped_column(String(10))
    registration_date: Mapped[date | None] = mapped_column()

    # Voting history (array of election identifiers)
    voting_history: Mapped[list | None] = mapped_column(ARRAY(String), default=list)

    # Demographics
    ethnicity: Mapped[str | None] = mapped_column(String(100))
    age: Mapped[int | None] = mapped_column()

    # Geographic
    latitude: Mapped[float | None] = mapped_column()
    longitude: Mapped[float | None] = mapped_column()
    household_id: Mapped[str | None] = mapped_column(String(255))

    # Extras
    extra_data: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

### Import Job Model
```python
# app/models/import_job.py
class ImportStatus(enum.StrEnum):
    PENDING = "pending"       # Pre-signed URL generated, awaiting upload
    UPLOADED = "uploaded"     # File uploaded, awaiting mapping confirmation
    QUEUED = "queued"         # Mapping confirmed, job dispatched to TaskIQ
    PROCESSING = "processing" # Background task actively importing
    COMPLETED = "completed"   # Import finished successfully
    FAILED = "failed"         # Import failed with error

class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"))
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, name="import_status", native_enum=False),
        default=ImportStatus.PENDING,
    )
    file_key: Mapped[str] = mapped_column(String(500))  # S3 object key
    original_filename: Mapped[str] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(50), default="csv")
    field_mapping: Mapped[dict | None] = mapped_column(JSONB)  # confirmed mapping
    detected_columns: Mapped[list | None] = mapped_column(JSONB)  # from step 1
    suggested_mapping: Mapped[dict | None] = mapped_column(JSONB)  # auto-suggestions

    # Results
    total_rows: Mapped[int | None] = mapped_column()
    imported_rows: Mapped[int | None] = mapped_column()
    skipped_rows: Mapped[int | None] = mapped_column()
    error_report_key: Mapped[str | None] = mapped_column(String(500))  # S3 key for error CSV
    error_message: Mapped[str | None] = mapped_column()

    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

### RapidFuzz Column Auto-Mapping
```python
# app/services/import_service.py
from rapidfuzz import fuzz, process

CANONICAL_FIELDS = {
    "first_name": ["first_name", "firstname", "first", "fname", "name_first"],
    "last_name": ["last_name", "lastname", "last", "lname", "name_last", "surname"],
    "date_of_birth": ["date_of_birth", "dob", "birth_date", "birthdate"],
    "party": ["party", "party_affiliation", "political_party", "parties_description"],
    "address_line1": ["address", "address1", "address_line1", "street", "residential_address1"],
    "city": ["city", "residential_city", "mail_city"],
    "state": ["state", "residential_state"],
    "zip_code": ["zip", "zip_code", "zipcode", "postal_code", "residential_zip"],
    # ... more mappings
}

def suggest_field_mapping(csv_columns: list[str]) -> dict[str, str | None]:
    """Suggest canonical field mappings for CSV column headers."""
    all_aliases = []
    alias_to_field = {}
    for field, aliases in CANONICAL_FIELDS.items():
        for alias in aliases:
            all_aliases.append(alias)
            alias_to_field[alias] = field

    mapping = {}
    for col in csv_columns:
        normalized = col.strip().lower().replace(" ", "_")
        match = process.extractOne(
            normalized,
            all_aliases,
            scorer=fuzz.ratio,
            score_cutoff=75,  # 75% minimum similarity
        )
        if match:
            mapping[col] = alias_to_field[match[0]]
        else:
            mapping[col] = None  # unmapped -> goes to extra_data

    return mapping
```

### RLS Policy for Voter Tables (Alembic)
```python
# In Alembic migration -- follow established pattern from 001_initial_schema.py
op.execute("ALTER TABLE voters ENABLE ROW LEVEL SECURITY")
op.execute(
    "CREATE POLICY voter_isolation ON voters "
    "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
)
# Repeat for: voter_tags, voter_tag_members, voter_lists, voter_list_members,
#             voter_interactions, voter_phones, voter_emails, voter_addresses,
#             import_jobs, field_mapping_templates
```

### Filter Schema Validation
```python
# app/schemas/voter_filter.py
from __future__ import annotations
from pydantic import BaseModel, Field

class VoterFilter(BaseModel):
    """Structured voter filter for search and dynamic lists."""

    party: str | None = None
    parties: list[str] | None = None
    precinct: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None
    congressional_district: str | None = None
    age_min: int | None = None
    age_max: int | None = None
    gender: str | None = None
    voted_in: list[str] | None = None       # elections voter participated in
    not_voted_in: list[str] | None = None    # elections voter did NOT participate in
    tags: list[str] | None = None            # must have ALL these tags
    tags_any: list[str] | None = None        # must have ANY of these tags
    registered_after: str | None = None
    registered_before: str | None = None
    search: str | None = None                # free text search on name
    logic: str = Field(default="AND", pattern="^(AND|OR)$")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Celery for Python async tasks | TaskIQ (native async) | 2023+ | No sync/async bridging needed, FastAPI DI reuse |
| fuzzywuzzy for string matching | RapidFuzz (C++ backend) | 2020+ | 10x faster, MIT license vs GPL |
| Sync boto3 in async apps | aioboto3 | 2019+ | Non-blocking S3 operations |
| Application-level WHERE clauses | PostgreSQL RLS | Project decision | Enforced at DB level, not bypassable |

**Deprecated/outdated:**
- fuzzywuzzy: Superseded by RapidFuzz with compatible API. GPL license problematic for commercial use.
- python-Levenshtein: No longer needed; RapidFuzz includes optimized implementations.

## Open Questions

1. **TaskIQ broker for production**
   - What we know: InMemoryBroker works for dev/testing. Redis broker (taskiq-redis) is the standard production choice.
   - What's unclear: Whether to add Redis to docker-compose now or defer until deployment planning.
   - Recommendation: Use InMemoryBroker for dev. Design broker as a swappable config setting. Add Redis broker as a production concern when deployment phase arrives.

2. **Voting history data structure**
   - What we know: L2 provides voting history as many individual columns (e.g., `General_2022`, `Primary_2024` with values like "Y"/"N").
   - What's unclear: Best internal representation -- ARRAY of election strings vs JSONB dict of election-to-participation.
   - Recommendation: Use `ARRAY(String)` for simple election ID list (e.g., `["2022_general", "2024_primary"]`). This supports PostgreSQL array containment operators (`@>`, `&&`) which are GIN-indexable, making "voted in X but not Y" queries efficient.

3. **Large file memory management**
   - What we know: L2 voter files can have 500K+ rows with 50+ columns.
   - What's unclear: Optimal batch size for upsert operations.
   - Recommendation: Start with 1000 rows per batch. The background task streams from S3 (not full download), parses row-by-row with csv.DictReader, and flushes every 1000 rows. This keeps memory under ~50MB regardless of file size.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0+ with pytest-asyncio |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOTER-01 | CSV file import via pre-signed URL flow | unit + integration | `uv run pytest tests/unit/test_import_service.py -x` | No -- Wave 0 |
| VOTER-02 | L2-format import with pre-configured mapping | unit | `uv run pytest tests/unit/test_import_service.py::test_l2_template -x` | No -- Wave 0 |
| VOTER-03 | Auto-suggest field mappings via fuzzy matching | unit | `uv run pytest tests/unit/test_field_mapping.py -x` | No -- Wave 0 |
| VOTER-04 | Canonical voter model with all required fields | unit | `uv run pytest tests/unit/test_voter_model.py -x` | No -- Wave 0 |
| VOTER-05 | Search and filter voters by multiple criteria | unit | `uv run pytest tests/unit/test_voter_search.py -x` | No -- Wave 0 |
| VOTER-06 | Build target universes (dynamic lists) | unit | `uv run pytest tests/unit/test_voter_lists.py::test_dynamic_list -x` | No -- Wave 0 |
| VOTER-07 | Tag voters and manage static lists | unit | `uv run pytest tests/unit/test_voter_tags.py -x` | No -- Wave 0 |
| VOTER-08 | Create dynamic voter lists from saved filters | unit | `uv run pytest tests/unit/test_voter_lists.py::test_dynamic_list_filter -x` | No -- Wave 0 |
| VOTER-09 | Append-only interaction history | unit | `uv run pytest tests/unit/test_voter_interactions.py -x` | No -- Wave 0 |
| VOTER-10 | View/manage contact info with primary designation | unit | `uv run pytest tests/unit/test_voter_contacts.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_import_service.py` -- covers VOTER-01, VOTER-02
- [ ] `tests/unit/test_field_mapping.py` -- covers VOTER-03
- [ ] `tests/unit/test_voter_search.py` -- covers VOTER-05
- [ ] `tests/unit/test_voter_lists.py` -- covers VOTER-06, VOTER-07, VOTER-08
- [ ] `tests/unit/test_voter_interactions.py` -- covers VOTER-09
- [ ] `tests/unit/test_voter_contacts.py` -- covers VOTER-10
- [ ] `tests/unit/test_api_imports.py` -- covers import API endpoints
- [ ] `tests/unit/test_api_voters.py` -- covers voter API endpoints
- [ ] `tests/integration/test_voter_rls.py` -- covers RLS isolation for voter tables

## Sources

### Primary (HIGH confidence)
- [Cloudflare R2 boto3 docs](https://developers.cloudflare.com/r2/examples/aws/boto3/) -- R2 endpoint configuration, pre-signed URL generation
- [Cloudflare R2 presigned URLs docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) -- SigV4 requirements, content-type locking
- [TaskIQ getting started](https://taskiq-python.github.io/guide/getting-started.html) -- Broker setup, task definition, InMemoryBroker
- [TaskIQ FastAPI integration](https://taskiq-python.github.io/framework_integrations/taskiq-with-fastapi.html) -- DI reuse, startup/shutdown, testing
- [RapidFuzz GitHub](https://github.com/rapidfuzz/RapidFuzz) -- API surface, scorer options, process.extractOne
- [PostgreSQL GIN indexes](https://www.postgresql.org/docs/current/gin.html) -- JSONB indexing, jsonb_path_ops, write overhead
- Project codebase (app/models/, app/services/, app/db/rls.py) -- Established patterns for models, services, RLS

### Secondary (MEDIUM confidence)
- [aioboto3 PyPI](https://pypi.org/project/aioboto3/) -- Version 15.5.0, Python 3.9+ support
- [taskiq PyPI](https://pypi.org/project/taskiq/) -- Version 0.12.1, Python 3.10+ support
- [Crunchy Data GIN blog](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres) -- GIN vs jsonb_path_ops tradeoffs

### Tertiary (LOW confidence)
- MinIO Docker Hub deprecation (Oct 2025) -- may need Chainguard image instead of `minio/minio`; verify at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified on PyPI, compatible with Python 3.13, well-documented
- Architecture: HIGH -- patterns follow established project conventions (Phase 1 models, services, RLS)
- Pitfalls: HIGH -- R2 pre-signed URL issues well-documented, GIN index overhead is PostgreSQL fundamentals, RLS context in background jobs is project-specific but follows from existing patterns
- Import pipeline: MEDIUM -- TaskIQ FastAPI integration is relatively new (v0.4.0) but actively maintained; InMemoryBroker is straightforward for dev

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days -- stable ecosystem, no fast-moving dependencies)
