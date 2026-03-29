# Phase 53: Concurrent Safety & Cancellation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 53-concurrent-safety-cancellation
**Areas discussed:** Cancellation mechanism, Status lifecycle, Cancel endpoint design, Frontend cancel UX

---

## Cancellation Mechanism

### Cancel Signal Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| DB flag polling | Add `cancelled_at` to ImportJob; worker checks between batches via session.refresh(job). Simple, no new infra. | ✓ |
| Procrastinate job cancellation | Use built-in cancel_job(). Tighter coupling to task queue internals. | |
| Redis pub/sub | Publish cancel event to Redis channel; worker subscribes. Fast but adds dependency. | |

**User's choice:** DB flag polling
**Notes:** Recommended approach — uses existing DB session, no new infrastructure.

### Check Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Between batches only | Check after each _process_single_batch() call. Worst-case delay is one batch cycle. | ✓ |
| Between batches + mid-stream | Also check every N rows during batch accumulation. Faster but more complex. | |

**User's choice:** Between batches only
**Notes:** Acceptable worst-case delay (~seconds per batch of 1000 rows).

### Last Batch Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Commit current batch | Finish and commit current batch before stopping. Maximizes preserved work. | ✓ |
| Discard current batch | Rollback in-progress batch, stop immediately. Loses up to 1000 rows. | |

**User's choice:** Commit current batch
**Notes:** Matches SC1: "stops after the current batch completes."

### Error Report on Cancel

| Option | Description | Selected |
|--------|-------------|----------|
| Merge errors | Merge per-batch error CSVs into errors.csv on cancel, same as completion. | ✓ |
| Leave per-batch files | Skip merge. Error data exists but isn't consolidated. | |

**User's choice:** Merge errors
**Notes:** User gets downloadable report for the partial import.

---

## Status Lifecycle

### Status Representation

| Option | Description | Selected |
|--------|-------------|----------|
| Two-phase: CANCELLING → CANCELLED | Cancel endpoint sets CANCELLING; worker transitions to CANCELLED. Frontend can show "Cancelling..." | ✓ |
| Single CANCELLED status | Cancel sets cancelled_at, worker transitions to CANCELLED. Can't distinguish request from completion. | |
| No new status — cancelled_at only | Use timestamp presence. Worker sets COMPLETED with note. | |

**User's choice:** Two-phase: CANCELLING → CANCELLED
**Notes:** Enables clear frontend UX during the grace period.

### Resumability

| Option | Description | Selected |
|--------|-------------|----------|
| Final — no resume | CANCELLED is terminal. User starts fresh. Simple state model. | ✓ |
| Resumable | User can resume from where it stopped. Adds CANCELLED → QUEUED transition. | |

**User's choice:** Final — no resume
**Notes:** last_committed_row preserved for reference only.

---

## Cancel Endpoint Design

### REST Verb and Path

| Option | Description | Selected |
|--------|-------------|----------|
| POST /imports/{id}/cancel | Action-style sub-resource. Clear intent, no DELETE ambiguity. | ✓ |
| DELETE /imports/{id} | RESTful but implies record deletion, not processing stop. | |
| PATCH /imports/{id} | Pure REST status update. Less discoverable. | |

**User's choice:** POST /imports/{id}/cancel
**Notes:** Consistent with campaign-scoped pattern.

### Authorization Level

| Option | Description | Selected |
|--------|-------------|----------|
| Admin (same as start import) | Consistent with existing import endpoints. | ✓ |
| Manager+ | Broader access for team leads. | |
| The user who started it | Requires tracking import initiator. | |

**User's choice:** Admin (same as start import)

### Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| 202 Accepted + ImportJobResponse | Async operation accepted. Shows status=CANCELLING. Frontend polls. | ✓ |
| 200 OK + ImportJobResponse | Synchronous success. Slightly misleading. | |
| 204 No Content | Fire-and-forget. Must poll separately. | |

**User's choice:** 202 Accepted + ImportJobResponse
**Notes:** Consistent with confirm_mapping's 202 pattern.

---

## Frontend Cancel UX

### Button Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Import status polling view | Cancel button on progress page, visible during PROCESSING/QUEUED. | ✓ |
| Import list + polling view | Cancel on both list and detail views. More discoverable but complex. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Import status polling view

### Confirmation Dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, confirmation dialog | ConfirmDialog: "Cancel this import? Already-imported rows will be kept." | ✓ |
| No confirmation | Single click cancels. Faster but riskier. | |

**User's choice:** Yes, confirmation dialog
**Notes:** Uses existing ConfirmDialog component from shared/.

### CANCELLING State Display

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled button + "Cancelling..." text | Replace cancel button with disabled indicator. Progress continues. | ✓ |
| Redirect to imports list | Navigate away after cancel request. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Disabled button + "Cancelling..." text
**Notes:** Progress display continues showing committed rows until CANCELLED.

---

## Claude's Discretion

- Alembic migration details
- Exact cancel check placement in process_import_file()
- Whether to add cancelled_by column
- Structured logging
- Test approach
- Frontend polling interval during CANCELLING

## Deferred Ideas

None — discussion stayed within phase scope
