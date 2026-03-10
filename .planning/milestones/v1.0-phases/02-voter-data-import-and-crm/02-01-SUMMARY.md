---
phase: 02-voter-data-import-and-crm
plan: 01
subsystem: database
tags: [sqlalchemy, postgresql, rls, minio, s3, taskiq, aioboto3, rapidfuzz, pydantic]

requires:
  - phase: 01-auth-and-multi-tenancy
    provides: Campaign, User, CampaignMember models; RLS infrastructure; app_user role
provides:
  - Voter model with all canonical fields plus JSONB extra_data
  - VoterTag and VoterTagMember join table for free-form tagging
  - VoterPhone, VoterEmail, VoterAddress contact models
  - VoterList (static/dynamic) and VoterListMember models
  - VoterInteraction append-only event model
  - ImportJob and FieldMappingTemplate models
  - Alembic migration 002 with RLS policies on all voter tables
  - L2 system mapping template seeded in migration
  - StorageService with pre-signed URL generation (S3-compatible)
  - TaskIQ InMemoryBroker for background job dispatch
  - MinIO container in docker-compose
  - Pydantic schemas for all voter-domain request/response contracts
  - VoterFilter composable filter schema for search and dynamic lists
affects: [02-02-import-pipeline, 02-03-search-filter, 02-04-interaction-contacts]

tech-stack:
  added: [taskiq, taskiq-fastapi, aioboto3, rapidfuzz]
  patterns: [pre-signed-url-upload, append-only-event-log, composite-rls-join-policy]

key-files:
  created:
    - app/models/voter.py
    - app/models/voter_contact.py
    - app/models/voter_list.py
    - app/models/voter_interaction.py
    - app/models/import_job.py
    - app/schemas/voter.py
    - app/schemas/voter_filter.py
    - app/schemas/voter_list.py
    - app/schemas/voter_contact.py
    - app/schemas/import_job.py
    - app/services/storage.py
    - app/tasks/broker.py
    - alembic/versions/002_voter_data_models.py
  modified:
    - app/models/__init__.py
    - app/db/base.py
    - app/core/config.py
    - app/main.py
    - docker-compose.yml
    - pyproject.toml

key-decisions:
  - "Used quay.io/minio/minio instead of Docker Hub minio/minio (Hub deprecation risk from research)"
  - "RLS on join tables (voter_tag_members, voter_list_members) uses subquery through parent table"
  - "field_mapping_templates RLS allows NULL campaign_id for system templates visible to all"
  - "native_enum=False on all StrEnum columns for extensibility via migrations"

patterns-established:
  - "Join-table RLS: voter_tag_members and voter_list_members isolated via subquery to parent with campaign_id"
  - "System-wide templates: field_mapping_templates with campaign_id=NULL bypass RLS for shared resources"
  - "StorageService pattern: aioboto3 session with SigV4 config for R2 compatibility"

requirements-completed: [VOTER-04]

duration: 4min
completed: 2026-03-09
---

# Phase 2 Plan 01: Voter Data Models and Infrastructure Summary

**11 SQLAlchemy models with RLS, Pydantic schemas, MinIO storage service, and TaskIQ broker for voter CRM backbone**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T17:44:48Z
- **Completed:** 2026-03-09T17:49:22Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Complete voter data model layer: Voter with all canonical fields, tags, contacts, lists, interactions, import jobs
- Alembic migration with RLS policies on all 11 voter tables including join-table subquery policies
- StorageService with pre-signed URL generation for S3-compatible storage (MinIO/R2)
- TaskIQ InMemoryBroker configured and initialized in app lifespan

## Task Commits

Each task was committed atomically:

1. **Task 1: SQLAlchemy models, Pydantic schemas, and Alembic migration** - `51f5a22` (feat)
2. **Task 2: Infrastructure - MinIO, TaskIQ broker, StorageService, config** - `c266145` (feat)

## Files Created/Modified
- `app/models/voter.py` - Voter, VoterTag, VoterTagMember models
- `app/models/voter_contact.py` - VoterPhone, VoterEmail, VoterAddress models
- `app/models/voter_list.py` - VoterList, VoterListMember models
- `app/models/voter_interaction.py` - VoterInteraction append-only event model
- `app/models/import_job.py` - ImportJob, FieldMappingTemplate models
- `app/models/__init__.py` - Updated with all new model exports
- `app/db/base.py` - Added imports for Alembic detection
- `app/schemas/voter.py` - VoterResponse, VoterCreateRequest, VoterUpdateRequest
- `app/schemas/voter_filter.py` - VoterFilter composable filter schema
- `app/schemas/voter_list.py` - VoterListCreate, VoterListUpdate, VoterListResponse
- `app/schemas/voter_contact.py` - Phone/Email/Address create and response schemas
- `app/schemas/import_job.py` - ImportJobResponse, ImportUploadResponse, FieldMappingTemplateResponse
- `alembic/versions/002_voter_data_models.py` - Migration with 11 tables, RLS, L2 seed
- `app/services/storage.py` - S3-compatible StorageService with pre-signed URLs
- `app/tasks/broker.py` - TaskIQ InMemoryBroker
- `app/tasks/__init__.py` - Package init
- `app/core/config.py` - Added S3 settings
- `app/main.py` - Updated lifespan with storage and broker init
- `docker-compose.yml` - Added MinIO service
- `pyproject.toml` - Added taskiq, taskiq-fastapi, aioboto3, rapidfuzz

## Decisions Made
- Used `quay.io/minio/minio` image instead of Docker Hub `minio/minio` due to deprecation risk noted in research
- RLS on join tables (voter_tag_members, voter_list_members) uses subquery-based isolation through parent table's campaign_id
- field_mapping_templates RLS policy allows NULL campaign_id rows (system templates) to be visible to all campaigns
- All StrEnum columns use `native_enum=False` for extensibility via future Alembic migrations without enum type changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. MinIO runs locally via docker-compose.

## Next Phase Readiness
- All voter models and schemas ready for import pipeline (Plan 02)
- StorageService ready for pre-signed URL upload flow
- TaskIQ broker ready for background job dispatch
- VoterFilter schema ready for search/filter endpoints (Plan 03)

---
*Phase: 02-voter-data-import-and-crm*
*Completed: 2026-03-09*

## Self-Check: PASSED

All 13 created files verified on disk. Both task commits (51f5a22, c266145) verified in git log.
