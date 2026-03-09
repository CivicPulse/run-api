# Phase 2: Voter Data Import and CRM - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Campaign staff can import voter files from multiple sources (generic CSV, L2-format) into a unified, campaign-scoped voter database. The system provides a canonical voter model with configurable field mappings, search/filtering with composable queries, tagging, static and dynamic voter lists (target universes), an append-only interaction history, and multi-channel contact management. Canvassing operations, phone banking, volunteer management, and dashboards are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Import Pipeline
- Pre-signed URL upload flow: API returns a pre-signed S3-compatible URL, client uploads directly to object storage, then notifies API to start processing
- Object storage: Cloudflare R2 in production, MinIO container in docker-compose for local dev (both S3-compatible, use boto3/aioboto3)
- Async processing via TaskIQ background jobs — upload triggers a job, API returns an import job ID immediately
- Client polls a status endpoint for progress/completion (no SSE in v1)
- Bad row handling: skip invalid rows, continue importing valid ones. Import result includes count of skipped rows and a downloadable error report with row numbers and reasons
- Duplicate handling: upsert on source file ID as match key (e.g., L2's LALVOTERID). Each data source has its own ID field; matching is within the same source type. Different sources can create duplicate voter records (cross-source dedup is v2 — VOTER-11)

### Field Mapping
- Two-step flow: Step 1 — upload file, API returns detected columns + auto-suggested mappings. Step 2 — user reviews/adjusts mappings, confirms to start import
- Auto-suggestion via fuzzy string similarity matching (CSV column headers → canonical field names, e.g., 'First_Name' → 'first_name', 'DOB' → 'date_of_birth')
- Saved mapping templates: after confirming a mapping, user can save it as a named template (e.g., 'L2 Virginia 2026'). Next import can select an existing template. L2 preset is a system-provided template
- Canonical voter model has real columns for core fields (name, address, party, voting history, demographics, lat/long, household ID)
- Extra/unmapped fields stored in a JSONB `extra_data` column on the voter record — preserves vendor-specific data (likelihood scores, ethnicity estimates, etc.)

### Search and Targeting
- Structured filter objects via POST endpoint with JSON filter body: composable filters with AND/OR logic (e.g., `{"party": "DEM", "voted_in": ["2022"], "not_voted_in": ["2024"], "precinct": "5"}`)
- Unified voter list model with type field (static/dynamic) in a single `voter_lists` table
- Static lists have a many-to-many join table of voter IDs
- Dynamic lists store the filter JSON and evaluate at query time
- Target universes (VOTER-06) = named dynamic lists — no separate universe concept. Canvassing and phone banking reference lists by ID
- Free-form tags per campaign: users create tags on the fly (e.g., 'yard-sign', 'strong-supporter'). Many-to-many voter↔tag join table. Tags are campaign-scoped and filterable in the structured filter system

### Interaction History
- Append-only event table with type enum: Phase 2 defines 'note', 'tag_added', 'tag_removed', 'import', 'contact_updated'. Phase 3 adds 'door_knock', 'survey_response'. Phase 4 adds 'phone_call'. Enum extensible via Alembic migrations
- JSONB `payload` column per event — schema varies by type (voter_id, type, payload, created_by, created_at)
- True immutability: events are never modified or deleted. Corrections recorded as new events with 'correction' type referencing the original event ID
- Full audit trail preserved

### Contact Management
- Separate contact tables: `voter_phones`, `voter_emails`, `voter_addresses`
- Each with: voter_id, value, type (home/work/cell), is_primary flag, source (import/manual)
- Supports multiple contacts per voter with clear primary/secondary designation

### Claude's Discretion
- Exact fuzzy matching algorithm/library for field mapping auto-suggestion
- Import job status endpoint polling interval recommendations
- Database indexing strategy for voter search performance
- JSONB extra_data indexing approach (GIN index or not)
- Batch size for import processing
- Exact filter JSON schema structure and validation
- Pre-signed URL expiry duration

</decisions>

<specifics>
## Specific Ideas

- Production storage is Cloudflare R2 (S3-compatible but different from AWS S3) — ensure boto3 configuration supports R2 endpoint URLs
- L2 voter files have 50+ fields including voting history, likelihood scores, ethnicity estimates, lat/long, and household data — the JSONB extras column is essential for preserving this richness
- Source file ID matching (e.g., LALVOTERID for L2) keeps dedup simple within a data source while deferring cross-source dedup to v2

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BaseSchema` (app/schemas/common.py): Base Pydantic model with `from_attributes=True` — use for all voter schemas
- `PaginatedResponse[T]` (app/schemas/common.py): Generic paginated response — use for voter list endpoints
- `set_campaign_context()` (app/db/rls.py): RLS campaign context setter — all voter tables need RLS policies
- `InviteService` pattern (app/services/invite.py): Service class pattern for business logic — follow for VoterService, ImportService
- `CampaignRole` enum (app/core/security.py): Role hierarchy — use for permission checks on import (admin+) vs. query (volunteer+)

### Established Patterns
- SQLAlchemy async with `mapped_column` type annotations — follow for voter models
- RFC 9457 Problem Details for errors — follow for import validation errors
- Cursor-based pagination — follow for voter search results
- `from __future__ import annotations` in all modules
- Google-style docstrings on public functions

### Integration Points
- New models register in `app/models/__init__.py`
- New routes mount via `app/api/v1/router.py`
- RLS policies added via Alembic migrations (same pattern as campaigns/campaign_members)
- TaskIQ background jobs need broker configuration (new infrastructure for Phase 2)
- MinIO container added to docker-compose.yml (new infrastructure for Phase 2)
- boto3/aioboto3 dependency needed for S3-compatible storage

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-voter-data-import-and-crm*
*Context gathered: 2026-03-09*
