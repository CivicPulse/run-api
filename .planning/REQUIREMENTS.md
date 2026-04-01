# Requirements: CivicPulse Run API

**Defined:** 2026-04-01
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.11 Requirements

Requirements for Faster Imports milestone. Each maps to roadmap phases.

### Chunk Infrastructure

- [ ] **CHUNK-01**: System splits a CSV import into ImportChunk records with row ranges and tracks per-chunk status
- [ ] **CHUNK-02**: System pre-scans CSV to count total rows for deterministic chunk boundary calculation
- [ ] **CHUNK-03**: Parent split task creates chunk records and defers one Procrastinate child task per chunk
- [ ] **CHUNK-04**: Chunk workers process their row range with per-batch commits, RLS restore, and independent sessions
- [ ] **CHUNK-05**: Files under a configurable row threshold bypass chunking and run the existing serial path
- [ ] **CHUNK-06**: Chunk size adapts based on column count (asyncpg bind-parameter limit) and file size
- [ ] **CHUNK-07**: Max concurrent chunks per import is configurable (default capped to prevent worker starvation)

### Progress & Completion

- [ ] **PROG-01**: Parent job's imported_rows, skipped_rows, and phones_created are aggregated from chunk records via SQL SUM
- [ ] **PROG-02**: Last completing chunk triggers finalization (error report merge, parent status) guarded by advisory lock
- [ ] **PROG-03**: Error reports from individual chunks are merged into a single downloadable file on finalization
- [ ] **PROG-04**: Import progress UI shows rows/second throughput and estimated time remaining
- [ ] **PROG-05**: COMPLETED_WITH_ERRORS status distinguishes partial chunk failures from full success or full failure

### Resilience

- [ ] **RESL-01**: Individual chunk failure does not block other chunks; partial results are preserved
- [ ] **RESL-02**: Cancellation propagates to all in-flight and queued chunks via parent's cancelled_at check
- [ ] **RESL-03**: Each chunk resumes from its own last_committed_row after worker crash
- [ ] **RESL-04**: Batch upserts sort rows by conflict key before INSERT to prevent cross-chunk deadlocks

### Secondary Work

- [ ] **SECW-01**: VoterPhone creation runs as a separate post-chunk task instead of inline with voter upsert
- [ ] **SECW-02**: Geometry and derived-field updates run as separate post-chunk tasks

## v2 Requirements

### Periodic Recovery (from v1.10)

- **PREC-01**: Periodic reconciliation loop running every N minutes in the worker
- **PREC-02**: Configurable reconciliation interval via settings

### Import Optimization

- **IOPT-01**: Byte-offset recording during pre-scan for S3 Range requests (skip overhead elimination)
- **IOPT-02**: K8s HPA auto-scaling workers based on queue depth

## Out of Scope

| Feature | Reason |
|---------|--------|
| Database COPY / staging table approach | Shifts validation to SQL, breaks per-row error reporting, architectural overhaul |
| Producer-consumer with intermediate queue | Adds durable intermediate state, complicates resume, overkill for current scale |
| Generic workflow/DAG engine | One use case doesn't justify a framework; manual fan-out/fan-in is sufficient |
| WebSocket/SSE for real-time progress | 3-second polling is adequate for batch operations taking minutes |
| Chunk-level UI visibility | Chunks are implementation detail; users see one import, one progress bar |
| Per-chunk retry from UI | Automatic retry + re-import (upsert is idempotent) covers this |
| Cross-chunk transaction coordination (2PC) | Massive complexity, no user benefit; partial results are acceptable |
| Import rollback | Voters may have interactions/tags; re-import with corrected file instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHUNK-01 | TBD | Pending |
| CHUNK-02 | TBD | Pending |
| CHUNK-03 | TBD | Pending |
| CHUNK-04 | TBD | Pending |
| CHUNK-05 | TBD | Pending |
| CHUNK-06 | TBD | Pending |
| CHUNK-07 | TBD | Pending |
| PROG-01 | TBD | Pending |
| PROG-02 | TBD | Pending |
| PROG-03 | TBD | Pending |
| PROG-04 | TBD | Pending |
| PROG-05 | TBD | Pending |
| RESL-01 | TBD | Pending |
| RESL-02 | TBD | Pending |
| RESL-03 | TBD | Pending |
| RESL-04 | TBD | Pending |
| SECW-01 | TBD | Pending |
| SECW-02 | TBD | Pending |

**Coverage:**
- v1.11 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18 ⚠️

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
