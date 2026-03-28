# Feature Landscape: v1.6 Large-File Voter Import & L2 Auto-Mapping

**Domain:** Background import processing, resumable batch imports, progress reporting, L2 voter file format handling
**Researched:** 2026-03-28
**Overall confidence:** HIGH (domain is well-understood, codebase patterns clear, L2 format knowledge from existing alias dictionary and real import pipelines)

---

## Table Stakes

Features campaigns expect from a voter import system handling files of 50K-500K+ rows. Missing any of these makes large imports unusable or unreliable.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| Background import processing (non-blocking) | A 200K-row file takes 2-10 minutes to process. Blocking the HTTP request means timeouts, browser hangs, and lost imports. Users expect to start an import and continue working. | Medium | Replace TaskIQ InMemoryBroker with Procrastinate PostgreSQL job queue | Current system dispatches via `broker.task` with `InMemoryBroker` -- jobs evaporate on restart. Procrastinate stores jobs in PostgreSQL alongside application data, using the same database. POST `/confirm` should return 202 Accepted, not block. |
| Per-batch commits (partial progress survives crashes) | If the API pod crashes at row 150K of 300K, users expect the first 150K to be persisted, not lost. Current `process_import_file` does a single `session.commit()` at the end via `process_import` task. | Medium | Modify `process_import_file` to commit after each batch; add `last_committed_batch` tracking to ImportJob model | The current code does `session.flush()` per batch but only `session.commit()` at the end in `import_task.py:51`. A pod crash loses ALL progress. Each 1000-row batch must be its own committed transaction. |
| Resume from last committed batch after crash | If a pod crashes mid-import, users expect to click "retry" and have it pick up where it left off rather than re-importing (and duplicating) rows 1-150K. | Medium | `last_committed_batch` column on ImportJob, byte-offset or row-offset tracking, `csv.DictReader` skip logic | The ON CONFLICT upsert makes re-processing idempotent for rows with `source_id`, but re-processing 150K rows is wasteful. Track the byte offset or batch number of last committed batch. Resume from there. |
| Real-time progress reporting (rows processed, errors, rate) | Users staring at an import screen need to see it moving. Row count, percentage, error count, and estimated time remaining are expected for any import over 10 seconds. | Low | Already exists: `ImportProgress.tsx` polls `useImportJob` every 3s, shows imported/skipped/total counts and percentage bar | Existing progress UI is well-built. The infrastructure is in place. Only need to ensure the polling endpoint returns fresh data after each batch commit (not just after full completion). Currently, `job.imported_rows` updates per-flush but is only visible after commit. With per-batch commits, progress becomes real. |
| Error report download | When rows fail validation, users need to know which rows failed and why so they can fix the source file and re-import. | Low | Already exists: error CSV uploaded to MinIO, pre-signed download URL returned in `ImportJobResponse.error_report_key` | Fully implemented. No changes needed. |
| L2 column auto-mapping with zero manual intervention | L2 is the dominant voter data vendor for US campaigns. Campaigns buy L2 files and expect upload-then-go. If 10 of 55 columns fail to auto-map, users have to manually fix them -- unacceptable for a non-technical campaign staffer. | Medium | Expand `CANONICAL_FIELDS` alias dictionary with ALL known L2 "friendly name" headers; lower fuzzy threshold for L2-specific patterns | Current dictionary has ~30 L2 aliases across 42 canonical fields but misses many L2-specific column name patterns. L2 uses several naming conventions: `Voters_FirstName`, `Residence_Addresses_City`, `CommercialData_MaritalStatus`, `EthnicGroups_EthnicGroup1Desc`, `General_YYYY`, `Parties_Description`. Some of these already map; many do not. |
| Voting history format flexibility | L2 exports use multiple column naming conventions for voting history across different states and export versions. Current regex only handles `General_YYYY` and `Primary_YYYY`. | Low | Extend `_VOTING_HISTORY_RE` regex and `parse_voting_history()` to handle additional formats | Known L2 formats: `General_YYYY`, `Primary_YYYY` (handled), plus `Voted_in_YYYY_General`, `Voted in YYYY`, `GeneralElection_YYYY`, `Gen_YYYY`, `Prim_YYYY`. Need to normalize all to `General_YYYY`/`Primary_YYYY` canonical form. |

## Differentiators

