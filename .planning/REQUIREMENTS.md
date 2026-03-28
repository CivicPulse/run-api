# Requirements: CivicPulse Run API

**Defined:** 2026-03-28
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.6 Requirements

Requirements for milestone v1.6 Imports. Each maps to roadmap phases.

### Background Processing

- [ ] **BGND-01**: Import endpoint returns 202 Accepted immediately and processes the file in a background Procrastinate job
- [ ] **BGND-02**: Procrastinate replaces TaskIQ as the task queue, using existing PostgreSQL as job store
- [ ] **BGND-03**: User can cancel a running import, stopping processing after the current batch completes
- [ ] **BGND-04**: System prevents concurrent imports for the same campaign via Procrastinate queueing lock

### Import Resilience

- [ ] **RESL-01**: Each batch of rows is committed independently so partial progress persists through crashes
- [ ] **RESL-02**: RLS campaign context is re-set after each batch commit to maintain data isolation
- [ ] **RESL-03**: On crash or restart, import resumes from the last committed batch instead of starting over
- [ ] **RESL-04**: Polling endpoint returns real-time committed row counts updated after each batch
- [ ] **RESL-05**: Error rows are written to MinIO per-batch so memory usage stays constant regardless of error count

### Memory & Deployment

- [ ] **MEMD-01**: CSV file is streamed from MinIO and parsed incrementally instead of loaded entirely into memory
- [ ] **MEMD-02**: Worker runs as a separate container (Docker Compose service + K8s Deployment) using the same image with a different entrypoint

### L2 Auto-Mapping

- [ ] **L2MP-01**: All 55 columns from L2 voter files auto-map to canonical fields without manual intervention
- [ ] **L2MP-02**: Voting history columns in "Voted in YYYY", "General_YYYY", and "Voted in YYYY Primary" formats are parsed correctly
- [ ] **L2MP-03**: Import wizard auto-detects L2 format from headers and skips the manual mapping step

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Import Enhancements

- **IMPT-01**: Import supports additional vendor formats beyond L2 (e.g., TargetSmart, Aristotle)
- **IMPT-02**: Import supports Excel (.xlsx) files in addition to CSV
- **IMPT-03**: Import deduplication across multiple file uploads within same campaign

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time WebSocket progress | SSE or polling is sufficient; WebSocket adds complexity without proportional value |
| Multi-file merge imports | Single-file-at-a-time with upsert handles incremental updates adequately |
| Distributed worker cluster | Single worker per deployment is sufficient for current scale |
| Custom field creation | L2 columns map to canonical fields or extra_data JSON; user-defined fields are a separate feature |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BGND-01 | Phase 49 | Pending |
| BGND-02 | Phase 49 | Pending |
| BGND-03 | Phase 53 | Pending |
| BGND-04 | Phase 53 | Pending |
| RESL-01 | Phase 50 | Pending |
| RESL-02 | Phase 50 | Pending |
| RESL-03 | Phase 50 | Pending |
| RESL-04 | Phase 50 | Pending |
| RESL-05 | Phase 50 | Pending |
| MEMD-01 | Phase 51 | Pending |
| MEMD-02 | Phase 49 | Pending |
| L2MP-01 | Phase 52 | Pending |
| L2MP-02 | Phase 52 | Pending |
| L2MP-03 | Phase 52 | Pending |

**Coverage:**
- v1.6 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
