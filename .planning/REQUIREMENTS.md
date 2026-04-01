# Requirements: CivicPulse Run API

**Defined:** 2026-04-01
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.10 Requirements

Requirements for Import Recovery milestone. Each maps to roadmap phases.

### Orphan Detection

- [ ] **ORPH-01**: Import jobs record `last_progress_at` and update it after each committed batch
- [ ] **ORPH-02**: Recovery logic can identify imports stuck in `PROCESSING` whose progress timestamp is older than a configurable staleness threshold
- [ ] **ORPH-03**: Staleness threshold is configurable in application settings with a safe default
- [ ] **ORPH-04**: Structured logs are emitted when orphaned imports are detected

### Recovery

- [ ] **RECV-01**: Worker startup recovery scan detects orphaned imports and queues a fresh recovery task
- [ ] **RECV-02**: Recovered imports resume from `last_committed_row` without duplicating voters
- [ ] **RECV-03**: Recovery never reclaims imports already marked `COMPLETED`, `FAILED`, or `CANCELLED`
- [ ] **RECV-04**: Advisory locking prevents two workers from reclaiming or finalizing the same import concurrently

### Completion Hardening

- [ ] **HARD-01**: Finalization failures produce a distinct error path instead of leaving the import forever in `PROCESSING`
- [ ] **HARD-02**: Recovery can finalize an import that fully consumed the source file but lost its final status transition

### Test Coverage

- [ ] **TEST-01**: Unit tests verify stale `PROCESSING` imports are detected and queued for recovery
- [ ] **TEST-02**: Unit tests verify completed, cancelled, and failed imports are never reclaimed
- [ ] **TEST-03**: Unit tests verify fresh-progress imports are not reclaimed
- [ ] **TEST-04**: Integration coverage simulates crash-resume from partial commit through successful completion
- [ ] **TEST-05**: Regression assertions verify final row counts are correct and no duplicate voters are created after resume

## Future Requirements

### Periodic Recovery

- **PREC-01**: Periodic reconciliation loop running every N minutes in the worker
- **PREC-02**: Configurable reconciliation interval via settings

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct mutation of stale Procrastinate queue rows as the primary recovery path | Fresh task requeue is simpler and less coupled to Procrastinate internals |
| Full import rollback on failure | Imports are idempotent and may already have downstream references; resume/retry is safer |
| Worker-to-worker leader election system | PostgreSQL advisory locks are sufficient for recovery coordination |
| Generic background-job recovery framework | This milestone is focused on import recovery only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORPH-01 | Phase 56 | Pending |
| ORPH-02 | Phase 56 | Pending |
| ORPH-03 | Phase 56 | Pending |
| ORPH-04 | Phase 56 | Pending |
| RECV-01 | Phase 57 | Pending |
| RECV-02 | Phase 57 | Pending |
| RECV-03 | Phase 57 | Pending |
| RECV-04 | Phase 57 | Pending |
| HARD-01 | Phase 57 | Pending |
| HARD-02 | Phase 57 | Pending |
| TEST-01 | Phase 58 | Pending |
| TEST-02 | Phase 58 | Pending |
| TEST-03 | Phase 58 | Pending |
| TEST-04 | Phase 58 | Pending |
| TEST-05 | Phase 58 | Pending |

**Coverage:**
- v1.10 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 during planning-state cleanup*