Features that set the import experience apart from basic CSV upload tools. Not universally expected but significantly improve campaign staff trust and efficiency.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| Zero-touch L2 import (skip mapping step entirely) | When 100% of columns auto-map, skip the column mapping step in the wizard. Upload, see confirmation summary, click import. Reduces a 4-step process to 3 steps for the most common file format. | Low | High-confidence auto-mapping for all L2 columns, frontend wizard conditional step skip | Detect L2 format by presence of signature columns (`LALVOTERID`, `Voters_FirstName`, `Residence_Addresses_*`). When all detected columns map at 100% alias-match (not fuzzy), auto-confirm and skip step 2. |
| Format auto-detection with confidence display | Show "45 of 47 columns auto-mapped (96%)" on the mapping screen. Users see at a glance whether manual review is needed. Builds trust in the auto-mapping. | Low | Compute mapped/total ratio from `suggest_field_mapping()` output (count non-None values / total columns) | Pure frontend calculation from existing data. No backend changes needed. |
| Per-batch error isolation (partial success is OK) | If batch 5 fails on a database constraint, batches 1-4 and 6+ still succeed. Users get a partial import with a clear error report rather than a total failure. | Medium | Each batch processed in its own subtransaction (SAVEPOINT) with rollback on failure; error details captured per-batch | Current code propagates batch exceptions to fail the entire import. With per-batch error isolation, a corrupted row in batch 5 does not destroy the entire 300K-row import. |
| Import cancellation | User realizes they uploaded the wrong file after processing starts. Click "Cancel" to stop processing remaining batches. Already-committed batches remain (intentional -- upsert-safe). | Low | Add `CANCELLED` to `ImportStatus` enum, check status before each batch in processing loop, expose `POST /imports/{id}/cancel` endpoint | Simple: worker checks `job.status` at the top of each batch loop iteration. If status has been set to `CANCELLED` by the cancel endpoint, break the loop and finalize. |
| Stale import cleanup (auto-expire PENDING/QUEUED jobs) | If a user initiates an import but never uploads the file, the PENDING job sits forever. Auto-expire after 24h. Clean up orphaned S3 objects. | Low | Procrastinate periodic task or database-level cleanup; check `created_at < now() - interval '24 hours'` for PENDING/QUEUED jobs | Prevents accumulation of zombie import jobs. Low priority but good hygiene. |
| Import file size estimation and pre-validation | Before uploading, count lines in the file (browser-side) and display estimated rows and processing time. Warn if file exceeds reasonable limits (>1M rows). | Low | Browser-side `FileReader` line counting on the uploaded file, display in DropZone component | Under-promise on time estimates (say "10-20 minutes" not "12 minutes"). Campaigns appreciate knowing what they are waiting for. |
| Duplicate import detection | Warn if a file with the same name and similar row count was imported in the last 7 days. Prevents accidental double-imports of the same voter file. | Low | Query `ImportJob` for same campaign + matching `original_filename` + `status=completed` + recent `created_at` | Not a hard block -- just a warning dialog: "A file named 'GA_Voters_2026.csv' was imported 2 days ago (48,392 rows). Import anyway?" |

## Anti-Features

Features to explicitly NOT build for v1.6. Including rationale so these do not creep in.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time WebSocket/SSE import progress | Push-based progress adds WebSocket infrastructure, connection management, reconnection logic, and a second communication channel. The import progress screen is the only consumer. | Continue using TanStack Query `refetchInterval` polling at 3s. With per-batch commits, each poll returns fresh data. Polling at 3s for a 5-20 minute import is perfectly adequate. |
| Parallel batch processing (multi-worker) | Splitting a CSV across multiple workers adds coordination complexity, ordering concerns, and row-level locking contention on the voters table upsert. | Single-worker sequential batch processing. A 200K-row file processes in ~2-5 minutes with 1000-row batches. Fast enough. The bottleneck is PostgreSQL INSERT, not Python. |
| Streaming upload (chunked/multipart direct-to-processor) | Processing rows as they upload sounds efficient but creates complex partial-state management. What if the upload fails at 80%? What batch boundaries apply to a stream? | Upload complete file to MinIO first (existing pattern), then process from S3. Decoupling upload from processing is simpler and more reliable. Already implemented. |
| AI/LLM-based column mapping | Adds external dependency, latency, cost, and unpredictability to a deterministic problem. L2 column names are not creative prose -- they are fixed vendor formats solvable with a dictionary. | Expand `CANONICAL_FIELDS` alias dictionary comprehensively. RapidFuzz at 75% threshold handles minor variations. Exact-match aliases handle the rest. |
| Import rollback (undo a completed import) | Campaigns want to undo a bad import. But voters may have been tagged, contacted, added to walk lists, or had interactions recorded against them since import. Cascading rollback is destructive. | Provide clear import history with error reports. If a bad import happened, campaigns can re-import the corrected file (upsert handles dedup) or delete voters via the UI. |
| Shapefile/GDB direct import | Some voter files come as ESRI shapefiles or file geodatabases. Requires GDAL/OGR dependency, multi-file handling, and spatial data interpretation. | CSV only. Campaigns can use QGIS or ogr2ogr to convert to CSV first. L2 always provides CSV exports. |
| ZIP file upload with multi-file processing | Some vendors deliver voter files as ZIP archives with multiple CSVs (one per county or split by alphabet). | Single CSV per import. Users can import multiple files sequentially. The import history page already supports this workflow. |
| Custom row-level transformation rules | Let users define per-column transformation rules (regex replacements, format conversions) during import. | Build transformations into the import service (like `normalize_party`, `parse_propensity`, `normalize_phone`). Deterministic transforms baked into code are testable and reliable. |
| Import scheduling (schedule import for off-hours) | Let users schedule an import to run at 2 AM to avoid peak hours. | Procrastinate can defer jobs, but the complexity of scheduling UI, timezone handling, and user expectations around scheduled jobs is not worth it. Imports are fast enough to run immediately. |

