# Requirements: CivicPulse Run API

**Defined:** 2026-03-31
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.10 Requirements

Requirements for Import Recovery milestone. Each maps to roadmap phases.

### Orphan Detection

- [ ] **ORPH-01**: Worker detects imports stuck in PROCESSING with stale last_progress_at on startup
- [ ] **ORPH-02**: last_progress_at timestamp column added to import_jobs, updated after each committed batch
- [ ] **ORPH-03**: Staleness threshold is configurable via settings (default 5 minutes)

### Recovery

- [ ] **RECV-01**: Worker startup scan re-queues orphaned imports as fresh Procrastinate tasks
- [ ] **RECV-02**: Re-queued imports resume from last_committed_row (no duplicate voters)
- [ ] **RECV-03**: pg_try_advisory_lock prevents concurrent execution of the same import
- [ ] **RECV-04**: Imports in COMPLETED, FAILED, or CANCELLED status are never reclaimed

### Completion Hardening

- [ ] **HARD-01**: Finalization failure produces a distinct error state (not silently stuck in PROCESSING)
- [ ] **HARD-02**: Recovery auto-completes imports where last_committed_row equals total_rows and file EOF was reached

### Observability

- [ ] **OBSV-01**: Structured logs for orphan detection, reclaim actions, and resumed import progress

### Testing

- [ ] **TEST-01**: Unit tests for staleness detection and requeue decision logic
- [ ] **TEST-02**: Unit tests verifying no reclaim for completed/cancelled/failed jobs
- [ ] **TEST-03**: Unit tests verifying no reclaim when progress is fresh
- [ ] **TEST-04**: Integration test simulating crash-resume: start → partial commit → kill → recover → complete
- [ ] **TEST-05**: Regression assertion: no duplicate voters after resume, row count matches file

## v2 Requirements

### Periodic Recovery

- **PREC-01**: Periodic reconciliation loop running every N minutes in the worker
- **PREC-02**: Configurable reconciliation interval via settings

## Out of Scope

| Feature | Reason |
|---------|--------|
| Procrastinate internal table queries | Coupling to queue internals; application-level state is sufficient |
| worker_instance_id / processing_started_at fields | last_progress_at alone provides staleness signal |
| Real-time import progress WebSocket | SSE/polling sufficient per existing decision |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORPH-01 | — | Pending |
| ORPH-02 | — | Pending |
| ORPH-03 | — | Pending |
| RECV-01 | — | Pending |
| RECV-02 | — | Pending |
| RECV-03 | — | Pending |
| RECV-04 | — | Pending |
| HARD-01 | — | Pending |
| HARD-02 | — | Pending |
| OBSV-01 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |

**Coverage:**
- v1.10 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after initial definition*
