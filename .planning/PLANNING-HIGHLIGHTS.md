# Planning Highlights

_Last updated: 2026-04-01_

## Snapshot

CivicPulse Run API has shipped milestones `v1.0` through `v1.10` and is currently positioned at `v1.11 Faster Imports`, with Phase 59 ready for planning. The planning folder shows a steady progression from platform foundation and full product delivery into import performance, resilience, and operational hardening.

## Product Arc

The planning history shows a fast build-out from core platform to a fairly complete campaign operations product:

- `v1.0 MVP` established authentication, multi-tenancy, voter CRM, canvassing, phone banking, volunteer management, dashboards, and integration fixes.
- `v1.1 Local Dev & Deployment Readiness` added containerization, local development flows, CI/CD, Kubernetes manifests, and GitOps deployment support.
- `v1.2 Full UI` delivered the main frontend surfaces for voter management, import workflows, phone banking, volunteers, shifts, and campaign administration.
- `v1.3 Voter Model & Import Enhancement` expanded the voter schema, improved import behavior, and introduced more advanced filtering and search.
- `v1.4 Volunteer Field Mode` added mobile-first field flows, offline queueing and sync, guided onboarding, accessibility work, and field-specific UX polish.
- `v1.5 Go Live / Production Readiness` hardened the system for production with multi-org foundations, observability, map-based turf editing, WCAG work, E2E coverage, and documentation cleanup.
- `v1.6 Imports` significantly upgraded the import subsystem with worker-backed processing, per-batch commits, memory-safe CSV streaming, L2 auto-mapping, cancellation handling, and cleanup.
- `v1.10 Import Recovery` made imports crash-safe and recoverable after worker failures or interrupted finalization.

## What Has Been Delivered

- `v1.0` to `v1.5` established the core product: auth and multi-tenancy, voter CRM, import flows, canvassing, phone banking, volunteer management, dashboards, deployment, and production-readiness work.
- `v1.6 Imports` reworked the import subsystem around worker infrastructure, per-batch commits, memory-safe streaming, L2 auto-mapping, cancellation, and cleanup.
- `v1.10 Import Recovery` finished the crash-safety track by adding durable stale-import detection, worker-startup recovery, advisory-lock coordination, and automated recovery coverage.

## Current Planning Position

- Active milestone: `v1.11 Faster Imports`
- State: `ready_to_plan`
- Next phase: `59 - Chunk Schema & Configuration`
- Current intent: parallelize large CSV imports while preserving the existing serial path for small files

At the point this summary was written, `v1.10` had just been archived and `v1.11` had not yet started implementation. The planning state explicitly records that there were no active blockers.

## Latest Shipped Milestone: v1.10 Import Recovery

The most recent completed work focused on making imports self-heal after worker crashes, restarts, or interrupted finalization.

Key outcomes:
- `last_progress_at` became the durable application-owned signal for stale import detection.
- Recovery uses fresh task requeue instead of mutating existing Procrastinate rows.
- `pg_try_advisory_lock` now protects processing, recovery, and finalization concurrency.
- Exhausted imports can finalize correctly during recovery instead of staying stuck in `PROCESSING`.
- Tests now cover stale detection, recovery startup behavior, crash-resume, and duplicate prevention.

### v1.10 Requirements That Were Completed

- Import jobs record durable progress timestamps and recovery metadata.
- Orphan detection is driven by a configurable staleness threshold.
- Worker startup scans detect stale imports and enqueue recovery work.
- Recovery resumes from `last_committed_row` without duplicating already committed rows.
- Terminal imports are never reclaimed.
- Finalization failures now follow an explicit error path instead of leaving work stuck forever.
- Automated tests cover stale detection, startup recovery behavior, crash-resume, and duplicate prevention.

### v1.10 Implementation Shape

- Phase 56 added schema and metadata for orphan detection, including `last_progress_at`, `source_exhausted_at`, `orphaned_at`, and `orphaned_reason`.
- Phase 57 turned detection into runtime recovery behavior through startup scans, fresh recovery task enqueueing, advisory locking, and direct finalization of exhausted imports.
- Phase 58 added the unit and integration-marked coverage needed to prove recovery behavior and no-duplicate resume semantics.

## Next Major Direction: v1.11 Faster Imports

Planning artifacts consistently point to one architectural direction for the next milestone:

- Add an `ImportChunk` model to represent per-chunk progress and state.
- Use a parent/child fan-out pattern: one split task creates chunk records and defers chunk workers.
- Keep progress unified at the parent import level via SQL `SUM` aggregation across chunks.
- Finalize exactly once with advisory-lock protection.
- Preserve crash-resume and cancellation behavior at chunk granularity.
- Offload secondary work from the critical voter-upsert path where it materially improves throughput.
- Keep a small-file fast path so trivial imports stay simple.