## Feature Dependencies

```
Procrastinate integration --> Background processing (202 Accepted)
                         --> Per-batch commits (each batch = own transaction)
                         --> Resume from last committed batch (crash recovery)
                         --> Import cancellation (check status between batches)
                         --> Stale job cleanup (periodic task)

Per-batch commits --> Real-time progress visible via polling (already built)
                 --> Per-batch error isolation (SAVEPOINT per batch)
                 --> Resume offset tracking (last_committed_batch column)

L2 alias expansion --> Zero-touch L2 auto-detection
                   --> Format auto-detection confidence display
                   --> Voting history format flexibility

Resume tracking (ImportJob model changes) --> Crash recovery logic in worker
                                          --> UI "retry" button for failed/crashed imports
```

## MVP Recommendation

Prioritize in this order:

1. **Procrastinate integration** -- Replace InMemoryBroker with PostgreSQL job queue. This is the foundation: without a durable job queue, background processing is unreliable. Jobs survive pod restarts. Currently if the pod dies, all queued imports are lost forever.

2. **Per-batch commits with resume tracking** -- Add `last_committed_batch` (int) and `processed_bytes` (bigint, optional) to ImportJob. Commit after each 1000-row batch. On resume, skip to `last_committed_batch + 1`. This makes large imports crash-safe.

3. **L2 "friendly name" alias completion** -- Audit ALL L2 column name patterns and add them to `CANONICAL_FIELDS`. This is the "zero-manual-mapping" goal. The existing fuzzy matching infrastructure is correct; the alias dictionary is just incomplete.

4. **Voting history format expansion** -- Extend `parse_voting_history()` regex to handle `Voted_in_YYYY_General`, `Gen_YYYY`, and similar L2 variations across states.

**Defer:** Import cancellation, stale job cleanup, duplicate detection, file size estimation. All are easy Low-complexity features that can be added after the core reliability features ship.

## L2 Voter File Column Patterns (Research Notes)

L2 (L2 Political, formerly L2 Inc.) is the dominant voter data vendor in the US. Their CSV exports use several naming conventions depending on export version, state, and data package:

### Column Naming Conventions (MEDIUM confidence -- based on existing alias dictionary entries and training data)

**Pattern 1: Prefix_CamelCase** (most common in modern L2 exports)
- `Voters_FirstName`, `Voters_LastName`, `Voters_MiddleName`, `Voters_NameSuffix`
- `Voters_Gender`, `Voters_BirthDate`, `Voters_Age`
- `Voters_CellPhone`, `Voters_CellPhoneFull`
- `Voters_HHID`, `Voters_HHSize`, `Voters_HHPartyRegistration`, `Voters_FamilyID`
- `Voters_Language`, `Voters_PartyChangeIndicator`
- `Voters_Zip4`

**Pattern 2: Category_Subcategory** (for address, demographic, commercial data)
- `Residence_Addresses_AddressLine`, `Residence_Addresses_City`, `Residence_Addresses_State`
- `Residence_Addresses_Zip`, `Residence_Addresses_Zip4`, `Residence_Addresses_County`
- `Residence_Addresses_Latitude`, `Residence_Addresses_Longitude`
- `Residence_Addresses_AptType`
- `EthnicGroups_EthnicGroup1Desc`
- `CommercialData_MaritalStatus`, `CommercialData_MilitaryActive`
- `Parties_Description`

