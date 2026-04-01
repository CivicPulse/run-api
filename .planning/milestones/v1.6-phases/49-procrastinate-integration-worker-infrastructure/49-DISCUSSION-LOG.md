# Phase 49: Procrastinate Integration & Worker Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 49-procrastinate-integration-worker-infrastructure
**Areas discussed:** Schema management, Worker entrypoint & health, Queueing lock strategy, Job state reconciliation

---

## Schema Management

### Q1: How should Procrastinate's schema be provisioned?

| Option | Description | Selected |
|--------|-------------|----------|
| Alembic migration | Dump Procrastinate's SQL into an Alembic migration. Single migration tool for everything — consistent with existing pattern. Rollback works normally. | ✓ |
| apply_schema() at startup | Call app.admin.apply_schema() in API/worker lifespan. Simpler setup but schema changes happen outside Alembic — invisible to migration history. | |
| You decide | Claude picks the best approach based on codebase patterns | |

**User's choice:** Alembic migration
**Notes:** None

### Q2: Should Procrastinate tables live in a separate schema or public?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate schema | Clean separation — Procrastinate tables in `procrastinate` schema, app tables in `public`. Avoids namespace collisions. RLS policies stay focused. | ✓ |
| Public schema | Everything in one schema. Simpler config but mixes infrastructure tables with domain tables. | |
| You decide | Claude picks based on what works best with existing RLS setup | |

**User's choice:** Separate schema
**Notes:** None

---

## Worker Entrypoint & Health

### Q3: How should the worker process start?

| Option | Description | Selected |
|--------|-------------|----------|
| Programmatic script | A `scripts/worker.py` that initializes Sentry + structlog, creates ProcrastinateApp with PsycopgConnector, calls run_worker_async(). Matches existing pattern for init. | ✓ |
| Procrastinate CLI | `procrastinate worker` command in Dockerfile CMD. Less boilerplate but harder to integrate Sentry/structlog and share app config. | |
| You decide | Claude picks based on existing infrastructure patterns | |

**User's choice:** Programmatic script
**Notes:** None

### Q4: Health probe strategy for the worker container?

| Option | Description | Selected |
|--------|-------------|----------|
| Liveness file touch | Worker touches a file on each job loop iteration. K8s liveness probe checks file age. Simple, no HTTP server needed. | |
| HTTP health endpoint | Worker runs a tiny HTTP server (e.g., on :8001) for /healthz. More standard K8s pattern but adds complexity. | ✓ |
| Process check only | K8s checks if the process is running (default). Simplest but won't detect a hung worker. | |
| You decide | Claude picks the simplest reliable approach | |

**User's choice:** HTTP health endpoint
**Notes:** None

---

## Queueing Lock Strategy

### Q5: How should the queueing lock be structured for imports?

| Option | Description | Selected |
|--------|-------------|----------|
| campaign_id as lock | Use `queueing_lock=str(campaign_id)` when deferring. Procrastinate rejects duplicates. Foundation for Phase 53 cancellation. | ✓ |
| No lock yet | Skip queueing locks in Phase 49, let Phase 53 handle everything. Risk: concurrent imports could conflict. | |
| You decide | Claude picks based on Procrastinate's API and risk assessment | |

**User's choice:** campaign_id as lock
**Notes:** None

### Q6: When a second import is rejected by the lock, what should the API return?

| Option | Description | Selected |
|--------|-------------|----------|
| 409 Conflict | Return 409 with clear message. Consistent with existing 409 usage in confirm_mapping. | ✓ |
| 422 Unprocessable | Return 422 — valid but can't be fulfilled now. Less standard for this case. | |
| You decide | Claude picks the most appropriate HTTP status | |

**User's choice:** 409 Conflict
**Notes:** None

---

## Job State Reconciliation

### Q7: How should ImportJob.status relate to Procrastinate's job state?

| Option | Description | Selected |
|--------|-------------|----------|
| ImportJob is source of truth | Keep ImportJob.status as the single source for business status. Procrastinate's internal state is infrastructure-only. | ✓ |
| Dual tracking with sync | Track both and sync them. More complex but full audit trail. | |
| You decide | Claude picks the cleanest approach given existing patterns | |

**User's choice:** ImportJob is source of truth
**Notes:** None

### Q8: Should confirm_mapping change from 201 to 202 Accepted?

| Option | Description | Selected |
|--------|-------------|----------|
| 202 Accepted | Per BGND-01. Signals job is queued but not yet complete. Matches industry convention. | ✓ |
| Keep 201 Created | The import job record IS created synchronously. Could confuse frontend polling. | |
| You decide | Claude picks based on requirements and existing frontend code | |

**User's choice:** 202 Accepted
**Notes:** None

---

## Claude's Discretion

- PsycopgConnector connection pool sizing
- Procrastinate queue naming convention
- Worker graceful shutdown signal handling
- Docker Compose/K8s resource limits
- Procrastinate App singleton structure

## Deferred Ideas

None — discussion stayed within phase scope