The research summary treats this approach as high-confidence and explicitly avoids new dependencies. The stack already in the repo is considered sufficient: Procrastinate, SQLAlchemy async, PostgreSQL advisory locks, and MinIO-backed CSV storage.

### Planned v1.11 Phase Sequence

- Phase 59: add the `ImportChunk` schema, settings, and chunk-sizing logic without changing runtime behavior.
- Phase 60: split large CSVs into chunk records and process them concurrently with child workers.
- Phase 61: aggregate parent progress from chunk data, merge error reports, and finalize exactly once.
- Phase 62: harden chunk failure isolation, cancellation propagation, crash resume, and deadlock prevention.
- Phase 63: offload secondary work such as phone creation and geometry updates from the critical path.
- Phase 64: expose throughput, ETA, and partial-failure status clearly in the UI.

### Why v1.11 Follows v1.10

The folder’s planning trail shows a clear sequence:

- `v1.6` made imports scalable enough to run as background work.
- `v1.10` made that background work recoverable and operationally safe.
- `v1.11` is intended to make large imports materially faster without giving up the resilience already established.

## Important Planning Decisions

- Chunked child jobs were chosen over staging tables or producer-consumer pipelines.
- Application-level progress tracking is preferred over queue-internal state for recovery.
- Advisory locks are the main coordination primitive for correctness-sensitive transitions.
- Progress should be aggregated from durable per-unit state, not from race-prone distributed counters.
- Secondary work should move out of the critical path when correctness does not require it inline.

## Architecture Direction In Plain Terms

The current import architecture direction is:

- keep a single parent import job as the user-visible object
- split large CSV work into multiple hidden chunk jobs
- let each chunk process a bounded row range independently
- store progress and recovery state per chunk
- compute parent totals from chunk state instead of trusting in-memory counters
- finalize once, under a lock, after all chunk outcomes are known

This keeps the user-facing import model simple while allowing internal concurrency and finer-grained recovery.

## Recurring Themes Across the Folder

- Milestone audits repeatedly found real integration gaps late and were valuable enough to become a normal part of delivery.
- Shared infrastructure work early in a milestone usually paid off across later phases.
- Verification, validation, and test scaffolding became increasingly explicit over time.
- Import work has become the dominant technical focus in the most recent milestones.
- Documentation quality improved, but recurring process debt remains around roadmap checkbox/progress updates and summary metadata consistency.

## Deferred Or Follow-On Work Already Surfaced

- Periodic background reconciliation for orphaned imports beyond worker startup.
- Additional import throughput work in `v1.11`, including chunk resilience, completion aggregation, UI throughput reporting, and secondary work offloading.
- A dormant seed to modularize `app/services/import_service.py` when the next import-focused milestone touches that area again.

## Process Lessons Preserved From The Retrospectives

- Shared foundations built early tend to reduce duplication and speed later phases.
- Milestone audits routinely found real bugs or integration gaps even after substantial implementation work.
- Validation and test coverage became more formal over time and were treated as delivery requirements, not optional cleanup.
- Gap-closure phases are normal in this project’s workflow; they are treated as evidence of honest verification rather than planning failure.
- Documentation discipline improved, but recurring admin issues remained around roadmap status updates and summary metadata consistency.

## Known Documentation Debt Captured Here

The planning history repeatedly notes small but persistent process issues:

- roadmap checkboxes and progress tables were not always updated accurately
- summary files often lacked a short `one_liner` field, making milestone rollups harder
- some milestone documents needed cleanup after audit-driven gap closure

Those issues did not change the core product direction, but they explain why this archive summary intentionally focuses on durable decisions and shipped outcomes instead of trusting every status artifact equally.

## Dormant Seed Worth Preserving

One explicit forward-looking idea was captured during import work: `app/services/import_service.py` had grown into a large monolith and should eventually be modularized when the import subsystem is touched again for performance or new formats. The suggested extraction targets were:

- canonical field definitions
- streaming CSV utilities
- format-specific helpers such as L2 parsing and mapping

This was described as preventive refactoring rather than urgent corrective work.

## Bottom Line

If the rest of `.planning` is archived, the durable takeaways are:

- the core campaign operations platform was built and shipped through multiple milestones
- imports became a major investment area, first for capability, then resilience, then speed
- the current unfinished work is a high-confidence plan to parallelize large imports with chunk-based processing
- recovery, locking, and durable progress tracking are foundational design choices that future work should preserve
- audit-driven verification was one of the most reliable quality mechanisms in the project’s planning history