**Pattern 3: Mailing address columns**
- `Mail_VAddressLine1`, `Mail_VAddressLine2`, `Mail_VCity`, `Mail_VState`
- `Mail_VZip`, `Mail_VZipcode`, `Mail_VZip4`, `Mail_VCountry`

**Pattern 4: Score/propensity columns**
- `General_Turnout_Score`, `Primary_Turnout_Score`, `Combined_Turnout_Score`
- `CellPhoneConfidence`

**Pattern 5: Voting history columns**
- `General_YYYY` / `Primary_YYYY` -- values are Y/N/A/E (current, handled)
- `Voted_in_YYYY_General` / `Voted_in_YYYY_Primary` (alternate format, NOT handled)
- `Voted in YYYY` / `Voted in YYYY Primary` (space-separated, NOT handled)

**Pattern 6: Voter ID**
- `LALVOTERID` -- L2's unique voter identifier (the "LAL" prefix is a legacy name)
- `Voters_StateVoterID` -- state-assigned voter ID

### Columns Currently Handled vs. Gaps

**Already in CANONICAL_FIELDS alias dictionary (30+ aliases):**
- Core name fields: `Voters_FirstName`, `Voters_LastName`, etc.
- Registration address: `Residence_Addresses_*` pattern
- Demographics: `EthnicGroups_EthnicGroup1Desc`, `Voters_Gender`, `Voters_BirthDate`
- Household: `Voters_HHID`, `Voters_HHSize`, `Voters_HHPartyRegistration`, `Voters_FamilyID`
- Phone: `Voters_CellPhoneFull`, `Voters_CellPhone`
- Mailing: `Mail_VAddressLine1` through `Mail_VCountry`
- Scores: `General_Turnout_Score`, `Primary_Turnout_Score`, `Combined_Turnout_Score`
- Commercial: `CommercialData_MaritalStatus`, `CommercialData_MilitaryActive`
- Party: `Parties_Description`

**Gaps -- NOT in current alias dictionary but present in L2 exports:**
- `Voters_StateVoterID` (for `source_id`)
- `Residence_Addresses_ExtraAddressLine` (for `registration_line2`)
- `Residence_Addresses_HouseNumber`, `Residence_Addresses_PrefixDirection`, `Residence_Addresses_StreetName`, `Residence_Addresses_Designator`, `Residence_Addresses_SuffixDirection` (component address fields -- need concatenation strategy for `registration_line1`)
- `Voters_RegistrationDate` (for `registration_date`)
- `Precinct`, `USCongressionalDistrict`, `StateSenateDistrict`, `StateHouseDistrict` (district columns with varying naming)
- Voting history in "Voted in" format
- `Voters_MailingAddress*` variants (alternative mailing prefix)
- `Voters_OfficialRegParty` (alternative party column)

### Voting History Format Matrix

| Format | Example Column | Current Status | Action |
|--------|---------------|----------------|--------|
| `General_YYYY` | `General_2024` | Handled | None |
| `Primary_YYYY` | `Primary_2022` | Handled | None |
| `Gen_YYYY` | `Gen_2024` | NOT handled | Add to regex |
| `Prim_YYYY` | `Prim_2022` | NOT handled | Add to regex |
| `GeneralElection_YYYY` | `GeneralElection_2024` | NOT handled | Add to regex |
| `PrimaryElection_YYYY` | `PrimaryElection_2022` | NOT handled | Add to regex |
| `Voted_in_YYYY_General` | `Voted_in_2024_General` | NOT handled | Add alternative regex pattern |
| `Voted in YYYY` | `Voted in 2024` | NOT handled | Requires space-aware column matching; normalize to `General_YYYY` |
| `Voted in YYYY Primary` | `Voted in 2024 Primary` | NOT handled | Requires space-aware column matching |
| `Municipal_YYYY` | `Municipal_2023` | NOT handled | Decide: capture or ignore (recommend: capture as `Municipal_YYYY`) |
| `Special_YYYY` | `Special_2023` | NOT handled | Decide: capture or ignore (recommend: capture as `Special_YYYY`) |
| `Runoff_YYYY` | `Runoff_2024` | NOT handled | Decide: capture or ignore (recommend: capture as `Runoff_YYYY`) |

**Recommendation:** Expand the regex to capture General, Primary, Gen, Prim, GeneralElection, PrimaryElection as election types and normalize them all to the canonical `General_YYYY` or `Primary_YYYY` format. Also add support for `Municipal_YYYY`, `Special_YYYY`, and `Runoff_YYYY` as-is (pass through without normalization since the voting_history array is a string array). For the "Voted in" space-separated format, add a second regex pattern.

## L2 Component Address Fields (Special Case)

L2 sometimes exports addresses as individual components rather than a single line:

| L2 Column | Component |
|-----------|-----------|
| `Residence_Addresses_HouseNumber` | House/building number |
| `Residence_Addresses_PrefixDirection` | N, S, E, W |
| `Residence_Addresses_StreetName` | Street name |
| `Residence_Addresses_Designator` | St, Ave, Blvd, Dr |
| `Residence_Addresses_SuffixDirection` | N, S, E, W (suffix) |
| `Residence_Addresses_AptNum` | Apartment number |

**Recommendation:** Do NOT map these individually. Instead, detect when these component columns are present (and `Residence_Addresses_AddressLine` is absent) and concatenate them into `registration_line1` during field mapping. Add a concatenation strategy to `apply_field_mapping()` for this special case. This is the only L2-specific transformation that requires logic beyond simple alias mapping.

## Procrastinate Integration Notes (MEDIUM confidence -- based on training data, not verified against current docs)

Procrastinate is a PostgreSQL-based job queue for Python, designed for async/await applications. Key properties relevant to this milestone:

- **PostgreSQL-native:** Jobs stored in PostgreSQL tables alongside application data. No additional infrastructure (Redis, RabbitMQ) required. Uses LISTEN/NOTIFY for instant job pickup.
- **Async-first:** Native asyncio/asyncpg support. Integrates cleanly with FastAPI's async request handlers.
- **Durable:** Jobs survive pod restarts since they are in PostgreSQL. Unlike InMemoryBroker, queued imports are not lost on crash.
- **Retry policies:** Built-in retry with configurable attempts and backoff. Failed imports can auto-retry.
- **Periodic tasks:** Supports cron-like periodic tasks for stale job cleanup.
- **Worker process:** Runs as a separate process (`procrastinate worker`) or can be embedded in the FastAPI process for development.
- **Database schema:** Creates its own tables (`procrastinate_jobs`, `procrastinate_events`, etc.) via migrations.

**Migration path from TaskIQ InMemoryBroker:**
1. Add `procrastinate` to dependencies (replace `taskiq`, `taskiq-fastapi`)
2. Create Procrastinate app with asyncpg connector
3. Run Procrastinate schema migrations (creates its own tables)
4. Register `process_import` as a Procrastinate task
5. Dispatch via `await process_import.defer_async(import_job_id=str(import_id))` instead of `await process_import.kiq(str(import_id))`
6. Run worker via `procrastinate worker` command (or embed in dev)

## Import Job Model Changes Required

Based on feature analysis, the `ImportJob` model needs these additions:

| Column | Type | Purpose |
|--------|------|---------|
| `last_committed_batch` | `Integer, default=0` | Track resume point for crash recovery |
| `processed_bytes` | `BigInteger, nullable=True` | Optional: track file byte offset for resume (alternative to batch counting) |
| `total_batches` | `Integer, nullable=True` | Pre-computed batch count for progress percentage |
| `started_at` | `DateTime, nullable=True` | When processing actually began (vs. created_at which is upload time) |
| `completed_at` | `DateTime, nullable=True` | When processing finished (for duration reporting) |

The `ImportStatus` enum should also gain `CANCELLED` for the cancellation feature (if built).

## Sources

- Codebase analysis: `app/services/import_service.py`, `app/tasks/broker.py`, `app/tasks/import_task.py`, `app/models/import_job.py`, `app/api/v1/imports.py`
- Frontend analysis: `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx`, `web/src/components/voters/ImportProgress.tsx`, `web/src/hooks/useImports.ts`
- Test analysis: `tests/unit/test_import_service.py`, `tests/unit/test_import_parsing.py`
- L2 column patterns: Derived from existing `CANONICAL_FIELDS` alias dictionary entries (HIGH confidence for documented patterns) and training data knowledge of L2 voter file formats (MEDIUM confidence for undocumented patterns)
- Procrastinate capabilities: Training data (MEDIUM confidence -- recommend verifying against current docs before implementation)
